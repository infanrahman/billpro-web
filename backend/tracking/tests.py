import uuid

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from .models import Company, Branch, InventoryItem, Sale, Purchase, TrackingUser, SyncedRecord, Shift


class PersistenceTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="First company")
        self.other = Company.objects.create(name="Second company")
        self.branch = Branch.objects.create(company=self.company, name="Main")
        self.admin = TrackingUser.objects.create_superuser(username="test-admin", password="test-only-password")
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def test_created_records_are_returned_in_overview(self):
        inventory = self.client.post("/api/inventory/", {
            "company": str(self.company.pk), "branch": str(self.branch.pk),
            "name": "Test product", "sale_price": "11.50", "stock": 5,
        }, format="json")
        self.assertEqual(inventory.status_code, 201, inventory.data)
        for resource, fields in [
            ("customers", {"name": "Customer"}),
            ("suppliers", {"name": "Supplier"}),
            ("expenses", {"description": "Delivery", "amount": "2.00"}),
            ("cash-entries", {"description": "Cash received", "amount": "3.00", "entry_type": "in"}),
        ]:
            response = self.client.post(f"/api/{resource}/", {"company": str(self.company.pk), **fields}, format="json")
            self.assertEqual(response.status_code, 201, response.data)
        sale = self.client.post("/api/sales/", {
            "company": str(self.company.pk), "invoice_number": "WEB-1", "grand_total": "11.50",
            "items": [{"item": inventory.data["id"], "name": "Test product", "quantity": 1, "price": "11.50"}],
        }, format="json")
        self.assertEqual(sale.status_code, 201, sale.data)
        self.assertEqual(Sale.objects.get(pk=sale.data["id"]).items.count(), 1)
        purchase = self.client.post("/api/purchases/", {
            "company": str(self.company.pk), "order_number": "PO-1", "total_amount": "10.00",
            "items": [{"item": inventory.data["id"], "name": "Test product", "quantity": 1, "cost": "10.00"}],
        }, format="json")
        self.assertEqual(purchase.status_code, 201, purchase.data)
        self.assertEqual(Purchase.objects.get(pk=purchase.data["id"]).items.count(), 1)
        result = self.client.get("/api/overview/", {"companyId": str(self.company.pk)})
        self.assertEqual(result.status_code, 200, result.data)
        for resource in ["inventory", "sales", "purchases", "customers", "suppliers", "expenses", "cashbook"]:
            self.assertEqual(len(result.data["records"][resource]), 1, resource)

    def test_sync_users_do_not_roll_back_business_data_or_modify_web_accounts(self):
        stamp = timezone.now().isoformat()
        source_user = str(uuid.uuid4())
        item_id = str(uuid.uuid4())
        invoice_id = str(uuid.uuid4())
        changes = {
            "branches": [{"id": str(self.branch.pk), "name": self.branch.name}],
            "users": [{"id": source_user, "username": self.admin.username, "name": "POS employee", "role": "owner"}],
            "inventory": [{"id": item_id, "name": "Desktop product", "salePrice": 23, "stock": 8}],
            "sales": [{"id": invoice_id, "invoiceNumber": "POS-1", "grandTotal": 23, "items": [{"itemId": item_id, "name": "Desktop product", "quantity": 1, "price": 23}]}],
            "shifts": [{"id": str(uuid.uuid4()), "userId": source_user, "username": "POS employee"}],
        }
        for rows in changes.values():
            for row in rows:
                row.update(companyId=str(self.company.pk), branchId=str(self.branch.pk), updatedAt=stamp)
        data = {"deviceId": "test-desktop", "batchId": "first-batch", "scope": {"companyId": str(self.company.pk)}, "changes": changes}
        response = self.client.post("/api/sync/push", data, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["accepted"], 5)
        self.assertEqual(response.data["rejected"], 0)
        self.assertEqual(Sale.objects.get(pk=invoice_id).items.count(), 1)
        self.assertEqual(InventoryItem.objects.get(pk=item_id).name, "Desktop product")
        employee = TrackingUser.objects.exclude(pk=self.admin.pk).get()
        self.assertIsInstance(employee.pk, int)
        self.assertFalse(employee.has_usable_password())
        self.assertFalse(employee.is_superuser)
        self.assertEqual(Shift.objects.get().user_id, employee.pk)
        self.admin.refresh_from_db()
        self.assertTrue(self.admin.check_password("test-only-password"))
        data["batchId"] = "second-batch"
        retry = self.client.post("/api/sync/push/", data, format="json")
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(SyncedRecord.objects.count(), 5)
        self.assertEqual(TrackingUser.objects.count(), 2)

    def test_company_scoping_and_admin_created_data(self):
        InventoryItem.objects.create(company=self.company, name="Created in admin")
        InventoryItem.objects.create(company=self.other, name="Other company")
        reader = TrackingUser.objects.create_user(username="reader", password="test-only-password")
        reader.companies.add(self.company)
        self.client.force_authenticate(reader)
        response = self.client.get("/api/overview/")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row["name"] for row in response.data["records"]["inventory"]], ["Created in admin"])
        self.assertEqual(self.client.get("/api/companies/").status_code, 200)
        self.assertEqual(self.client.get("/api/overview/", {"companyId": str(self.other.pk)}).status_code, 403)
        self.assertEqual(self.client.post("/api/inventory/", {"company": str(self.other.pk), "name": "Forbidden"}).status_code, 403)
        reader.companies.clear()
        response = self.client.get("/api/overview/")
        self.assertTrue(response.data["accessMessage"])
        self.assertEqual(response.data["records"]["inventory"], [])

    def test_mismatched_branch_and_foreign_line_item_are_rejected(self):
        foreign = InventoryItem.objects.create(company=self.other, name="Foreign")
        response = self.client.post("/api/sales/", {
            "company": str(self.company.pk), "invoice_number": "INVALID",
            "items": [{"item": str(foreign.pk), "name": "Foreign", "quantity": 1}],
        }, format="json")
        self.assertEqual(response.status_code, 400, response.data)
        self.assertFalse(Sale.objects.exists())
        response = self.client.post("/api/inventory/", {
            "company": str(self.other.pk), "branch": str(self.branch.pk), "name": "Wrong branch",
        }, format="json")
        self.assertEqual(response.status_code, 400, response.data)

    def test_sync_token_and_assigned_web_user_can_read_saved_data(self):
        created = self.client.post("/api/users/", {
            "username": "web-reader", "password": "test-only-password", "role": "cashier",
            "company_ids": [str(self.company.pk)], "branch_ids": [str(self.branch.pk)],
        }, format="json")
        self.assertEqual(created.status_code, 201, created.data)
        self.client.force_authenticate(None)
        login = self.client.post("/api/auth/login/", {"username": "web-reader", "password": "test-only-password"}, format="json")
        self.assertEqual(login.status_code, 200, login.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['token']}")
        token = self.client.post("/api/tokens/", {"name": "Desktop sync", "daysValid": 90}, format="json")
        self.assertEqual(token.status_code, 201, token.data)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token.data['token']}")
        result = self.client.get("/api/overview/")
        self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(len(result.data["companies"]), 1)
        self.assertFalse(result.data["accessMessage"])
