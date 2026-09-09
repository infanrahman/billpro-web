from rest_framework.routers import DefaultRouter

from tracking.views import CashEntryViewSet, CashPartyViewSet, ExpenseViewSet, TransactionViewSet

router = DefaultRouter()
router.register("expenses", ExpenseViewSet)
router.register("cash-parties", CashPartyViewSet)
router.register("cash-entries", CashEntryViewSet)
router.register("transactions", TransactionViewSet)

urlpatterns = router.urls
