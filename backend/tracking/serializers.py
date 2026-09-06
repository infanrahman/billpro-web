from rest_framework import serializers

from .models import (
    AccessToken,
    AuditEntry,
    Branch,
    Company,
    ActivityLog,
    CashEntry,
    CashParty,
    Category,
    Customer,
    CustomerPayment,
    Device,
    Expense,
    InventoryItem,
    Notification,
    Purchase,
    PurchaseItem,
    PurchasePayment,
    Sale,
    SaleItem,
    Scale,
    ScaleSyncLog,
    Shift,
    Spreadsheet,
    Supplier,
    SyncedRecord,
    SyncBatch,
    TrackingUser,
    Transaction,
)


class CompanySerializer(serializers.ModelSerializer):
    class Meta:
        model = Company
        fields = ["id", "name", "legal_name", "vat_number", "cr_number", "email", "phone", "address", "country", "logo_url", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class BranchSerializer(serializers.ModelSerializer):
    class Meta:
        model = Branch
        fields = ["id", "company", "name", "location", "phone", "email", "gstin", "vat_no", "cr_no", "logo_url", "country", "tax_name", "tax_rate", "pincode", "terms", "is_master", "last_invoice_hash", "invoice_counter", "primary_title", "secondary_title", "status", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class TrackingUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    company_ids = serializers.PrimaryKeyRelatedField(
        source="companies", many=True, queryset=Company.objects.all(), required=False
    )
    branch_ids = serializers.PrimaryKeyRelatedField(
        source="branches", many=True, queryset=Branch.objects.all(), required=False
    )

    class Meta:
        model = TrackingUser
        fields = [
            "id", "username", "email", "first_name", "last_name", "name", "role", "is_active",
            "password", "company_ids", "branch_ids", "permissions_json", "date_joined", "last_login",
        ]
        read_only_fields = ["id", "date_joined", "last_login"]

    def create(self, validated_data):
        companies = validated_data.pop("companies", [])
        branches = validated_data.pop("branches", [])
        password = validated_data.pop("password", None)
        user = TrackingUser(**validated_data)
        user.set_password(password or TrackingUser.objects.make_random_password())
        user.save()
        user.companies.set(companies)
        user.branches.set(branches)
        return user

    def update(self, instance, validated_data):
        companies = validated_data.pop("companies", None)
        branches = validated_data.pop("branches", None)
        password = validated_data.pop("password", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        if companies is not None:
            instance.companies.set(companies)
        if branches is not None:
            instance.branches.set(branches)
        return instance


class AccessTokenSerializer(serializers.ModelSerializer):
    user = serializers.PrimaryKeyRelatedField(queryset=TrackingUser.objects.all())

    class Meta:
        model = AccessToken
        fields = ["id", "user", "name", "expires_at", "revoked_at", "last_used_at", "created_at"]
        read_only_fields = ["id", "revoked_at", "last_used_at", "created_at"]


class DeviceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Device
        fields = [
            "id", "device_id", "device_name", "company", "branch", "last_seen_at",
            "accepted", "rejected", "batches", "revoked_at", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "last_seen_at", "accepted", "rejected", "batches", "created_at", "updated_at"]


class InventoryItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = InventoryItem
        fields = [
            "id", "company", "branch", "name", "arabic_name", "barcode", "tax_type", "tax_rate",
            "stock", "min_stock", "sale_price", "purchase_price", "location", "unit", "image", "item_code",
            "category", "supplier", "metadata", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class CustomerSerializer(serializers.ModelSerializer):
    class Meta:
        model = Customer
        fields = ["id", "company", "branch", "name", "phone", "email", "address", "vat_number", "total_spent", "balance", "credit_limit", "loyalty_points", "metadata", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class SupplierSerializer(serializers.ModelSerializer):
    class Meta:
        model = Supplier
        fields = ["id", "company", "branch", "name", "phone", "email", "location", "tax_number", "balance", "metadata", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]


class TransactionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transaction
        fields = [
            "id", "company", "branch", "kind", "reference", "amount", "status",
            "transaction_date", "metadata", "created_at", "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class SyncedRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = SyncedRecord
        fields = [
            "id", "entity", "record_id", "company", "branch", "updated_at",
            "deleted_at", "data", "created_at",
        ]
        read_only_fields = ["id", "created_at"]


class SyncPushSerializer(serializers.Serializer):
    deviceId = serializers.CharField(max_length=180)
    deviceName = serializers.CharField(max_length=180, required=False, allow_blank=True)
    batchId = serializers.CharField(max_length=180)
    scope = serializers.DictField()
    changes = serializers.DictField(child=serializers.ListField(child=serializers.DictField()), allow_empty=True)

    def validate_scope(self, value):
        if not value.get("companyId"):
            raise serializers.ValidationError("scope.companyId is required")
        return value


class LoginSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True)
    tokenName = serializers.CharField(required=False, default="API token")


class AuditEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditEntry
        fields = [
            "id", "company", "branch", "actor", "entity", "record_id", "action",
            "metadata", "created_at",
        ]
        read_only_fields = fields


class SyncBatchSerializer(serializers.ModelSerializer):
    class Meta:
        model = SyncBatch
        fields = [
            "id", "batch_id", "device", "company", "branch", "accepted", "rejected",
            "audit_ids", "server_time", "created_at",
        ]
        read_only_fields = fields


class CategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = Category
        fields = "__all__"


class SaleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Sale
        fields = "__all__"


class SaleItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = SaleItem
        fields = "__all__"


class ExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Expense
        fields = "__all__"


class PurchaseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Purchase
        fields = "__all__"


class PurchaseItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchaseItem
        fields = "__all__"


class CustomerPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = CustomerPayment
        fields = "__all__"


class PurchasePaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = PurchasePayment
        fields = "__all__"


class CashPartySerializer(serializers.ModelSerializer):
    class Meta:
        model = CashParty
        fields = "__all__"


class CashEntrySerializer(serializers.ModelSerializer):
    class Meta:
        model = CashEntry
        fields = "__all__"


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = "__all__"


class ActivityLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ActivityLog
        fields = "__all__"


class SpreadsheetSerializer(serializers.ModelSerializer):
    class Meta:
        model = Spreadsheet
        fields = "__all__"


class ShiftSerializer(serializers.ModelSerializer):
    class Meta:
        model = Shift
        fields = "__all__"


class ScaleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Scale
        fields = "__all__"


class ScaleSyncLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScaleSyncLog
        fields = "__all__"
