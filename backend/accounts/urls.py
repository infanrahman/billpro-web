from django.urls import path
from rest_framework.routers import DefaultRouter

from tracking.views import UserViewSet, login, logout, me, token_detail, tokens

router = DefaultRouter()
router.register("users", UserViewSet)

urlpatterns = [
    path("auth/login/", login, name="login"),
    path("auth/logout/", logout, name="logout"),
    path("auth/me/", me, name="me"),
    path("tokens/", tokens, name="tokens"),
    path("tokens/<uuid:token_id>/", token_detail, name="token-detail"),
    *router.urls,
]
