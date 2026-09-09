from django.urls import path

from tracking.views import health

urlpatterns = [
    path("health/", health, name="health"),
]
