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
    barcode = models.CharField(max_length=120, blank=True)
    stock = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    min_stock = models.DecimalField(max_digits=14, decimal_places=3, default=0)
    sale_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    purchase_price = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "branch", "updated_at"]), models.Index(fields=["company", "barcode"])]


class Customer(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="customers")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="customers")
    name = models.CharField(max_length=220)
    phone = models.CharField(max_length=80, blank=True)
    balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [models.Index(fields=["company", "branch", "updated_at"]), models.Index(fields=["company", "phone"])]


class Supplier(TimeStampedModel):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name="suppliers")
    branch = models.ForeignKey(Branch, on_delete=models.SET_NULL, null=True, blank=True, related_name="suppliers")
    name = models.CharField(max_length=220)
    phone = models.CharField(max_length=80, blank=True)
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
