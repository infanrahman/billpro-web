from rest_framework.routers import DefaultRouter

from tracking.views import SaleItemViewSet, SaleViewSet

router = DefaultRouter()
router.register("sales", SaleViewSet)
router.register("sale-items", SaleItemViewSet)

urlpatterns = router.urls
