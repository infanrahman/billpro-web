export type CrudAction = 'view' | 'create' | 'update' | 'delete';

export type PermissionSection =
    | 'dashboard'
    | 'pos'
    | 'sales'
    | 'inventory'
    | 'purchases'
    | 'customers'
    | 'suppliers'
    | 'expenses'
    | 'cashbook'
    | 'reports'
    | 'shifts'
    | 'users'
    | 'companies'
    | 'branches'
    | 'businessProfile'
    | 'invoiceSettings'
    | 'zatca'
    | 'devices'
    | 'scales'
    | 'backup'
    | 'webTracking'
    | 'messaging'
    | 'activityLogs'
    | 'appSettings';

export type PermissionDefinition = {
    id: string;
    label: string;
    section: PermissionSection;
    action: string;
    legacyIds?: string[];
};

export type PermissionGroup = {
    id: PermissionSection;
    label: string;
    description: string;
    permissions: PermissionDefinition[];
};

const crud = (
    section: PermissionSection,
    label: string,
    legacyPrefix?: string,
): PermissionDefinition[] => [
    {
        id: `${section}.view`,
        label: `View ${label}`,
        section,
        action: 'view',
        legacyIds: legacyPrefix ? [`${legacyPrefix}_view`] : undefined,
    },
    {
        id: `${section}.create`,
        label: `Create ${label}`,
        section,
        action: 'create',
        legacyIds: legacyPrefix ? [`${legacyPrefix}_add`] : undefined,
    },
    {
        id: `${section}.update`,
        label: `Update ${label}`,
        section,
        action: 'update',
        legacyIds: legacyPrefix ? [`${legacyPrefix}_edit`] : undefined,
    },
    {
        id: `${section}.delete`,
        label: `Delete ${label}`,
        section,
        action: 'delete',
        legacyIds: legacyPrefix ? [`${legacyPrefix}_delete`] : undefined,
    },
];

export const PERMISSION_GROUPS: PermissionGroup[] = [
    {
        id: 'dashboard',
        label: 'Dashboard',
        description: 'Business overview and quick status panels.',
        permissions: [
            { id: 'dashboard.view', label: 'View Dashboard', section: 'dashboard', action: 'view' },
        ],
    },
    {
        id: 'pos',
        label: 'POS',
        description: 'Billing counter, checkout, and sale controls.',
        permissions: [
            { id: 'pos.view', label: 'Open POS Terminal', section: 'pos', action: 'view', legacyIds: ['pos_access'] },
            { id: 'pos.create', label: 'Create POS Sales', section: 'pos', action: 'create', legacyIds: ['sales_add'] },
            { id: 'sales.discount', label: 'Apply Discounts', section: 'sales', action: 'discount' },
            { id: 'sales.refund', label: 'Process Refunds', section: 'sales', action: 'refund' },
            { id: 'sales.cancel', label: 'Cancel Sales', section: 'sales', action: 'cancel' },
            { id: 'sales.reprint', label: 'Reprint Invoices', section: 'sales', action: 'reprint' },
        ],
    },
    {
        id: 'sales',
        label: 'Sales',
        description: 'Invoices, sales history, returns, and payment changes.',
        permissions: crud('sales', 'Sales', 'sales'),
    },
    {
        id: 'inventory',
        label: 'Inventory',
        description: 'Items, categories, stock counts, imports, and transfers.',
        permissions: [
            ...crud('inventory', 'Inventory', 'inventory'),
            { id: 'inventory.adjustStock', label: 'Adjust Stock', section: 'inventory', action: 'adjustStock' },
            { id: 'inventory.transferStock', label: 'Transfer Stock', section: 'inventory', action: 'transferStock' },
            { id: 'inventory.import', label: 'Import Inventory', section: 'inventory', action: 'import' },
            { id: 'inventory.export', label: 'Export Inventory', section: 'inventory', action: 'export' },
        ],
    },
    {
        id: 'purchases',
        label: 'Purchases',
        description: 'Purchase bills, purchase orders, supplier payments, and returns.',
        permissions: crud('purchases', 'Purchases', 'purchases'),
    },
    {
        id: 'customers',
        label: 'Customers',
        description: 'Customer records, credit balances, and payment collection.',
        permissions: crud('customers', 'Customers', 'customers'),
    },
    {
        id: 'suppliers',
        label: 'Suppliers',
        description: 'Supplier records, balances, and supplier history.',
        permissions: crud('suppliers', 'Suppliers', 'suppliers'),
    },
    {
        id: 'expenses',
        label: 'Expenses',
        description: 'Expense records and supporting notes.',
        permissions: crud('expenses', 'Expenses', 'expenses'),
    },
    {
        id: 'cashbook',
        label: 'Cash Book',
        description: 'Cash-in, cash-out, parties, and cash ledger controls.',
        permissions: [
            { id: 'cashbook.view', label: 'View Cash Book', section: 'cashbook', action: 'view', legacyIds: ['cashbook_access'] },
            { id: 'cashbook.create', label: 'Create Cash Entries', section: 'cashbook', action: 'create' },
            { id: 'cashbook.update', label: 'Update Cash Entries', section: 'cashbook', action: 'update' },
            { id: 'cashbook.delete', label: 'Delete Cash Entries', section: 'cashbook', action: 'delete' },
        ],
    },
    {
        id: 'reports',
        label: 'Reports',
        description: 'Financial, tax, inventory, and company/branch reports.',
        permissions: [
            { id: 'reports.view', label: 'View Reports', section: 'reports', action: 'view', legacyIds: ['reports_view'] },
            { id: 'reports.export', label: 'Export Reports', section: 'reports', action: 'export' },
            { id: 'reports.viewProfit', label: 'View Profit', section: 'reports', action: 'viewProfit' },
        ],
    },
    {
        id: 'shifts',
        label: 'Shifts',
        description: 'Opening cash, closing cash, drawer totals, and shift audit.',
        permissions: crud('shifts', 'Shifts'),
    },
    {
        id: 'users',
        label: 'Users & Roles',
        description: 'Staff accounts, roles, assignments, and permission templates.',
        permissions: [
            { id: 'users.view', label: 'View Users', section: 'users', action: 'view', legacyIds: ['users_manage'] },
            { id: 'users.create', label: 'Create Users', section: 'users', action: 'create', legacyIds: ['users_manage'] },
            { id: 'users.update', label: 'Update Users', section: 'users', action: 'update', legacyIds: ['users_manage'] },
            { id: 'users.delete', label: 'Delete Users', section: 'users', action: 'delete', legacyIds: ['users_manage'] },
        ],
    },
    {
        id: 'companies',
        label: 'Companies',
        description: 'Company profiles, legal identity, and global company access.',
        permissions: crud('companies', 'Companies'),
    },
    {
        id: 'branches',
        label: 'Branches',
        description: 'Branch setup, branch access, registers, and branch state.',
        permissions: crud('branches', 'Branches'),
    },
    {
        id: 'zatca',
        label: 'ZATCA',
        description: 'Compliance settings, certificates, XML generation, and submission.',
        permissions: [
            { id: 'zatca.view', label: 'View ZATCA Settings', section: 'zatca', action: 'view' },
            { id: 'zatca.update', label: 'Update ZATCA Settings', section: 'zatca', action: 'update' },
            { id: 'zatca.submit', label: 'Submit ZATCA Invoices', section: 'zatca', action: 'submit' },
        ],
    },
    {
        id: 'devices',
        label: 'Devices',
        description: 'Printers, cash drawer, scanners, and terminal hardware.',
        permissions: [
            { id: 'devices.view', label: 'View Device Settings', section: 'devices', action: 'view', legacyIds: ['settings_printers'] },
            { id: 'devices.update', label: 'Update Device Settings', section: 'devices', action: 'update', legacyIds: ['settings_printers'] },
        ],
    },
    {
        id: 'scales',
        label: 'Scales',
        description: 'Scale setup, PLU sync, and scale logs.',
        permissions: [
            { id: 'scales.view', label: 'View Scales', section: 'scales', action: 'view', legacyIds: ['settings_printers'] },
            { id: 'scales.create', label: 'Create Scales', section: 'scales', action: 'create', legacyIds: ['settings_printers'] },
            { id: 'scales.update', label: 'Manage Scales', section: 'scales', action: 'update', legacyIds: ['settings_printers'] },
            { id: 'scales.delete', label: 'Delete Scales', section: 'scales', action: 'delete', legacyIds: ['settings_printers'] },
        ],
    },
    {
        id: 'backup',
        label: 'Backup & Restore',
        description: 'Local backups, restores, and cloud backup status.',
        permissions: [
            { id: 'backup.view', label: 'View Backups', section: 'backup', action: 'view', legacyIds: ['settings_backup', 'backup'] },
            { id: 'backup.create', label: 'Create Backups', section: 'backup', action: 'create', legacyIds: ['settings_backup', 'backup'] },
            { id: 'backup.restore', label: 'Restore Backups', section: 'backup', action: 'restore', legacyIds: ['settings_backup'] },
        ],
    },
    {
        id: 'webTracking',
        label: 'Web Tracking',
        description: 'Web dashboard sync, company tracking, and remote activity visibility.',
        permissions: [
            { id: 'webTracking.view', label: 'View Web Tracking', section: 'webTracking', action: 'view' },
            { id: 'webTracking.update', label: 'Update Web Tracking Settings', section: 'webTracking', action: 'update' },
            { id: 'webTracking.sync', label: 'Sync Web Tracking Data', section: 'webTracking', action: 'sync' },
        ],
    },
    {
        id: 'messaging',
        label: 'Messaging',
        description: 'Customer messaging setup and campaign controls.',
        permissions: [
            { id: 'messaging.view', label: 'View Messaging', section: 'messaging', action: 'view', legacyIds: ['settings_general'] },
            { id: 'messaging.update', label: 'Update Messaging', section: 'messaging', action: 'update', legacyIds: ['settings_general'] },
        ],
    },
    {
        id: 'activityLogs',
        label: 'Activity Logs',
        description: 'Security and audit activity.',
        permissions: [
            { id: 'activityLogs.view', label: 'View Activity Logs', section: 'activityLogs', action: 'view' },
        ],
    },
    {
        id: 'appSettings',
        label: 'App Settings',
        description: 'General settings, taxes, localization, invoices, and reminders.',
        permissions: [
            { id: 'appSettings.view', label: 'View App Settings', section: 'appSettings', action: 'view', legacyIds: ['settings_general'] },
            { id: 'appSettings.update', label: 'Update App Settings', section: 'appSettings', action: 'update', legacyIds: ['settings_general', 'settings_taxes', 'settings_invoice'] },
            { id: 'businessProfile.update', label: 'Update Business Profile', section: 'businessProfile', action: 'update', legacyIds: ['settings_general', 'settings_manage'] },
            { id: 'invoiceSettings.update', label: 'Update Invoice Settings', section: 'invoiceSettings', action: 'update', legacyIds: ['settings_invoice'] },
        ],
    },
];

export const PERMISSIONS = PERMISSION_GROUPS.flatMap(group => group.permissions);

const ALIAS_ENTRIES = PERMISSIONS.flatMap(permission =>
    (permission.legacyIds || []).map(legacyId => [legacyId, permission.id] as const),
);

export const LEGACY_PERMISSION_ALIASES = Object.fromEntries(ALIAS_ENTRIES) as Record<string, string>;

export const normalizePermission = (permission: string) => LEGACY_PERMISSION_ALIASES[permission] || permission;

export const userHasPermission = (userPermissions: string[] | undefined, requestedPermission: string) => {
    const normalizedRequest = normalizePermission(requestedPermission);
    const normalizedUserPermissions = new Set((userPermissions || []).map(normalizePermission));

    if (normalizedUserPermissions.has(normalizedRequest)) return true;

    const requestedDefinition = PERMISSIONS.find(permission => permission.id === normalizedRequest);
    return !!requestedDefinition?.legacyIds?.some(legacyId => userPermissions?.includes(legacyId));
};

export const permissionIdFor = (section: PermissionSection, action: string) => `${section}.${action}`;

export const SECTION_VIEW_PERMISSIONS: Partial<Record<PermissionSection, string>> = Object.fromEntries(
    PERMISSION_GROUPS.map(group => [
        group.id,
        group.permissions.find(permission => permission.action === 'view')?.id,
    ]).filter((entry): entry is [PermissionSection, string] => Boolean(entry[1])),
);
