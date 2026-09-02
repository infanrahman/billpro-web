import type { Permission, Role, TrackingEntity, TrackingPrincipal } from "./types";

export const rolePermissions: Record<Role, Permission[]> = {
  owner: ["companies.view", "companies.create", "companies.update", "companies.delete", "branches.view", "branches.create", "branches.update", "branches.delete", "users.view", "users.create", "users.update", "users.delete", "sales.view", "sales.create", "sales.update", "sales.delete", "sales.sync", "inventory.view", "inventory.create", "inventory.update", "inventory.delete", "customers.view", "customers.create", "customers.update", "customers.delete", "suppliers.view", "suppliers.create", "suppliers.update", "suppliers.delete", "purchases.view", "purchases.create", "purchases.update", "purchases.delete", "expenses.view", "expenses.create", "expenses.update", "expenses.delete", "cashbook.view", "cashbook.create", "cashbook.update", "cashbook.delete", "reports.view", "reports.export", "audit.view", "backup.create", "backup.restore", "zatca.submit"],
  admin: ["companies.view", "branches.view", "branches.create", "branches.update", "users.view", "users.create", "users.update", "sales.view", "sales.create", "sales.update", "sales.sync", "inventory.view", "inventory.create", "inventory.update", "customers.view", "customers.create", "customers.update", "suppliers.view", "suppliers.create", "suppliers.update", "purchases.view", "purchases.create", "purchases.update", "expenses.view", "expenses.create", "expenses.update", "cashbook.view", "cashbook.create", "cashbook.update", "reports.view", "reports.export", "audit.view", "backup.create", "zatca.submit"],
  manager: ["sales.view", "sales.create", "sales.update", "sales.sync", "inventory.view", "inventory.update", "customers.view", "customers.create", "customers.update", "suppliers.view", "purchases.view", "purchases.create", "expenses.view", "expenses.create", "cashbook.view", "cashbook.create", "reports.view"],
  cashier: ["sales.view", "sales.create", "customers.view", "customers.create", "customers.update", "inventory.view", "cashbook.view"],
  accountant: ["sales.view", "customers.view", "customers.update", "suppliers.view", "suppliers.update", "purchases.view", "purchases.update", "expenses.view", "expenses.create", "expenses.update", "cashbook.view", "cashbook.create", "cashbook.update", "reports.view", "reports.export", "zatca.submit"],
  inventory: ["inventory.view", "inventory.create", "inventory.update", "suppliers.view", "purchases.view", "purchases.create", "purchases.update", "reports.view"],
};

export const permissionsForRole = (role: Role) => rolePermissions[role];

export const allPermissions = Array.from(new Set(Object.values(rolePermissions).flat())).sort();

export const can = (principal: TrackingPrincipal, permission: Permission) =>
  principal.role === "owner" || principal.permissions.includes(permission) || rolePermissions[principal.role].includes(permission);

export const canViewEntity = (principal: TrackingPrincipal, entity: TrackingEntity) =>
  can(principal, `${entity}.view` as Permission);

export const canUseScope = (principal: TrackingPrincipal, companyId: string, branchId?: string) => {
  const companyAllowed = principal.companyIds.includes(companyId);
  const branchAllowed = !branchId || principal.branchIds.includes(branchId);
  return principal.role === "owner" || (companyAllowed && branchAllowed);
};
