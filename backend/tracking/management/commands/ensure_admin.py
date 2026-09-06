import os

from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model


class Command(BaseCommand):
    help = "Create or update the initial Django administrator from deployment variables."

    def handle(self, *args, **options):
        username = os.getenv("DJANGO_SUPERUSER_USERNAME", "").strip()
        password = os.getenv("DJANGO_SUPERUSER_PASSWORD", "")
        email = os.getenv("DJANGO_SUPERUSER_EMAIL", "").strip()

        if not username or not password:
            self.stdout.write("Admin bootstrap skipped: DJANGO_SUPERUSER_USERNAME/PASSWORD are not set.")
            return

        user_model = get_user_model()
        user, created = user_model.objects.get_or_create(
            username=username,
            defaults={"email": email, "role": "owner", "is_staff": True, "is_superuser": True, "is_active": True},
        )
        user.email = email or user.email
        user.role = "owner"
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Admin {'created' if created else 'updated'}: {username}"))
