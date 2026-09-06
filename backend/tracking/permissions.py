from rest_framework.permissions import BasePermission


ROLE_RANK = {
    "cashier": 10,
    "inventory": 20,
    "accountant": 30,
    "manager": 40,
    "admin": 50,
    "owner": 60,
}


def is_staff_user(user):
    return bool(user and user.is_authenticated and (user.is_superuser or user.role in {"owner", "admin"}))


def can_manage(user, minimum="manager"):
    if not user or not user.is_authenticated:
        return False
    return user.is_superuser or ROLE_RANK.get(user.role, 0) >= ROLE_RANK[minimum]


def has_company_access(user, company):
    return bool(user.is_superuser or user.companies.filter(pk=company.pk).exists())


def has_branch_access(user, branch):
    if not branch:
        return True
    return bool(
        user.is_superuser
        or user.branches.filter(pk=branch.pk).exists()
        or user.companies.filter(pk=branch.company_id).exists()
    )


class IsTrackingUser(BasePermission):
    message = "A valid tracking token is required."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)


class IsTrackingAdmin(BasePermission):
    message = "Owner or administrator permission is required."

    def has_permission(self, request, view):
        return is_staff_user(request.user)
