from django.urls import path
from rest_framework.routers import DefaultRouter

from tracking.views import (
    ActivityLogViewSet, AuditViewSet, NotificationViewSet, overview,
    ScaleSyncLogViewSet, ScaleViewSet, ShiftViewSet, SpreadsheetViewSet,
)

router = DefaultRouter()
router.register("notifications", NotificationViewSet)
router.register("activity-logs", ActivityLogViewSet)
router.register("spreadsheets", SpreadsheetViewSet)
router.register("shifts", ShiftViewSet)
router.register("scales", ScaleViewSet)
router.register("scale-logs", ScaleSyncLogViewSet)
router.register("audit", AuditViewSet)

urlpatterns = [
    path("overview/", overview, name="overview"),
    *router.urls,
]
