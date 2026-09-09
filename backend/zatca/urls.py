from django.urls import path

from tracking.views import zatca_status

urlpatterns = [
    path("zatca/", zatca_status, name="zatca-status"),
]
