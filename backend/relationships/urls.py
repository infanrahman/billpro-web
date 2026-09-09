from rest_framework.routers import DefaultRouter

from tracking.views import CustomerPaymentViewSet, CustomerViewSet, SupplierViewSet

router = DefaultRouter()
router.register("customers", CustomerViewSet)
router.register("suppliers", SupplierViewSet)
router.register("customer-payments", CustomerPaymentViewSet)

urlpatterns = router.urls
