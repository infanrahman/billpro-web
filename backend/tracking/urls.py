from django.urls import include, path


# The tracking app remains the compatibility data layer. Domain APIs are
# owned by their own Django applications and are mounted at the same public
# paths to preserve existing desktop and web clients.
urlpatterns = [
    path("", include("system.urls")),
    path("", include("accounts.urls")),
    path("", include("organizations.urls")),
    path("", include("inventory.urls")),
    path("", include("relationships.urls")),
    path("", include("sales.urls")),
    path("", include("purchases.urls")),
    path("", include("finance.urls")),
    path("", include("reports.urls")),
    path("", include("sync.urls")),
    path("", include("zatca.urls")),
]
