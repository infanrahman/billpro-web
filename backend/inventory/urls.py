from rest_framework.routers import DefaultRouter

from tracking.views import CategoryViewSet, InventoryViewSet

router = DefaultRouter()
router.register("inventory", InventoryViewSet)
router.register("categories", CategoryViewSet)

urlpatterns = router.urls
