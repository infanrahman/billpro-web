from rest_framework.routers import DefaultRouter

from tracking.views import BranchViewSet, CompanyViewSet, DeviceViewSet

router = DefaultRouter()
router.register("companies", CompanyViewSet)
router.register("branches", BranchViewSet)
router.register("devices", DeviceViewSet)

urlpatterns = router.urls
