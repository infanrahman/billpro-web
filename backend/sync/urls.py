from django.urls import path
from rest_framework.routers import DefaultRouter

from tracking.views import SyncBatchViewSet, SyncedRecordViewSet, sync_push

router = DefaultRouter()
router.register("records", SyncedRecordViewSet)
router.register("sync-batches", SyncBatchViewSet)

urlpatterns = [
    path("sync/push/", sync_push, name="sync-push"),
    path("sync/push", sync_push, name="sync-push-no-slash"),
    *router.urls,
]
