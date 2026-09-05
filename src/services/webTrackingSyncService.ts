import { db, getCurrentBranchId, getCurrentCompanyId, type SyncEntity } from './db';

type SyncableRecord = Partial<SyncEntity> & Record<string, unknown>;

type SyncEntityName =
    | 'companies'
    | 'branches'
    | 'users'
    | 'sales'
    | 'inventory'
    | 'categories'
    | 'customers'
    | 'suppliers'
    | 'purchases'
    | 'expenses'
    | 'cashbook'
    | 'cashParties'
    | 'customerPayments'
    | 'purchasePayments'
    | 'notifications'
    | 'scales'
    | 'scaleLogs'
    | 'spreadsheets'
    | 'shifts';

type SyncTable = {
    toArray: () => Promise<unknown[]>;
    add?: (...args: unknown[]) => Promise<unknown>;
    put?: (...args: unknown[]) => Promise<unknown>;
    update?: (...args: unknown[]) => Promise<unknown>;
    delete?: (...args: unknown[]) => Promise<unknown>;
    bulkAdd?: (...args: unknown[]) => Promise<unknown>;
    bulkPut?: (...args: unknown[]) => Promise<unknown>;
};

type SyncSource = {
    entity: SyncEntityName;
    table: unknown;
};

export type WebTrackingConfig = {
    endpoint: string;
    token: string;
    lastSyncAt: string | null;
    autoSyncEnabled: boolean;
};

export type WebTrackingPushResult = {
    batchId: string;
    accepted: number;
    rejected: number;
    auditIds: string[];
    serverTime: string;
    replayed?: boolean;
};

const endpointKey = 'webTrackingEndpoint';
const tokenKey = 'webTrackingToken';
const lastSyncKey = 'webTrackingLastSyncAt';
const deviceIdKey = 'webTrackingDeviceId';
const autoSyncKey = 'webTrackingAutoSyncEnabled';

// The desktop build cannot infer the URL of a hosted tracker. Set
// VITE_WEB_TRACKING_URL at build time, while retaining localhost for local use.
const defaultEndpoint = (import.meta.env.VITE_WEB_TRACKING_URL || 'http://127.0.0.1:3000').trim();
const defaultToken = (import.meta.env.VITE_WEB_TRACKING_TOKEN || 'demo-owner-token').trim();

const syncSources: SyncSource[] = [
    { entity: 'companies', table: db.companies },
    { entity: 'branches', table: db.branches },
    { entity: 'users', table: db.users },
    { entity: 'sales', table: db.invoices },
    { entity: 'inventory', table: db.items },
    { entity: 'categories', table: db.categories },
    { entity: 'customers', table: db.customers },
    { entity: 'suppliers', table: db.suppliers },
    { entity: 'purchases', table: db.purchases },
    { entity: 'expenses', table: db.expenses },
    { entity: 'cashbook', table: db.cashEntries },
    { entity: 'cashParties', table: db.cashParties },
    { entity: 'customerPayments', table: db.customerPayments },
    { entity: 'purchasePayments', table: db.purchasePayments },
    { entity: 'notifications', table: db.notifications },
    { entity: 'scales', table: db.scales },
    { entity: 'scaleLogs', table: db.scaleLogs },
    { entity: 'spreadsheets', table: db.spreadsheets },
    { entity: 'shifts', table: db.shifts },
];

const normaliseEndpoint = (endpoint: string) => endpoint.trim().replace(/\/+$/, '');

const toIsoValue = (value: unknown): unknown => {
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(toIsoValue);
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, toIsoValue(item)]),
        );
    }
    return value;
};

const recordUpdatedAt = (record: SyncableRecord) => {
    const value = record.updatedAt;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'string' || typeof value === 'number') return new Date(value).getTime();
    return 0;
};

const sanitizeRecord = (record: SyncableRecord) => {
    const { password: _password, salt: _salt, iterations: _iterations, isHashed: _isHashed, ...safeRecord } = record;
    return safeRecord;
};

const getDeviceId = () => {
    const saved = localStorage.getItem(deviceIdKey);
    if (saved) return saved;

    const generated =
        globalThis.crypto?.randomUUID?.() ||
        `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(deviceIdKey, generated);
    return generated;
};

export const getWebTrackingConfig = (): WebTrackingConfig => ({
    endpoint: localStorage.getItem(endpointKey) || defaultEndpoint,
    token: localStorage.getItem(tokenKey) || defaultToken,
    lastSyncAt: localStorage.getItem(lastSyncKey),
    autoSyncEnabled: localStorage.getItem(autoSyncKey) !== 'false',
});

export const saveWebTrackingConfig = (config: Pick<WebTrackingConfig, 'endpoint' | 'token'> & Partial<Pick<WebTrackingConfig, 'autoSyncEnabled'>>) => {
    localStorage.setItem(endpointKey, normaliseEndpoint(config.endpoint || defaultEndpoint));
    localStorage.setItem(tokenKey, config.token || defaultToken);
    if (typeof config.autoSyncEnabled === 'boolean') {
        localStorage.setItem(autoSyncKey, String(config.autoSyncEnabled));
    }
};

export const collectWebTrackingChanges = async (lastSyncAt?: string | null) => {
    const since = lastSyncAt ? new Date(lastSyncAt).getTime() : 0;
    const entries = await Promise.all(
        syncSources.map(async ({ entity, table }) => {
            const syncTable = table as SyncTable;
            const records = (await syncTable.toArray()).filter(
                (record): record is SyncableRecord => !!record && typeof record === 'object',
            );
            const changed = records
                .filter((record) => recordUpdatedAt(record) > since)
                .map((record) => {
                    const companyId = entity === 'companies'
                        ? String(record.companyId || record.id || getCurrentCompanyId())
                        : String(record.companyId || getCurrentCompanyId());

                    return toIsoValue({
                        ...sanitizeRecord(record),
                        companyId,
                        branchId: record.branchId || getCurrentBranchId(),
                    });
                });

            return [entity, changed] as const;
        }),
    );

    return Object.fromEntries(entries.filter(([, records]) => records.length > 0));
};

export const pushWebTrackingChanges = async (
    overrides: Partial<Pick<WebTrackingConfig, 'endpoint' | 'token'>> = {},
    forceFullSync = false,
) => {
    const config = { ...getWebTrackingConfig(), ...overrides };
    const endpoint = normaliseEndpoint(config.endpoint || defaultEndpoint);
    const changes = await collectWebTrackingChanges(forceFullSync ? null : config.lastSyncAt);
    const response = await fetch(`${endpoint}/api/sync/push`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${config.token || defaultToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            deviceId: getDeviceId(),
            batchId: globalThis.crypto?.randomUUID?.() || `batch-${Date.now()}`,
            scope: {
                companyId: getCurrentCompanyId(),
                branchId: getCurrentBranchId(),
            },
            // Empty batches are intentional: they act as a device heartbeat and
            // let the web dashboard show that this POS is still connected.
            changes,
        }),
    });

    if (!response.ok) {
        const message = await response.text().catch(() => '');
        throw new Error(message || `Web tracking sync failed with status ${response.status}`);
    }

    const result = (await response.json()) as WebTrackingPushResult;
    localStorage.setItem(lastSyncKey, result.serverTime);
    return result;
};

let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let autoSyncRunning = false;
let automaticSyncEnabled = false;

export const queueWebTrackingSync = (delayMs = 3500) => {
    if (!automaticSyncEnabled || !getWebTrackingConfig().autoSyncEnabled) return;
    if (autoSyncTimer) clearTimeout(autoSyncTimer);

    autoSyncTimer = setTimeout(async () => {
        if (autoSyncRunning) {
            queueWebTrackingSync(delayMs);
            return;
        }

        try {
            autoSyncRunning = true;
            await pushWebTrackingChanges();
        } catch (error) {
            console.warn('Automatic web tracking sync failed:', error);
        } finally {
            autoSyncRunning = false;
        }
    }, delayMs);
};

export const enableAutomaticWebTrackingSync = () => {
    if (automaticSyncEnabled) return;
    automaticSyncEnabled = true;

    for (const { table } of syncSources) {
        const syncTable = table as SyncTable;
        const originalAdd = syncTable.add?.bind(syncTable);
        const originalPut = syncTable.put?.bind(syncTable);
        const originalUpdate = syncTable.update?.bind(syncTable);
        const originalDelete = syncTable.delete?.bind(syncTable);
        const originalBulkAdd = syncTable.bulkAdd?.bind(syncTable);
        const originalBulkPut = syncTable.bulkPut?.bind(syncTable);

        if (originalAdd) {
            syncTable.add = (async (...args: unknown[]) => {
                const result = await originalAdd(...args);
                queueWebTrackingSync();
                return result;
            }) as typeof syncTable.add;
        }

        if (originalPut) {
            syncTable.put = (async (...args: unknown[]) => {
                const result = await originalPut(...args);
                queueWebTrackingSync();
                return result;
            }) as typeof syncTable.put;
        }

        if (originalUpdate) {
            syncTable.update = (async (...args: unknown[]) => {
                const result = await originalUpdate(...args);
                queueWebTrackingSync();
                return result;
            }) as typeof syncTable.update;
        }

        if (originalDelete) {
            syncTable.delete = (async (...args: unknown[]) => {
                const result = await originalDelete(...args);
                queueWebTrackingSync();
                return result;
            }) as typeof syncTable.delete;
        }

        if (originalBulkAdd) {
            syncTable.bulkAdd = (async (...args: unknown[]) => {
                const result = await originalBulkAdd(...args);
                queueWebTrackingSync();
                return result;
            }) as typeof syncTable.bulkAdd;
        }

        if (originalBulkPut) {
            syncTable.bulkPut = (async (...args: unknown[]) => {
                const result = await originalBulkPut(...args);
                queueWebTrackingSync();
                return result;
            }) as typeof syncTable.bulkPut;
        }
    }

    window.addEventListener('online', () => queueWebTrackingSync(1000));
    queueWebTrackingSync(8000);
    window.setInterval(() => queueWebTrackingSync(0), 5 * 60 * 1000);
};
