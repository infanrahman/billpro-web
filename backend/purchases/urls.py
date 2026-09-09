from rest_framework.routers import DefaultRouter

from tracking.views import PurchaseItemViewSet, PurchasePaymentViewSet, PurchaseViewSet

router = DefaultRouter()
router.register("purchases", PurchaseViewSet)
router.register("purchase-items", PurchaseItemViewSet)
router.register("purchase-payments", PurchasePaymentViewSet)

urlpatterns = router.urls
