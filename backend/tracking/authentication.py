import hashlib
from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication, get_authorization_header
from rest_framework.exceptions import AuthenticationFailed

from .models import AccessToken


class BearerTokenAuthentication(BaseAuthentication):
    """Authenticate POS and dashboard calls using a managed bearer token."""

    keyword = b"bearer"

    def authenticate(self, request):
        parts = get_authorization_header(request).split()
        if not parts:
            return None
        if parts[0].lower() != self.keyword or len(parts) != 2:
            raise AuthenticationFailed("Invalid Authorization header")

        raw_token = parts[1].decode("utf-8", errors="ignore").strip()
        if not raw_token:
            raise AuthenticationFailed("Missing bearer token")

        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
        access_token = (
            AccessToken.objects.select_related("user")
            .prefetch_related("user__companies", "user__branches")
            .filter(token_hash=token_hash)
            .first()
        )
        now = timezone.now()
        if not access_token or access_token.revoked_at or (
            access_token.expires_at and access_token.expires_at <= now
        ):
            raise AuthenticationFailed("Invalid or expired token")
        if not access_token.user.is_active:
            raise AuthenticationFailed("User account is inactive")

        AccessToken.objects.filter(pk=access_token.pk).update(last_used_at=now)
        request.auth = access_token
        return access_token.user, access_token


def token_expiry(days=90):
    return timezone.now() + timedelta(days=days) if days else None
