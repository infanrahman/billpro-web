import uuid

from django.contrib.auth.models import AbstractUser
from django.db import models


class TimeStampedModel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


class Company(TimeStampedModel):
    name = models.CharField(max_length=180)
    legal_name = models.CharField(max_length=220, blank=True)
    vat_number = models.CharField(max_length=80, blank=True)
    cr_number = models.CharField(max_length=80, blank=True)
    email = models.EmailField(blank=True)
    phone = models.CharField(max_length=80, blank=True)
    address = models.TextField(blank=True)
    country = models.CharField(max_length=120, blank=True)
    logo_url = models.URLField(blank=True)
    status = models.CharField(max_length=20, default="active")

    class Meta:
        ordering = ["name"]
        indexes = [models.Index(fields=["status", "name"])]

    def __str__(self):
        return self.name


class Branch(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="branches")
    name = models.CharField(max_length=180)
    location = models.CharField(max_length=220, blank=True)
    phone = models.CharField(max_length=80, blank=True)
    email = models.EmailField(blank=True)
    gstin = models.CharField(max_length=80, blank=True)
    vat_no = models.CharField(max_length=80, blank=True)
    cr_no = models.CharField(max_length=80, blank=True)
    logo_url = models.URLField(blank=True)
    country = models.CharField(max_length=120, blank=True)
    tax_name = models.CharField(max_length=80, blank=True)
    tax_rate = models.DecimalField(max_digits=7, decimal_places=3, default=0)
    pincode = models.CharField(max_length=30, blank=True)
    terms = models.TextField(blank=True)
    last_invoice_hash = models.CharField(max_length=255, blank=True)
    invoice_counter = models.PositiveIntegerField(default=0)
    primary_title = models.CharField(max_length=180, blank=True)
    secondary_title = models.CharField(max_length=180, blank=True)
    is_master = models.BooleanField(default=False)
    status = models.CharField(max_length=20, default="active")

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["company", "name"], name="unique_branch_name_per_company")]
        indexes = [models.Index(fields=["company", "status"])]

    def __str__(self):
        return f"{self.company.name} / {self.name}"


class TrackingUser(AbstractUser):
    ROLE_CHOICES = [(value, value.title()) for value in ["owner", "admin", "manager", "cashier", "accountant", "inventory"]]
    name = models.CharField(max_length=180, blank=True)
    role = models.CharField(max_length=30, choices=ROLE_CHOICES, default="cashier")
    companies = models.ManyToManyField(Company, blank=True, related_name="tracking_users")
    branches = models.ManyToManyField(Branch, blank=True, related_name="tracking_users")
    permissions_json = models.JSONField(default=list, blank=True)

    def display_name(self):
        return self.name or self.get_full_name() or self.username


class AccessToken(TimeStampedModel):
    user = models.ForeignKey(TrackingUser, on_delete=models.CASCADE, related_name="access_tokens")
    name = models.CharField(max_length=180)
    token_hash = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "revoked_at", "expires_at"])]

    def __str__(self):
        return f"{self.user.username} / {self.name}"


class Device(TimeStampedModel):
    device_id = models.CharField(max_length=180, unique=True)
    device_name = models.CharField(max_length=180)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="devices")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="devices")
    last_seen_at = models.DateTimeField(null=True, blank=True)
    accepted = models.PositiveIntegerField(default=0)
    rejected = models.PositiveIntegerField(default=0)
    batches = models.PositiveIntegerField(default=0)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "last_seen_at"]), models.Index(fields=["branch", "last_seen_at"])]


class InventoryItem(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="inventory")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="inventory")
    name = models.CharField(max_length=220)
    arabic_name = models.CharField(max_length=220, blank=True)
    barcode = models.CharField(max_length=120, blank=True)
    tax_type = models.CharField(max_length=20, default="inclusive")
    tax_rate = models.DecimalField(max_digits=7, decimal_places=3, default=0)
    stock = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    min_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    sale_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    purchase_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    location = models.CharField(max_length=180, blank=True)
    unit = models.CharField(max_length=40, blank=True)
    image = models.TextField(blank=True)
    item_code = models.CharField(max_length=80, blank=True)
    category = models.ForeignKey("Category", on_delete=models.SET_NULL, null=True, blank=True, related_name="items")
    supplier = models.ForeignKey("Supplier", on_delete=models.SET_NULL, null=True, blank=True, related_name="items")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "branch", "updated_at"]), models.Index(fields=["company", "barcode"])]


class Customer(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="customers")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="customers")
    name = models.CharField(max_length=220)
    phone = models.CharField(max_length=80, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(blank=True)
    vat_number = models.CharField(max_length=80, blank=True)
    total_spent = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    credit_limit = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    loyalty_points = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "branch", "updated_at"]), models.Index(fields=["company", "phone"])]


class Supplier(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="suppliers")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="suppliers")
    name = models.CharField(max_length=220)
    phone = models.CharField(max_length=80, blank=True)
    email = models.EmailField(blank=True)
    location = models.CharField(max_length=220, blank=True)
    tax_number = models.CharField(max_length=80, blank=True)
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "branch", "updated_at"]), models.Index(fields=["company", "phone"])]


class Transaction(TimeStampedModel):
    KIND_CHOICES = [(value, value) for value in ["sale", "purchase", "expense", "cashbook", "customer_payment", "purchase_payment"]]
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="transactions")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="transactions")
    kind = models.CharField(max_length=30, choices=KIND_CHOICES)
    reference = models.CharField(max_length=160, blank=True)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=40, blank=True)
    transaction_date = models.DateTimeField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [
            models.Index(fields=["company", "branch", "kind", "transaction_date"]),
            models.Index(fields=["company", "status", "transaction_date"]),
        ]


class SyncedRecord(TimeStampedModel):
    entity = models.CharField(max_length=60)
    record_id = models.CharField(max_length=180)
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="synced_records")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="synced_records")
    updated_at = models.DateTimeField()
    deleted_at = models.DateTimeField(null=True, blank=True)
    data = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["entity", "record_id", "company"], name="unique_synced_entity_record_company")]
        indexes = [models.Index(fields=["entity", "company", "branch", "deleted_at"])]


class SyncBatch(TimeStampedModel):
    batch_id = models.CharField(max_length=180, unique=True)
    device = models.ForeignKey(Device, on_delete=models.CASCADE, related_name="sync_batches")
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="sync_batches")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="sync_batches")
    accepted = models.PositiveIntegerField(default=0)
    rejected = models.PositiveIntegerField(default=0)
    audit_ids = models.JSONField(default=list)
    server_time = models.DateTimeField()


class AuditEntry(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="audit_entries")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_entries")
    actor = models.ForeignKey(TrackingUser, on_delete=models.SET_NULL, null=True, blank=True, related_name="audit_entries")
    entity = models.CharField(max_length=60)
    record_id = models.CharField(max_length=180, blank=True)
    action = models.CharField(max_length=40)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["company", "branch", "created_at"])]


class Category(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="categories")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="categories")
    name = models.CharField(max_length=180)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=30, blank=True)
    icon = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["company", "name"], name="unique_category_name_per_company")]


class Sale(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="sales")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales")
    invoice_number = models.CharField(max_length=160)
    token_number = models.CharField(max_length=80, blank=True)
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="sales")
    customer_name = models.CharField(max_length=220, blank=True)
    customer_phone = models.CharField(max_length=80, blank=True)
    customer_contact = models.CharField(max_length=120, blank=True)
    customer_vat_number = models.CharField(max_length=80, blank=True)
    customer_address = models.TextField(blank=True)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    grand_total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    paid_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    remaining_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    payment_mode = models.CharField(max_length=30, default="cash")
    payment_status = models.CharField(max_length=30, default="paid")
    due_date = models.DateTimeField(null=True, blank=True)
    tax_rate = models.DecimalField(max_digits=7, decimal_places=3, default=0)
    tax_type = models.CharField(max_length=20, blank=True)
    invoice_type = models.CharField(max_length=30, default="invoice")
    order_type = models.CharField(max_length=30, blank=True)
    status = models.CharField(max_length=30, blank=True)
    notes = models.TextField(blank=True)
    zatca_status = models.CharField(max_length=30, blank=True)
    zatca_hash = models.CharField(max_length=255, blank=True)
    zatca_error = models.TextField(blank=True)
    shift = models.ForeignKey("Shift", on_delete=models.SET_NULL, null=True, blank=True, related_name="sales")
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "branch", "created_at"]), models.Index(fields=["company", "invoice_number"])]


class SaleItem(TimeStampedModel):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    item = models.ForeignKey(InventoryItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="sale_lines")
    source_item_id = models.CharField(max_length=180, blank=True)
    name = models.CharField(max_length=220)
    name_ar = models.CharField(max_length=220, blank=True)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    unit = models.CharField(max_length=40, blank=True)
    tax_type = models.CharField(max_length=20, blank=True)
    tax_rate = models.DecimalField(max_digits=7, decimal_places=3, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    net_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    purchase_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)


class Expense(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="expenses")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="expenses")
    description = models.CharField(max_length=255)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    category = models.CharField(max_length=180, blank=True)
    date = models.DateTimeField(null=True, blank=True)
    notes = models.TextField(blank=True)
    receipt = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)


class Purchase(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="purchases")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="purchases")
    order_number = models.CharField(max_length=160)
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True, related_name="purchases")
    supplier_name = models.CharField(max_length=220, blank=True)
    subtotal = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateTimeField(null=True, blank=True)
    due_date = models.DateTimeField(null=True, blank=True)
    payment_type = models.CharField(max_length=30, blank=True)
    paid_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    notes = models.TextField(blank=True)
    purchase_type = models.CharField(max_length=30, blank=True)
    status = models.CharField(max_length=30, blank=True)
    related_order = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="returns")
    metadata = models.JSONField(default=dict, blank=True)


class PurchaseItem(TimeStampedModel):
    purchase = models.ForeignKey(Purchase, on_delete=models.CASCADE, related_name="items")
    item = models.ForeignKey(InventoryItem, on_delete=models.SET_NULL, null=True, blank=True, related_name="purchase_lines")
    source_item_id = models.CharField(max_length=180, blank=True)
    name = models.CharField(max_length=220)
    quantity = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    cost = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    unit = models.CharField(max_length=40, blank=True)
    tax_rate = models.DecimalField(max_digits=7, decimal_places=3, default=0)
    tax_type = models.CharField(max_length=20, blank=True)
    tax_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=14, decimal_places=2, default=0)


class CustomerPayment(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="customer_payments")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="customer_payments")
    customer = models.ForeignKey(Customer, on_delete=models.SET_NULL, null=True, blank=True, related_name="payments")
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateTimeField(null=True, blank=True)
    payment_mode = models.CharField(max_length=30, default="cash")
    reference = models.CharField(max_length=160, blank=True)
    note = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)


class PurchasePayment(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="purchase_payments")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="purchase_payments")
    purchase = models.ForeignKey(Purchase, on_delete=models.SET_NULL, null=True, blank=True, related_name="payments")
    supplier = models.ForeignKey(Supplier, on_delete=models.SET_NULL, null=True, blank=True, related_name="payments")
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateTimeField(null=True, blank=True)
    payment_mode = models.CharField(max_length=30, default="cash")
    reference = models.CharField(max_length=160, blank=True)
    note = models.TextField(blank=True)
    metadata = models.JSONField(default=dict, blank=True)


class CashParty(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="cash_parties")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="cash_parties")
    name = models.CharField(max_length=220)
    phone = models.CharField(max_length=80, blank=True)
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    party_type = models.CharField(max_length=30, default="other")


class CashEntry(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="cash_entries")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="cash_entries")
    entry_type = models.CharField(max_length=10, default="in")
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    date = models.DateTimeField(null=True, blank=True)
    category = models.CharField(max_length=180, blank=True)
    description = models.TextField(blank=True)
    payment_mode = models.CharField(max_length=30, default="cash")
    party = models.ForeignKey(CashParty, on_delete=models.SET_NULL, null=True, blank=True, related_name="entries")
    metadata = models.JSONField(default=dict, blank=True)


class Notification(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="notifications")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="notifications")
    title = models.CharField(max_length=220)
    message = models.TextField()
    notification_type = models.CharField(max_length=30, default="info")
    date = models.DateTimeField(null=True, blank=True)
    read = models.BooleanField(default=False)
    reference_id = models.CharField(max_length=180, blank=True)
    reference_type = models.CharField(max_length=40, blank=True)


class ActivityLog(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="activity_logs")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="activity_logs")
    user = models.ForeignKey(TrackingUser, on_delete=models.SET_NULL, null=True, blank=True, related_name="activity_logs")
    username = models.CharField(max_length=180, blank=True)
    action = models.CharField(max_length=120)
    details = models.TextField(blank=True)
    timestamp = models.DateTimeField(null=True, blank=True)


class Spreadsheet(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="spreadsheets")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="spreadsheets")
    name = models.CharField(max_length=220)
    description = models.TextField(blank=True)
    data = models.JSONField(default=list)
    headers = models.JSONField(default=list)
    styles = models.JSONField(default=dict)
    col_widths = models.JSONField(default=dict)
    row_heights = models.JSONField(default=dict)


class Shift(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="shifts")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="shifts")
    user = models.ForeignKey(TrackingUser, on_delete=models.SET_NULL, null=True, blank=True, related_name="shifts")
    username = models.CharField(max_length=180, blank=True)
    open_time = models.DateTimeField(null=True, blank=True)
    close_time = models.DateTimeField(null=True, blank=True)
    opening_float = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    actual_cash = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    expected_cash = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    total_cash_sales = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_card_sales = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_upi_sales = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    total_credit_sales = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=20, default="open")
    notes = models.TextField(blank=True)


class Scale(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="scales")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="scales")
    name = models.CharField(max_length=180)
    ip_address = models.GenericIPAddressField()
    port = models.PositiveIntegerField(default=0)
    model = models.CharField(max_length=120, blank=True)
    status = models.CharField(max_length=20, default="unknown")
    last_sync = models.DateTimeField(null=True, blank=True)


class ScaleSyncLog(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="scale_logs")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="scale_logs")
    scale = models.ForeignKey(Scale, on_delete=models.SET_NULL, null=True, blank=True, related_name="logs")
    scale_ip = models.GenericIPAddressField()
    action = models.CharField(max_length=120)
    plu_no = models.CharField(max_length=80, blank=True)
    status = models.CharField(max_length=20, default="success")
    response = models.TextField(blank=True)
