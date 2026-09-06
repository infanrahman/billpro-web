import hashlib
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
    AccessToken, AuditEntry, Branch, Company, Customer, Device, InventoryItem,
    Supplier, SyncedRecord, SyncBatch, TrackingUser, Transaction,
)
from .permissions import IsTrackingAdmin, has_branch_access, has_company_access
from .serializers import (
    AuditEntrySerializer, BranchSerializer, CompanySerializer, CustomerSerializer,
    DeviceSerializer, InventoryItemSerializer, LoginSerializer, SupplierSerializer,
    SyncedRecordSerializer, SyncBatchSerializer, SyncPushSerializer,
    TrackingUserSerializer, TransactionSerializer,
)


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
            "status": source.get("status", "active"),
        },
    )
    updates = {
        "name": source.get("name"),
        "legal_name": source.get("legalName"),
        "vat_number": source.get("vatNumber"),
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
    if entity == "companies":
        Company.objects.update_or_create(
            pk=model_id,
            defaults={
                "name": record.get("name") or record.get("legalName") or "POS Company",
                "legal_name": record.get("legalName", ""),
                "vat_number": record.get("vatNumber", ""),
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
                "barcode": record.get("barcode", ""), "stock": record.get("stock", 0) or 0,
                "min_stock": record.get("minStock", 0) or 0, "sale_price": record.get("salePrice", 0) or 0,
                "purchase_price": record.get("purchasePrice", 0) or 0, "metadata": record,
            },
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
    user = authenticate(username=payload.validated_data["username"], password=payload.validated_data["password"])
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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def overview(request):
    user = request.user
    company_qs = Company.objects.all() if user.is_superuser else user.companies.all()
    branch_qs = Branch.objects.filter(company__in=company_qs)
    scoped = lambda qs: qs if user.is_superuser else qs.filter(company__in=company_qs)
    return Response({
        "companies": CompanySerializer(company_qs, many=True).data,
        "branches": BranchSerializer(branch_qs, many=True).data,
        "counts": {
            "companies": company_qs.count(), "branches": branch_qs.count(),
            "users": TrackingUser.objects.filter(companies__in=company_qs).distinct().count(),
            "devices": scoped(Device.objects).count(), "inventory": scoped(InventoryItem.objects).count(),
            "customers": scoped(Customer.objects).count(), "suppliers": scoped(Supplier.objects).count(),
            "transactions": scoped(Transaction.objects).count(), "syncedRecords": scoped(SyncedRecord.objects).count(),
        },
        "devices": DeviceSerializer(scoped(Device.objects).order_by("-last_seen_at")[:50], many=True).data,
        "recentAudit": AuditEntrySerializer(scoped(AuditEntry.objects).order_by("-created_at")[:50], many=True).data,
    })


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
