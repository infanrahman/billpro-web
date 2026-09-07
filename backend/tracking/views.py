import hashlib
import logging
import secrets
import uuid

from django.contrib.auth import authenticate
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import status, viewsets
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from .authentication import token_expiry
from .models import (
    AccessToken, ActivityLog, AuditEntry, Branch, CashEntry, CashParty, Category,
    Company, Customer, CustomerPayment, Device, Expense, InventoryItem, Notification,
    Purchase, PurchaseItem, PurchasePayment, Sale, SaleItem, Scale, ScaleSyncLog,
    Shift, Spreadsheet, Supplier, SyncedRecord, SyncBatch, TrackingUser, Transaction,
)
from .permissions import IsTrackingAdmin, has_branch_access, has_company_access
from .serializers import (
    ActivityLogSerializer, AuditEntrySerializer, BranchSerializer, CashEntrySerializer,
    CashPartySerializer, CategorySerializer, CompanySerializer, CustomerPaymentSerializer,
    CustomerSerializer, DeviceSerializer, ExpenseSerializer, InventoryItemSerializer,
    LoginSerializer, NotificationSerializer, PurchaseItemSerializer, PurchasePaymentSerializer,
    PurchaseSerializer, SaleItemSerializer, SaleSerializer, ScaleSerializer,
    ScaleSyncLogSerializer, ShiftSerializer, SpreadsheetSerializer, SupplierSerializer,
    SyncedRecordSerializer, SyncBatchSerializer, SyncPushSerializer, TrackingUserSerializer,
    TransactionSerializer,
)


logger = logging.getLogger(__name__)


def canonical_uuid(value):
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        return uuid.uuid5(uuid.NAMESPACE_URL, f"billing-pos:{value}")


def incoming_time(value):
    parsed = parse_datetime(str(value)) if value else None
    if not parsed:
        return timezone.now()
    return timezone.make_aware(parsed) if timezone.is_naive(parsed) else parsed


def json_id(value):
    return str(value) if value is not None else ""


def company_record_from_changes(changes, company_id):
    return next(
        (record for record in changes.get("companies", []) or [] if json_id(record.get("id")) == company_id),
        {},
    )


def ensure_company(company_id, changes):
    raw_id = json_id(company_id)
    source = company_record_from_changes(changes, raw_id)
    company, _ = Company.objects.get_or_create(
        pk=canonical_uuid(raw_id),
        defaults={
            "name": source.get("name") or source.get("legalName") or "POS Company",
            "legal_name": source.get("legalName", ""),
            "vat_number": source.get("vatNumber", ""),
            "cr_number": source.get("crNumber", ""),
            "email": source.get("email", ""),
            "phone": source.get("phone", ""),
            "address": source.get("address", ""),
            "country": source.get("country", ""),
            "logo_url": source.get("logoUrl", ""),
            "status": source.get("status", "active"),
        },
    )
    updates = {
        "name": source.get("name"),
        "legal_name": source.get("legalName"),
        "vat_number": source.get("vatNumber"),
        "cr_number": source.get("crNumber"),
        "email": source.get("email"),
        "phone": source.get("phone"),
        "address": source.get("address"),
        "country": source.get("country"),
        "logo_url": source.get("logoUrl"),
        "status": source.get("status"),
    }
    changed = False
    for field, value in updates.items():
        if value not in (None, "") and getattr(company, field) != value:
            setattr(company, field, value)
            changed = True
    if changed:
        company.save(update_fields=[*updates.keys(), "updated_at"])
    return company


def ensure_branch(record, company):
    raw_id = json_id(record.get("id"))
    if not raw_id:
        return None
    branch, _ = Branch.objects.update_or_create(
        pk=canonical_uuid(raw_id),
        defaults={
            "company": company,
            "name": record.get("name") or "Unnamed branch",
            "location": record.get("location", ""),
            "phone": record.get("phone", ""),
            "email": record.get("email", ""),
            "gstin": record.get("gstin", ""),
            "vat_no": record.get("vatNo", record.get("vat_no", "")),
            "cr_no": record.get("crNo", record.get("cr_no", "")),
            "country": record.get("country", ""),
            "tax_name": record.get("taxName", record.get("tax_name", "")),
            "tax_rate": record.get("taxRate", record.get("tax_rate", 0)) or 0,
            "is_master": bool(record.get("isMaster", record.get("master", False))),
            "status": record.get("status", "active"),
        },
    )
    return branch


ENTITY_KINDS = {
    "sales": "sale", "invoices": "sale", "purchases": "purchase",
    "expenses": "expense", "cashbook": "cashbook",
    "customerPayments": "customer_payment", "purchasePayments": "purchase_payment",
}


def materialize_record(entity, record, company, branch):
    """Fill typed reporting tables while SyncedRecord keeps the complete POS payload."""
    raw_id = record.get("id")
    if not raw_id:
        return
    model_id = canonical_uuid(raw_id)
    common = {"company": company, "branch": branch}
    def related(model, value):
        if not value:
            return None
        queryset = model.objects.filter(pk=canonical_uuid(value))
        if model is not TrackingUser:
            queryset = queryset.filter(company=company)
        return queryset.first()

    def number(value, default=0):
        return value if value not in (None, "") else default
    if entity == "users":
        role = record.get("role") if record.get("role") in {"owner", "admin", "manager", "cashier", "accountant", "inventory"} else "cashier"
        username = record.get("username") or f"pos-{str(model_id)[:8]}"
        user = TrackingUser.objects.filter(pk=model_id).first() or TrackingUser.objects.filter(username=username).first()
        if not user:
            user = TrackingUser.objects.create(
                pk=model_id, username=username, name=record.get("name", ""), role=role,
                permissions_json=record.get("permissions", []), is_active=record.get("status", "active") != "inactive",
            )
        user.name = record.get("name", user.name)
        user.role = role
        user.permissions_json = record.get("permissions", user.permissions_json)
        user.is_active = record.get("status", "active") != "inactive"
        user.save(update_fields=["name", "role", "permissions_json", "is_active"])
        user.companies.add(company)
        if branch:
            user.branches.add(branch)
    elif entity == "companies":
        Company.objects.update_or_create(
            pk=model_id,
            defaults={
                "name": record.get("name") or record.get("legalName") or "POS Company",
                "legal_name": record.get("legalName", ""),
                "vat_number": record.get("vatNumber", ""),
                "cr_number": record.get("crNumber", ""),
                "email": record.get("email", ""),
                "phone": record.get("phone", ""),
                "address": record.get("address", ""),
                "country": record.get("country", ""),
                "logo_url": record.get("logoUrl", ""),
                "status": record.get("status", "active"),
            },
        )
    elif entity == "branches":
        ensure_branch(record, company)
    elif entity == "inventory":
        InventoryItem.objects.update_or_create(
            pk=model_id,
            defaults={
                **common, "name": record.get("name") or "Unnamed item",
                "arabic_name": record.get("arabicName", ""),
                "barcode": record.get("barcode", ""), "stock": record.get("stock", 0) or 0,
                "tax_type": record.get("taxType", "inclusive"), "tax_rate": number(record.get("taxRate")),
                "min_stock": record.get("minStock", 0) or 0, "sale_price": record.get("salePrice", 0) or 0,
                "purchase_price": record.get("purchasePrice", 0) or 0, "location": record.get("location", ""),
                "unit": record.get("unit", ""), "image": record.get("image", ""), "item_code": record.get("itemCode", ""),
                "category": related(Category, record.get("categoryId")), "supplier": related(Supplier, record.get("supplierId")), "metadata": record,
            },
        )
    elif entity == "categories":
        Category.objects.update_or_create(
            pk=model_id,
            defaults={**common, "name": record.get("name") or "Unnamed category", "description": record.get("description", ""), "color": record.get("color", ""), "icon": record.get("icon", "")},
        )
    elif entity == "customers":
        Customer.objects.update_or_create(
            pk=model_id,
            defaults={**common, "name": record.get("name") or "Unnamed customer", "phone": record.get("phone", ""), "balance": record.get("balance", 0) or 0, "metadata": record},
        )
    elif entity == "suppliers":
        Supplier.objects.update_or_create(
            pk=model_id,
            defaults={**common, "name": record.get("name") or "Unnamed supplier", "phone": record.get("phone", ""), "balance": record.get("balance", 0) or 0, "metadata": record},
        )
    elif entity in ENTITY_KINDS:
        Transaction.objects.update_or_create(
            pk=model_id,
            defaults={
                **common, "kind": ENTITY_KINDS[entity],
                "reference": record.get("invoiceNumber") or record.get("orderNumber") or record.get("reference", ""),
                "amount": record.get("grandTotal") or record.get("totalAmount") or record.get("amount") or 0,
                "status": record.get("paymentStatus") or record.get("status", ""),
                "transaction_date": incoming_time(record.get("date") or record.get("createdAt") or record.get("updatedAt")),
                "metadata": record,
            },
        )
        if entity in {"sales", "invoices"}:
            sale, _ = Sale.objects.update_or_create(
                pk=model_id,
                defaults={**common, "invoice_number": record.get("invoiceNumber", ""), "token_number": record.get("tokenNumber", ""), "customer": related(Customer, record.get("customerId")), "customer_name": record.get("customerName", ""), "customer_phone": record.get("customerPhone", ""), "customer_contact": record.get("customerContact", ""), "customer_vat_number": record.get("customerVatNumber", ""), "customer_address": record.get("customerAddress", ""), "subtotal": number(record.get("subTotal")), "tax_amount": number(record.get("taxAmount")), "discount_amount": number(record.get("discountAmount")), "grand_total": number(record.get("grandTotal")), "paid_amount": number(record.get("paidAmount")), "remaining_amount": number(record.get("remainingAmount")), "payment_mode": record.get("paymentMode", "cash"), "payment_status": record.get("paymentStatus", "paid"), "due_date": incoming_time(record.get("dueDate")) if record.get("dueDate") else None, "tax_rate": number(record.get("taxRate")), "tax_type": record.get("taxType", ""), "invoice_type": record.get("type", "invoice"), "order_type": record.get("orderType", ""), "status": record.get("status", ""), "notes": record.get("notes", ""), "zatca_status": record.get("zatcaStatus", ""), "zatca_hash": record.get("zatcaHash", ""), "zatca_error": record.get("zatcaError", ""), "shift": related(Shift, record.get("shiftId")), "metadata": record},
            )
            SaleItem.objects.filter(sale=sale).delete()
            for line in record.get("items", []) or []:
                SaleItem.objects.create(sale=sale, item=related(InventoryItem, line.get("itemId")), source_item_id=json_id(line.get("itemId")), name=line.get("name", ""), name_ar=line.get("arabicName") or line.get("nameAr", ""), quantity=number(line.get("quantity")), price=number(line.get("price")), total=number(line.get("total")), unit=line.get("unit", ""), tax_type=line.get("taxType", ""), tax_rate=number(line.get("taxRate")), tax_amount=number(line.get("taxAmount")), discount_amount=number(line.get("discountAmount")), net_amount=number(line.get("netAmount")), purchase_price=number(line.get("purchasePrice")))
        elif entity == "expenses":
            Expense.objects.update_or_create(pk=model_id, defaults={**common, "description": record.get("description", ""), "amount": number(record.get("amount")), "category": record.get("category", ""), "date": incoming_time(record.get("date") or record.get("updatedAt")), "notes": record.get("notes", ""), "receipt": record.get("receipt", ""), "metadata": record})
        elif entity == "purchases":
            purchase, _ = Purchase.objects.update_or_create(pk=model_id, defaults={**common, "order_number": record.get("orderNumber", ""), "supplier": related(Supplier, record.get("supplierId")), "supplier_name": record.get("supplierName", ""), "subtotal": number(record.get("subTotal")), "tax_amount": number(record.get("taxAmount")), "total_amount": number(record.get("totalAmount")), "date": incoming_time(record.get("date") or record.get("updatedAt")), "due_date": incoming_time(record.get("dueDate")) if record.get("dueDate") else None, "payment_type": record.get("paymentType", ""), "paid_amount": number(record.get("paidAmount")), "notes": record.get("notes", ""), "purchase_type": record.get("type", ""), "status": record.get("status", ""), "related_order": related(Purchase, record.get("relatedOrderId")), "metadata": record})
            PurchaseItem.objects.filter(purchase=purchase).delete()
            for line in record.get("items", []) or []:
                PurchaseItem.objects.create(purchase=purchase, item=related(InventoryItem, line.get("itemId")), source_item_id=json_id(line.get("itemId")), name=line.get("name", ""), quantity=number(line.get("quantity")), cost=number(line.get("cost")), unit=line.get("unit", ""), tax_rate=number(line.get("taxRate")), tax_type=line.get("taxType", ""), tax_amount=number(line.get("taxAmount")), total=number(line.get("total")))
        elif entity == "customerPayments":
            CustomerPayment.objects.update_or_create(pk=model_id, defaults={**common, "customer": related(Customer, record.get("customerId")), "amount": number(record.get("amount")), "date": incoming_time(record.get("date") or record.get("updatedAt")), "payment_mode": record.get("paymentMode", "cash"), "reference": record.get("reference", ""), "note": record.get("note", ""), "metadata": record})
        elif entity == "purchasePayments":
            PurchasePayment.objects.update_or_create(pk=model_id, defaults={**common, "purchase": related(Purchase, record.get("purchaseId")), "supplier": related(Supplier, record.get("supplierId")), "amount": number(record.get("amount")), "date": incoming_time(record.get("date") or record.get("updatedAt")), "payment_mode": record.get("paymentMode", "cash"), "reference": record.get("reference", ""), "note": record.get("note", ""), "metadata": record})
        elif entity == "cashbook":
            CashEntry.objects.update_or_create(pk=model_id, defaults={**common, "entry_type": record.get("type", "in"), "amount": number(record.get("amount")), "date": incoming_time(record.get("date") or record.get("updatedAt")), "category": record.get("category", ""), "description": record.get("description", ""), "payment_mode": record.get("paymentMode", "cash"), "party": related(CashParty, record.get("partyId")), "metadata": record})
    elif entity == "cashParties":
        CashParty.objects.update_or_create(pk=model_id, defaults={**common, "name": record.get("name", ""), "phone": record.get("phone", ""), "opening_balance": number(record.get("openingBalance")), "party_type": record.get("type", "other")})
    elif entity == "notifications":
        Notification.objects.update_or_create(pk=model_id, defaults={**common, "title": record.get("title", ""), "message": record.get("message", ""), "notification_type": record.get("type", "info"), "date": incoming_time(record.get("date") or record.get("updatedAt")), "read": bool(record.get("read", False)), "reference_id": json_id(record.get("referenceId")), "reference_type": record.get("referenceType", "")})
    elif entity == "activityLogs":
        ActivityLog.objects.update_or_create(pk=model_id, defaults={**common, "user": related(TrackingUser, record.get("userId")), "username": record.get("username", ""), "action": record.get("action", ""), "details": record.get("details", ""), "timestamp": incoming_time(record.get("timestamp") or record.get("updatedAt"))})
    elif entity == "spreadsheets":
        Spreadsheet.objects.update_or_create(pk=model_id, defaults={**common, "name": record.get("name", ""), "description": record.get("description", ""), "data": record.get("data", []), "headers": record.get("headers", []), "styles": record.get("styles", {}), "col_widths": record.get("colWidths", {}), "row_heights": record.get("rowHeights", {})})
    elif entity == "shifts":
        Shift.objects.update_or_create(pk=model_id, defaults={**common, "user": related(TrackingUser, record.get("userId")), "username": record.get("username", ""), "open_time": incoming_time(record.get("openTime") or record.get("updatedAt")), "close_time": incoming_time(record.get("closeTime")) if record.get("closeTime") else None, "opening_float": number(record.get("openingFloat")), "actual_cash": record.get("actualCash"), "expected_cash": record.get("expectedCash"), "total_cash_sales": number(record.get("totalCashSales")), "total_card_sales": number(record.get("totalCardSales")), "total_upi_sales": number(record.get("totalUpiSales")), "total_credit_sales": number(record.get("totalCreditSales")), "status": record.get("status", "open"), "notes": record.get("notes", "")})
    elif entity == "scales":
        Scale.objects.update_or_create(pk=model_id, defaults={**common, "name": record.get("name", ""), "ip_address": record.get("ipAddress") or "0.0.0.0", "port": int(record.get("port") or 0), "model": record.get("model", ""), "status": record.get("status", "unknown"), "last_sync": incoming_time(record.get("lastSync")) if record.get("lastSync") else None})
    elif entity == "scaleLogs":
        ScaleSyncLog.objects.update_or_create(pk=model_id, defaults={**common, "scale": related(Scale, record.get("scaleId")), "scale_ip": record.get("scaleIp") or "0.0.0.0", "action": record.get("action", ""), "plu_no": record.get("pluNo", ""), "status": record.get("status", "success"), "response": record.get("response", "")})


class ScopedModelViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    company_field = "company"

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(**{f"{self.company_field}__in": self.request.user.companies.values_list("pk", flat=True)})

    def perform_create(self, serializer):
        from rest_framework.exceptions import PermissionDenied
        company = serializer.validated_data.get("company")
        branch = serializer.validated_data.get("branch")
        if company and not has_company_access(self.request.user, company):
            raise PermissionDenied("You do not have access to this company")
        if branch and not has_branch_access(self.request.user, branch):
            raise PermissionDenied("You do not have access to this branch")
        serializer.save()


class CompanyViewSet(ScopedModelViewSet):
    queryset = Company.objects.all()
    serializer_class = CompanySerializer


class BranchViewSet(ScopedModelViewSet):
    queryset = Branch.objects.select_related("company").all()
    serializer_class = BranchSerializer


class UserViewSet(viewsets.ModelViewSet):
    queryset = TrackingUser.objects.prefetch_related("companies", "branches").all()
    serializer_class = TrackingUserSerializer
    permission_classes = [IsTrackingAdmin]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(companies__in=self.request.user.companies.all()).distinct()


class DeviceViewSet(ScopedModelViewSet):
    queryset = Device.objects.select_related("company", "branch").all()
    serializer_class = DeviceSerializer
    http_method_names = ["get", "head", "options", "patch"]


class InventoryViewSet(ScopedModelViewSet):
    queryset = InventoryItem.objects.select_related("company", "branch").all()
    serializer_class = InventoryItemSerializer


class CustomerViewSet(ScopedModelViewSet):
    queryset = Customer.objects.select_related("company", "branch").all()
    serializer_class = CustomerSerializer


class SupplierViewSet(ScopedModelViewSet):
    queryset = Supplier.objects.select_related("company", "branch").all()
    serializer_class = SupplierSerializer


class CategoryViewSet(ScopedModelViewSet):
    queryset = Category.objects.select_related("company", "branch").all()
    serializer_class = CategorySerializer


class SaleViewSet(ScopedModelViewSet):
    queryset = Sale.objects.select_related("company", "branch", "customer", "shift").prefetch_related("items").all()
    serializer_class = SaleSerializer
    filterset_fields = ["payment_status", "status", "company", "branch"]


class SaleItemViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = SaleItem.objects.select_related("sale", "item").all()
    serializer_class = SaleItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(sale__company__in=self.request.user.companies.values_list("pk", flat=True))


class ExpenseViewSet(ScopedModelViewSet):
    queryset = Expense.objects.select_related("company", "branch").all()
    serializer_class = ExpenseSerializer
    filterset_fields = ["company", "branch", "category"]


class PurchaseViewSet(ScopedModelViewSet):
    queryset = Purchase.objects.select_related("company", "branch", "supplier", "related_order").prefetch_related("items").all()
    serializer_class = PurchaseSerializer
    filterset_fields = ["status", "purchase_type", "company", "branch"]


class PurchaseItemViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PurchaseItem.objects.select_related("purchase", "item").all()
    serializer_class = PurchaseItemSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = super().get_queryset()
        if self.request.user.is_superuser:
            return queryset
        return queryset.filter(purchase__company__in=self.request.user.companies.values_list("pk", flat=True))


class CustomerPaymentViewSet(ScopedModelViewSet):
    queryset = CustomerPayment.objects.select_related("company", "branch", "customer").all()
    serializer_class = CustomerPaymentSerializer


class PurchasePaymentViewSet(ScopedModelViewSet):
    queryset = PurchasePayment.objects.select_related("company", "branch", "purchase", "supplier").all()
    serializer_class = PurchasePaymentSerializer


class CashPartyViewSet(ScopedModelViewSet):
    queryset = CashParty.objects.select_related("company", "branch").all()
    serializer_class = CashPartySerializer


class CashEntryViewSet(ScopedModelViewSet):
    queryset = CashEntry.objects.select_related("company", "branch", "party").all()
    serializer_class = CashEntrySerializer


class NotificationViewSet(ScopedModelViewSet):
    queryset = Notification.objects.select_related("company", "branch").all()
    serializer_class = NotificationSerializer


class ActivityLogViewSet(ScopedModelViewSet):
    queryset = ActivityLog.objects.select_related("company", "branch", "user").all()
    serializer_class = ActivityLogSerializer
    http_method_names = ["get", "head", "options"]


class SpreadsheetViewSet(ScopedModelViewSet):
    queryset = Spreadsheet.objects.select_related("company", "branch").all()
    serializer_class = SpreadsheetSerializer


class ShiftViewSet(ScopedModelViewSet):
    queryset = Shift.objects.select_related("company", "branch", "user").all()
    serializer_class = ShiftSerializer


class ScaleViewSet(ScopedModelViewSet):
    queryset = Scale.objects.select_related("company", "branch").all()
    serializer_class = ScaleSerializer


class ScaleSyncLogViewSet(ScopedModelViewSet):
    queryset = ScaleSyncLog.objects.select_related("company", "branch", "scale").all()
    serializer_class = ScaleSyncLogSerializer
    http_method_names = ["get", "head", "options"]


class TransactionViewSet(ScopedModelViewSet):
    queryset = Transaction.objects.select_related("company", "branch").all()
    serializer_class = TransactionSerializer
    filterset_fields = ["kind", "status", "company", "branch"]


class SyncedRecordViewSet(ScopedModelViewSet):
    queryset = SyncedRecord.objects.select_related("company", "branch").all()
    serializer_class = SyncedRecordSerializer
    http_method_names = ["get", "head", "options"]


class AuditViewSet(ScopedModelViewSet):
    queryset = AuditEntry.objects.select_related("company", "branch", "actor").all()
    serializer_class = AuditEntrySerializer
    http_method_names = ["get", "head", "options"]


class SyncBatchViewSet(ScopedModelViewSet):
    queryset = SyncBatch.objects.select_related("company", "branch", "device").all()
    serializer_class = SyncBatchSerializer
    http_method_names = ["get", "head", "options"]


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    return Response({"ok": True, "service": "billing-api", "time": timezone.now().isoformat()})


@api_view(["POST"])
@permission_classes([AllowAny])
def login(request):
    payload = LoginSerializer(data=request.data)
    payload.is_valid(raise_exception=True)
    login_name = payload.validated_data["username"].strip()
    password = payload.validated_data["password"]
    user = authenticate(username=login_name, password=password)
    if not user:
        user = TrackingUser.objects.filter(username__iexact=login_name).first()
        if not user:
            user = TrackingUser.objects.filter(email__iexact=login_name).first()
        if user and not user.check_password(password):
            user = None
    if not user or not user.is_active:
        return Response({"error": "Invalid username or password"}, status=status.HTTP_401_UNAUTHORIZED)
    raw_token = f"bt_{secrets.token_urlsafe(36)}"
    access_token = AccessToken.objects.create(
        user=user, name=payload.validated_data.get("tokenName") or "API token",
        token_hash=hashlib.sha256(raw_token.encode()).hexdigest(), expires_at=token_expiry(),
    )
    return Response({"token": raw_token, "expiresAt": access_token.expires_at, "user": TrackingUserSerializer(user).data})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout(request):
    if getattr(request, "auth", None):
        request.auth.revoked_at = timezone.now()
        request.auth.save(update_fields=["revoked_at", "updated_at"])
    return Response({"ok": True})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(TrackingUserSerializer(request.user).data)


def serialize_overview_rows(serializer_class, queryset, entity):
    """Serialize overview rows independently so one legacy row cannot break the dashboard."""
    rows = []
    for instance in queryset:
        try:
            rows.append(serializer_class(instance).data)
        except Exception:
            logger.exception("Unable to serialize overview entity=%s id=%s", entity, getattr(instance, "pk", None))
    return rows


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def overview(request):
    user = request.user
    company_qs = (Company.objects.all() if user.is_superuser else user.companies.all()).filter(status="active")
    branch_qs = Branch.objects.filter(company__in=company_qs, status="active")
    scoped = lambda qs: qs if user.is_superuser else qs.filter(company__in=company_qs)
    principal = {
        "id": str(user.id),
        "name": user.display_name(),
        "role": "owner" if user.is_superuser else user.role,
        "permissions": user.permissions_json or [],
    }
    record_sources = {
        "users": TrackingUser.objects.filter(companies__in=company_qs).distinct(),
        "inventory": scoped(InventoryItem.objects.all()),
        "categories": scoped(Category.objects.all()),
        "customers": scoped(Customer.objects.all()),
        "suppliers": scoped(Supplier.objects.all()),
        "sales": scoped(Sale.objects.all()),
        "purchases": scoped(Purchase.objects.all()),
        "expenses": scoped(Expense.objects.all()),
        "cashParties": scoped(CashParty.objects.all()),
        "cashbook": scoped(CashEntry.objects.all()),
        "customerPayments": scoped(CustomerPayment.objects.all()),
        "purchasePayments": scoped(PurchasePayment.objects.all()),
        "notifications": scoped(Notification.objects.all()),
        "activityLogs": scoped(ActivityLog.objects.all()),
        "spreadsheets": scoped(Spreadsheet.objects.all()),
        "shifts": scoped(Shift.objects.all()),
        "scales": scoped(Scale.objects.all()),
        "scaleLogs": scoped(ScaleSyncLog.objects.all()),
    }
    record_serializers = {
        "users": TrackingUserSerializer,
        "inventory": InventoryItemSerializer,
        "categories": CategorySerializer,
        "customers": CustomerSerializer,
        "suppliers": SupplierSerializer,
        "sales": SaleSerializer,
        "purchases": PurchaseSerializer,
        "expenses": ExpenseSerializer,
        "cashParties": CashPartySerializer,
        "cashbook": CashEntrySerializer,
        "customerPayments": CustomerPaymentSerializer,
        "purchasePayments": PurchasePaymentSerializer,
        "notifications": NotificationSerializer,
        "activityLogs": ActivityLogSerializer,
        "spreadsheets": SpreadsheetSerializer,
        "shifts": ShiftSerializer,
        "scales": ScaleSerializer,
        "scaleLogs": ScaleSyncLogSerializer,
    }
    records = {
        key: serialize_overview_rows(record_serializers[key], queryset, key)
        for key, queryset in record_sources.items()
    }
    return Response({
        "principal": principal,
        "companies": serialize_overview_rows(CompanySerializer, company_qs, "companies"),
        "branches": serialize_overview_rows(BranchSerializer, branch_qs, "branches"),
        "counts": {
            "companies": company_qs.count(), "branches": branch_qs.count(),
            "users": TrackingUser.objects.filter(companies__in=company_qs).distinct().count(),
            "devices": scoped(Device.objects).count(), "inventory": scoped(InventoryItem.objects).count(),
            "categories": scoped(Category.objects).count(), "customers": scoped(Customer.objects).count(),
            "suppliers": scoped(Supplier.objects).count(), "sales": scoped(Sale.objects).count(),
            "purchases": scoped(Purchase.objects).count(), "expenses": scoped(Expense.objects).count(),
            "customerPayments": scoped(CustomerPayment.objects).count(), "purchasePayments": scoped(PurchasePayment.objects).count(),
            "cashParties": scoped(CashParty.objects).count(), "cashEntries": scoped(CashEntry.objects).count(),
            "notifications": scoped(Notification.objects).count(), "activityLogs": scoped(ActivityLog.objects).count(),
            "spreadsheets": scoped(Spreadsheet.objects).count(), "shifts": scoped(Shift.objects).count(),
            "scales": scoped(Scale.objects).count(), "scaleLogs": scoped(ScaleSyncLog.objects).count(),
            "transactions": scoped(Transaction.objects).count(), "syncedRecords": scoped(SyncedRecord.objects).count(),
        },
        "devices": serialize_overview_rows(DeviceSerializer, scoped(Device.objects).order_by("-last_seen_at")[:50], "devices"),
        "recentAudit": serialize_overview_rows(AuditEntrySerializer, scoped(AuditEntry.objects).order_by("-created_at")[:50], "audit"),
        "records": records,
    })


@api_view(["GET", "POST"])
@permission_classes([IsAuthenticated])
def tokens(request):
    if request.method == "GET":
        queryset = AccessToken.objects.filter(user=request.user).order_by("-created_at")
        return Response({"tokens": AccessTokenSerializer(queryset, many=True).data})

    try:
        days_valid = min(max(int(request.data.get("daysValid") or 90), 1), 365)
    except (TypeError, ValueError):
        days_valid = 90
    raw_token = f"bt_{secrets.token_urlsafe(36)}"
    access_token = AccessToken.objects.create(
        user=request.user,
        name=str(request.data.get("name") or "API token")[:180],
        token_hash=hashlib.sha256(raw_token.encode()).hexdigest(),
        expires_at=token_expiry(days_valid),
    )
    return Response({
        "token": raw_token,
        "tokenRecord": AccessTokenSerializer(access_token).data,
    }, status=status.HTTP_201_CREATED)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def token_detail(request, token_id):
    access_token = AccessToken.objects.filter(pk=token_id, user=request.user).first()
    if not access_token:
        return Response({"error": "Token was not found"}, status=status.HTTP_404_NOT_FOUND)
    if getattr(request, "auth", None) and request.auth.pk == access_token.pk:
        return Response({"error": "Use logout to revoke the active session token"}, status=status.HTTP_400_BAD_REQUEST)
    access_token.revoked_at = timezone.now()
    access_token.save(update_fields=["revoked_at", "updated_at"])
    return Response({"ok": True})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def sync_push(request):
    payload = SyncPushSerializer(data=request.data)
    payload.is_valid(raise_exception=True)
    data = payload.validated_data
    raw_company_id = json_id(data["scope"].get("companyId"))
    company_key = canonical_uuid(raw_company_id)
    existing_company = Company.objects.filter(pk=company_key).first()
    if existing_company and not has_company_access(request.user, existing_company):
        return Response({"error": "Scope is outside this user's companies"}, status=status.HTTP_403_FORBIDDEN)
    if not existing_company and not request.user.is_superuser:
        return Response({"error": "Create and assign the company before syncing POS data"}, status=status.HTTP_403_FORBIDDEN)
    company = ensure_company(raw_company_id, data["changes"])
    if not has_company_access(request.user, company):
        return Response({"error": "Scope is outside this user's companies"}, status=status.HTTP_403_FORBIDDEN)
    existing_batch = SyncBatch.objects.filter(batch_id=data["batchId"]).first()
    if existing_batch:
        return Response({"batchId": existing_batch.batch_id, "accepted": existing_batch.accepted, "rejected": existing_batch.rejected, "auditIds": existing_batch.audit_ids, "serverTime": timezone.now().isoformat(), "replayed": True})

    branch_by_raw_id = {}
    for branch_record in data["changes"].get("branches", []) or []:
        branch = ensure_branch(branch_record, company)
        if branch:
            branch_by_raw_id[json_id(branch_record.get("id"))] = branch
    device, _ = Device.objects.get_or_create(
        device_id=data["deviceId"],
        defaults={"device_name": data.get("deviceName") or data["deviceId"], "company": company, "branch": branch_by_raw_id.get(json_id(data["scope"].get("branchId")))},
    )
    if device.company_id != company.pk:
        return Response({"error": "Device is already registered to another company"}, status=status.HTTP_403_FORBIDDEN)
    if device.revoked_at:
        return Response({"error": "Device access has been revoked"}, status=status.HTTP_403_FORBIDDEN)

    accepted = rejected = 0
    audit_ids = []
    with transaction.atomic():
        for entity, records in data["changes"].items():
            if not isinstance(records, list):
                rejected += 1
                continue
            for record in records:
                record_company_id = json_id(record.get("companyId") or raw_company_id)
                record_id = json_id(record.get("id"))
                if not record_id or not record.get("updatedAt") or record_company_id != raw_company_id:
                    rejected += 1
                    continue
                raw_branch_id = json_id(record.get("branchId"))
                branch = branch_by_raw_id.get(raw_branch_id)
                if raw_branch_id and not branch:
                    branch = Branch.objects.filter(pk=canonical_uuid(raw_branch_id), company=company).first()
                if record.get("branchId") and not branch:
                    rejected += 1
                    continue
                if branch and not has_branch_access(request.user, branch):
                    rejected += 1
                    continue
                deleted_at = incoming_time(record.get("deletedAt")) if record.get("deletedAt") else None
                SyncedRecord.objects.update_or_create(
                    entity=entity, record_id=record_id, company=company,
                    defaults={"company": company, "branch": branch, "updated_at": incoming_time(record.get("updatedAt")), "deleted_at": deleted_at, "data": record},
                )
                materialize_record(entity, record, company, branch)
                audit = AuditEntry.objects.create(
                    company=company, branch=branch, actor=request.user, entity=entity, record_id=record_id,
                    action="delete" if deleted_at else "sync",
                    metadata={"batchId": data["batchId"], "deviceId": data["deviceId"], "updatedAt": record.get("updatedAt")},
                )
                audit_ids.append(str(audit.id))
                accepted += 1
        server_time = timezone.now()
        device.device_name = data.get("deviceName") or device.device_name
        device.company = company
        device.branch = branch_by_raw_id.get(json_id(data["scope"].get("branchId"))) or device.branch
        device.last_seen_at = server_time
        device.accepted += accepted
        device.rejected += rejected
        device.batches += 1
        device.save(update_fields=["device_name", "company", "branch", "last_seen_at", "accepted", "rejected", "batches", "updated_at"])
        SyncBatch.objects.create(batch_id=data["batchId"], device=device, company=company, branch=device.branch, accepted=accepted, rejected=rejected, audit_ids=audit_ids, server_time=server_time)
    return Response({"batchId": data["batchId"], "accepted": accepted, "rejected": rejected, "auditIds": audit_ids, "serverTime": server_time.isoformat()})
