from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    ActivityLogViewSet, AuditViewSet, BranchViewSet, CashEntryViewSet, CashPartyViewSet,
    CategoryViewSet, CompanyViewSet, CustomerPaymentViewSet, CustomerViewSet, DeviceViewSet,
    ExpenseViewSet, InventoryViewSet, NotificationViewSet, PurchaseItemViewSet,
    PurchasePaymentViewSet, PurchaseViewSet, SaleItemViewSet, SaleViewSet, ScaleSyncLogViewSet,
    ScaleViewSet, ShiftViewSet, SpreadsheetViewSet, SyncBatchViewSet, SyncedRecordViewSet,
    SupplierViewSet, TransactionViewSet, UserViewSet, health, login, logout, me, overview, sync_push, zatca_status,
    token_detail, tokens,
)

router = DefaultRouter()
router.register("companies", CompanyViewSet)
router.register("branches", BranchViewSet)
router.register("users", UserViewSet)
router.register("devices", DeviceViewSet)
router.register("inventory", InventoryViewSet)
router.register("categories", CategoryViewSet)
router.register("customers", CustomerViewSet)
router.register("suppliers", SupplierViewSet)
router.register("sales", SaleViewSet)
router.register("sale-items", SaleItemViewSet)
router.register("expenses", ExpenseViewSet)
router.register("purchases", PurchaseViewSet)
router.register("purchase-items", PurchaseItemViewSet)
router.register("customer-payments", CustomerPaymentViewSet)
router.register("purchase-payments", PurchasePaymentViewSet)
router.register("cash-parties", CashPartyViewSet)
router.register("cash-entries", CashEntryViewSet)
router.register("notifications", NotificationViewSet)
router.register("activity-logs", ActivityLogViewSet)
router.register("spreadsheets", SpreadsheetViewSet)
router.register("shifts", ShiftViewSet)
router.register("scales", ScaleViewSet)
router.register("scale-logs", ScaleSyncLogViewSet)
router.register("transactions", TransactionViewSet)
router.register("records", SyncedRecordViewSet)
router.register("audit", AuditViewSet)
router.register("sync-batches", SyncBatchViewSet)

urlpatterns = [
    path("health/", health, name="health"),
    path("auth/login/", login, name="login"),
    path("auth/logout/", logout, name="logout"),
    path("auth/me/", me, name="me"),
    path("overview/", overview, name="overview"),
    path("zatca/", zatca_status, name="zatca-status"),
    path("tokens/", tokens, name="tokens"),
    path("tokens/<uuid:token_id>/", token_detail, name="token-detail"),
    path("sync/push/", sync_push, name="sync-push"),
    path("sync/push", sync_push, name="sync-push-no-slash"),
    path("", include(router.urls)),
]
