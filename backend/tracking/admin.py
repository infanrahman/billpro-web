from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import (
    AccessToken, ActivityLog, AuditEntry, Branch, CashEntry, CashParty, Category,
    Company, Customer, CustomerPayment, Device, Expense, InventoryItem, Notification,
    Purchase, PurchaseItem, PurchasePayment, Sale, SaleItem, Scale, ScaleSyncLog,
    Shift, Spreadsheet, Supplier, SyncBatch, SyncedRecord, TrackingUser, Transaction,
)


@admin.register(TrackingUser)
class TrackingUserAdmin(UserAdmin):
    list_display = ("username", "name", "role", "is_active", "last_login")
    list_filter = ("role", "is_active", "is_staff")
    filter_horizontal = ("companies", "branches", "groups", "user_permissions")
    fieldsets = UserAdmin.fieldsets + (("Tracking access", {"fields": ("name", "role", "companies", "branches", "permissions_json")}),)
    add_fieldsets = UserAdmin.add_fieldsets + (("Tracking access", {"fields": ("name", "role", "companies", "branches", "permissions_json")}),)


for model in [
    Company, Branch, AccessToken, Device, InventoryItem, Category, Customer, Supplier,
    Sale, SaleItem, Purchase, PurchaseItem, Expense, CustomerPayment, PurchasePayment,
    CashParty, CashEntry, Notification, ActivityLog, Spreadsheet, Shift, Scale,
    ScaleSyncLog, Transaction, SyncedRecord, SyncBatch, AuditEntry,
]:
    admin.site.register(model)
