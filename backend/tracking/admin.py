from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    AccessToken, AuditEntry, Branch, Company, Customer, Device,
    InventoryItem, Supplier, SyncBatch, SyncedRecord, TrackingUser, Transaction,
)


@admin.register(TrackingUser)
class TrackingUserAdmin(UserAdmin):
    list_display = ("username", "name", "role", "is_active", "last_login")
    list_filter = ("role", "is_active", "is_staff")
    filter_horizontal = ("companies", "branches", "groups", "user_permissions")
    fieldsets = UserAdmin.fieldsets + (("Tracking access", {"fields": ("name", "role", "companies", "branches", "permissions_json")}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Tracking access", {"fields": ("name", "role", "companies", "branches", "permissions_json")}),)


for model in [Company, Branch, AccessToken, Device, InventoryItem, Customer, Supplier, Transaction, SyncedRecord, SyncBatch, AuditEntry]:
    admin.site.register(model)
