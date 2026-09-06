from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    AuditViewSet, BranchViewSet, CompanyViewSet, CustomerViewSet, DeviceViewSet,
    InventoryViewSet, SyncBatchViewSet, SyncedRecordViewSet, SupplierViewSet,
    TransactionViewSet, UserViewSet, health, login, logout, me, overview, sync_push,
)

router = DefaultRouter()
router.register("companies", CompanyViewSet)
router.register("branches", BranchViewSet)
router.register("users", UserViewSet)
router.register("devices", DeviceViewSet)
router.register("inventory", InventoryViewSet)
router.register("customers", CustomerViewSet)
router.register("suppliers", SupplierViewSet)
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
    path("sync/push/", sync_push, name="sync-push"),
    path("", include(router.urls)),
]
