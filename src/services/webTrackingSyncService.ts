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

export type WebTrackingConnectionResult = {
    companies: number;
    branches: number;
    users: number;
};

export type WebTrackingSyncStatus = {
    lastSyncAt: string | null;
    accepted: number;
    rejected: number;
    batchId: string | null;
    error: string | null;
};

const endpointKey = 'webTrackingEndpoint';
const tokenKey = 'webTrackingToken';
const lastSyncKey = 'webTrackingLastSyncAt';
const deviceIdKey = 'webTrackingDeviceId';
const deviceNameKey = 'webTrackingDeviceName';
const autoSyncKey = 'webTrackingAutoSyncEnabled';
const syncFingerprintKey = 'webTrackingSyncFingerprint';
const lastSyncResultKey = 'webTrackingLastSyncResult';
const lastSyncErrorKey = 'webTrackingLastSyncError';

// The desktop build cannot infer the URL of a hosted tracker. Set
// VITE_WEB_TRACKING_URL at build time; Railway is the production fallback.
const defaultEndpoint = (import.meta.env.VITE_WEB_TRACKING_URL || 'https://billpro-web-production.up.railway.app').trim();
const defaultToken = (import.meta.env.VITE_WEB_TRACKING_TOKEN || '').trim();
const legacyVercelEndpoint = 'https://billpro-web.vercel.app';

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

const normaliseEndpoint = (endpoint: string) => endpoint.trim().replace(/\/+$/, '').replace(/\/api$/, '');

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

const dateOrNow = (value: unknown, fallback?: Date) => {
    const date = value ? new Date(String(value)) : fallback;
    return date && !Number.isNaN(date.getTime()) ? date : new Date();
};

const pullWebOrganization = async (endpoint: string, token: string) => {
    const response = await fetch(`${normaliseEndpoint(endpoint)}/api/overview/`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Organization pull failed with status ${response.status}`);
    const payload = await response.json() as { companies?: Record<string, unknown>[]; branches?: Record<string, unknown>[] };

    await db.transaction('rw', [db.companies, db.branches], async () => {
        for (const remote of payload.companies || []) {
            const id = String(remote.id || '');
            if (!id) continue;
            const existing = await db.companies.get(id);
            await db.companies.put({
                ...(existing || {}),
                id,
                name: String(remote.name || remote.legal_name || existing?.name || 'Unnamed company'),
                legalName: String(remote.legal_name ?? remote.legalName ?? existing?.legalName ?? ''),
                vatNumber: String(remote.vat_number ?? remote.vatNumber ?? existing?.vatNumber ?? ''),
                crNumber: String(remote.cr_number ?? remote.crNumber ?? existing?.crNumber ?? ''),
                email: String(remote.email ?? existing?.email ?? ''),
                phone: String(remote.phone ?? existing?.phone ?? ''),
                address: String(remote.address ?? existing?.address ?? ''),
                country: String(remote.country ?? existing?.country ?? ''),
                logoUrl: String(remote.logo_url ?? remote.logoUrl ?? existing?.logoUrl ?? ''),
                status: remote.status === 'inactive' ? 'inactive' : 'active',
                createdAt: existing?.createdAt || dateOrNow(remote.created_at ?? remote.createdAt),
                updatedAt: dateOrNow(remote.updated_at ?? remote.updatedAt, existing?.updatedAt),
            });
        }

        for (const remote of payload.branches || []) {
            const id = String(remote.id || '');
            const companyId = String(remote.company ?? remote.companyId ?? '');
            if (!id || !companyId) continue;
            const existing = await db.branches.get(id);
            await db.branches.put({
                ...(existing || {}),
                id,
                companyId,
                name: String(remote.name || existing?.name || 'Unnamed branch'),
                location: String(remote.location ?? existing?.location ?? ''),
                phone: String(remote.phone ?? existing?.phone ?? ''),
                email: String(remote.email ?? existing?.email ?? ''),
                vatNo: String(remote.vat_no ?? remote.vatNo ?? existing?.vatNo ?? ''),
                crNo: String(remote.cr_no ?? remote.crNo ?? existing?.crNo ?? ''),
                gstin: String(remote.gstin ?? existing?.gstin ?? ''),
                country: String(remote.country ?? existing?.country ?? ''),
                taxName: String(remote.tax_name ?? remote.taxName ?? existing?.taxName ?? 'VAT'),
                taxRate: Number(remote.tax_rate ?? remote.taxRate ?? existing?.taxRate ?? 0),
                isMaster: Boolean(remote.is_master ?? remote.isMaster ?? existing?.isMaster ?? false),
                status: remote.status === 'inactive' ? 'inactive' : 'active',
                updatedAt: dateOrNow(remote.updated_at ?? remote.updatedAt, existing?.updatedAt),
                branchId: existing?.branchId || id,
            });
        }
    });

    return {
        companies: payload.companies?.length || 0,
        branches: payload.branches?.length || 0,
    };
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

const getDeviceName = () => {
    const saved = localStorage.getItem(deviceNameKey);
    if (saved) return saved;
    const generated = `POS-${getDeviceId().slice(-6).toUpperCase()}`;
    localStorage.setItem(deviceNameKey, generated);
    return generated;
};

export const getWebTrackingConfig = (): WebTrackingConfig => ({
    endpoint: (() => {
        const saved = localStorage.getItem(endpointKey);
        return saved && !saved.startsWith(legacyVercelEndpoint) ? saved : defaultEndpoint;
    })(),
    token: localStorage.getItem(tokenKey) || defaultToken,
    lastSyncAt: localStorage.getItem(lastSyncKey),
    autoSyncEnabled: localStorage.getItem(autoSyncKey) !== 'false',
});

export const getWebTrackingSyncStatus = (): WebTrackingSyncStatus => {
    const result = localStorage.getItem(lastSyncResultKey);
    let parsed: Partial<WebTrackingSyncStatus> = {};
    try {
        parsed = result ? JSON.parse(result) as Partial<WebTrackingSyncStatus> : {};
    } catch {
        parsed = {};
    }
    return {
        lastSyncAt: localStorage.getItem(lastSyncKey),
        accepted: Number(parsed.accepted || 0),
        rejected: Number(parsed.rejected || 0),
        batchId: typeof parsed.batchId === 'string' ? parsed.batchId : null,
        error: localStorage.getItem(lastSyncErrorKey),
    };
};

export const saveWebTrackingConfig = (config: Pick<WebTrackingConfig, 'endpoint' | 'token'> & Partial<Pick<WebTrackingConfig, 'autoSyncEnabled'>>) => {
    const endpoint = normaliseEndpoint(config.endpoint || defaultEndpoint);
    const token = (config.token || defaultToken).trim();
    const fingerprint = `${endpoint}|${token}`;
    localStorage.setItem(endpointKey, endpoint);
    localStorage.setItem(tokenKey, token);
    // A new endpoint/token pair has never received this POS's data. Reset the
    // incremental cursor so the first automatic sync uploads the full dataset.
    if (localStorage.getItem(syncFingerprintKey) !== fingerprint) {
        localStorage.removeItem(lastSyncKey);
    }
    if (typeof config.autoSyncEnabled === 'boolean') {
        localStorage.setItem(autoSyncKey, String(config.autoSyncEnabled));
    }

    // A newly saved endpoint/token should be tested immediately. The queued
    // sync is intentionally non-blocking so the settings form remains usable.
    if (config.autoSyncEnabled !== false) {
        queueWebTrackingSync(500);
    }
};

export const testWebTrackingConnection = async (
    overrides: Partial<Pick<WebTrackingConfig, 'endpoint' | 'token'>> = {},
): Promise<WebTrackingConnectionResult> => {
    const config = { ...getWebTrackingConfig(), ...overrides };
    const endpoint = normaliseEndpoint(config.endpoint || defaultEndpoint);
    const token = (config.token || defaultToken).trim();
    const response = await fetch(`${endpoint}/api/overview/`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
    if (!response.ok) {
        const detail = typeof payload?.detail === 'string' ? payload.detail : typeof payload?.error === 'string' ? payload.error : '';
        throw new Error(detail || `Web tracking connection failed with status ${response.status}`);
    }

    return {
        companies: Array.isArray(payload?.companies) ? payload.companies.length : 0,
        branches: Array.isArray(payload?.branches) ? payload.branches.length : 0,
        users: Array.isArray(payload?.users) ? payload.users.length : 0,
    };
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
                // A full sync must also upload legacy records without timestamps.
                .filter((record) => !lastSyncAt || !recordUpdatedAt(record) || recordUpdatedAt(record) > since || entity === 'branches' || entity === 'companies')
                .filter((record) => String(entity === 'companies' ? record.id : record.companyId || getCurrentCompanyId()) === getCurrentCompanyId())
                .map((record) => {
                    const companyId = entity === 'companies'
                        ? String(record.companyId || record.id || getCurrentCompanyId())
                        : String(record.companyId || getCurrentCompanyId());

                    return toIsoValue({
                        ...sanitizeRecord(record),
                        companyId,
                        updatedAt: recordUpdatedAt(record) ? new Date(recordUpdatedAt(record)).toISOString() : new Date().toISOString(),
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
    if (!(config.token || defaultToken).trim() || (config.token || defaultToken).startsWith('demo-')) {
        const message = 'Create a desktop sync token in web Settings and save it in Web Tracking Sync.';
        localStorage.setItem(lastSyncErrorKey, message);
        throw new Error(message);
    }
    const syncStartedAt = new Date().toISOString();
    const changes = await collectWebTrackingChanges(forceFullSync ? null : config.lastSyncAt);
    let response: Response;
    try {
        response = await fetch(`${endpoint}/api/sync/push`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${config.token || defaultToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                deviceId: getDeviceId(),
                deviceName: getDeviceName(),
                batchId: globalThis.crypto?.randomUUID?.() || `batch-${Date.now()}`,
                scope: {
                    companyId: getCurrentCompanyId(),
                    // A POS can contain multiple branches. Send the company scope
                    // only so the server receives every local branch in one batch.
                    branchId: undefined,
                },
                // Empty batches are intentional: they act as a device heartbeat and
                // let the web dashboard show that this POS is still connected.
                changes,
            }),
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to reach web tracking endpoint';
        localStorage.setItem(lastSyncErrorKey, message);
        throw error;
    }

    if (!response.ok) {
        const message = await response.text().catch(() => '');
        localStorage.setItem(lastSyncErrorKey, message || `Web tracking sync failed with status ${response.status}`);
        throw new Error(message || `Web tracking sync failed with status ${response.status}`);
    }

    const result = (await response.json()) as WebTrackingPushResult;
    if (result.rejected > 0) {
        const message = `${result.accepted} records accepted, ${result.rejected} rejected. Check company/branch access, then run Sync All Data. The sync cursor has not advanced.`;
        localStorage.setItem(lastSyncErrorKey, message);
        throw new Error(message);
    }
    localStorage.setItem(lastSyncKey, syncStartedAt);
    localStorage.setItem(lastSyncResultKey, JSON.stringify({
        lastSyncAt: result.serverTime,
        accepted: result.accepted,
        rejected: result.rejected,
        batchId: result.batchId,
    }));
    localStorage.removeItem(lastSyncErrorKey);
    localStorage.setItem(syncFingerprintKey, `${endpoint}|${config.token || defaultToken}`);
    try {
        await pullWebOrganization(endpoint, config.token || defaultToken);
    } catch (error) {
        console.warn('Web organization pull failed after push:', error);
    }
    return result;
};

let autoSyncTimer: ReturnType<typeof setTimeout> | null = null;
let autoSyncRunning = false;
let automaticSyncEnabled = false;
let automaticSyncRetryCount = 0;
const automaticSyncRetryDelays = [5000, 15000, 60000];

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
            automaticSyncRetryCount = 0;
        } catch (error) {
            console.warn('Automatic web tracking sync failed:', error);
            if (automaticSyncRetryCount < automaticSyncRetryDelays.length) {
                const retryDelay = automaticSyncRetryDelays[automaticSyncRetryCount];
                automaticSyncRetryCount += 1;
                queueWebTrackingSync(retryDelay);
            } else {
                automaticSyncRetryCount = 0;
            }
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
