import { neon } from "@neondatabase/serverless";
import type {
  AuditEntry,
  AuthTokenRecord,
  BaseRecord,
  TrackingEntity,
  TrackingPrincipal,
  SyncPushPayload,
  SyncPushResult,
} from "./types";
import type { SyncBatchRecord, TrackingBackup } from "./repository";

type Sql = ReturnType<typeof neon>;
type Row = Record<string, unknown>;
type EntityTables = Partial<Record<TrackingEntity, Record<string, BaseRecord>>>;

const defaultCompanyId = "11111111-1111-1111-1111-111111111111";
const entities: TrackingEntity[] = [
  "companies", "branches", "users", "inventory", "customers", "suppliers",
  "sales", "purchases", "expenses", "cashbook", "customerPayments", "purchasePayments",
];

const json = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== "string") return (value as T) || fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
};

const auditFromRow = (row: Row): AuditEntry => ({
  id: String(row.id),
  actorId: String(row.actorid),
  actorName: String(row.actorname),
  companyId: String(row.companyid),
  branchId: row.branchid ? String(row.branchid) : undefined,
  entity: String(row.entity) as TrackingEntity,
  recordId: row.recordid ? String(row.recordid) : undefined,
  action: String(row.action) as AuditEntry["action"],
  timestamp: String(row.timestamp),
  metadata: row.metadata ? json<Record<string, unknown>>(row.metadata, {}) : undefined,
});

const tokenFromRow = (row: Row): AuthTokenRecord => ({
  id: String(row.id),
  userId: String(row.userid),
  name: String(row.name),
  tokenHash: String(row.tokenhash),
  createdAt: String(row.createdat),
  expiresAt: row.expiresat ? String(row.expiresat) : undefined,
  revokedAt: row.revokedat ? String(row.revokedat) : undefined,
  lastUsedAt: row.lastusedat ? String(row.lastusedat) : undefined,
});

const entityRecord = <TRecord extends BaseRecord>(row: Row) => json<TRecord>(row.data, {} as TRecord);

export const createPostgresTrackingRepository = (connectionString: string) => {
  const sql = neon(connectionString);
  let initialized: Promise<void> | undefined;

  const ensureSchema = async () => {
    if (!initialized) {
      initialized = (async () => {
        await sql`CREATE TABLE IF NOT EXISTS tracking_records (
          entity TEXT NOT NULL, id TEXT NOT NULL, company_id TEXT NOT NULL, branch_id TEXT,
          updated_at TIMESTAMPTZ NOT NULL, deleted_at TIMESTAMPTZ, data JSONB NOT NULL,
          PRIMARY KEY (entity, id)
        )`;
        await sql`CREATE INDEX IF NOT EXISTS tracking_records_scope ON tracking_records (entity, company_id, branch_id, deleted_at)`;
        await sql`CREATE TABLE IF NOT EXISTS tracking_audit (
          id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
          company_id TEXT NOT NULL, branch_id TEXT, entity TEXT NOT NULL, record_id TEXT,
          action TEXT NOT NULL, timestamp TIMESTAMPTZ NOT NULL, metadata JSONB
        )`;
        await sql`CREATE INDEX IF NOT EXISTS tracking_audit_scope ON tracking_audit (company_id, branch_id, timestamp)`;
        await sql`CREATE TABLE IF NOT EXISTS tracking_batches (
          batch_id TEXT PRIMARY KEY, device_id TEXT NOT NULL, company_id TEXT NOT NULL,
          branch_id TEXT, accepted INTEGER NOT NULL, rejected INTEGER NOT NULL,
          audit_ids JSONB NOT NULL, server_time TIMESTAMPTZ NOT NULL
        )`;
        await sql`CREATE TABLE IF NOT EXISTS tracking_devices (
          device_id TEXT PRIMARY KEY, device_name TEXT NOT NULL, company_id TEXT NOT NULL,
          branch_id TEXT, last_seen_at TIMESTAMPTZ NOT NULL, accepted INTEGER NOT NULL DEFAULT 0,
          rejected INTEGER NOT NULL DEFAULT 0, batches INTEGER NOT NULL DEFAULT 0, revoked_at TIMESTAMPTZ
        )`;
        await sql`CREATE INDEX IF NOT EXISTS tracking_devices_scope ON tracking_devices (company_id, branch_id, revoked_at)`;
        await sql`CREATE TABLE IF NOT EXISTS tracking_tokens (
          id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
          created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ, revoked_at TIMESTAMPTZ, last_used_at TIMESTAMPTZ
        )`;
        await sql`CREATE INDEX IF NOT EXISTS tracking_tokens_user ON tracking_tokens (user_id, revoked_at)`;
        const existing = await sql`SELECT id FROM tracking_records WHERE entity = 'companies' AND id = ${defaultCompanyId} AND deleted_at IS NULL LIMIT 1`;
        if (!existing.length) {
          const now = new Date().toISOString();
          await sql`INSERT INTO tracking_records (entity, id, company_id, updated_at, data)
            VALUES ('companies', ${defaultCompanyId}, ${defaultCompanyId}, ${now}, ${JSON.stringify({ id: defaultCompanyId, companyId: defaultCompanyId, name: "Default Company", legalName: "Default Company", status: "active", updatedAt: now })}::jsonb)`;
        }
      })();
    }
    await initialized;
  };

  const insertEntity = async (entity: TrackingEntity, record: BaseRecord) => {
    await sql`INSERT INTO tracking_records (entity, id, company_id, branch_id, updated_at, deleted_at, data)
      VALUES (${entity}, ${record.id}, ${record.companyId}, ${record.branchId || null}, ${record.updatedAt}, ${record.deletedAt || null}, ${JSON.stringify(record)}::jsonb)
      ON CONFLICT (entity, id) DO UPDATE SET company_id = EXCLUDED.company_id, branch_id = EXCLUDED.branch_id,
      updated_at = EXCLUDED.updated_at, deleted_at = EXCLUDED.deleted_at, data = EXCLUDED.data`;
  };

  const appendAudit = async (principal: TrackingPrincipal, entity: TrackingEntity, action: AuditEntry["action"], recordId: string | undefined, companyId: string, branchId?: string, metadata?: Record<string, unknown>) => {
    const entry: AuditEntry = { id: crypto.randomUUID(), actorId: principal.id, actorName: principal.name, companyId, branchId, entity, recordId, action, timestamp: new Date().toISOString(), metadata };
    await sql`INSERT INTO tracking_audit (id, actor_id, actor_name, company_id, branch_id, entity, record_id, action, timestamp, metadata)
      VALUES (${entry.id}, ${entry.actorId}, ${entry.actorName}, ${entry.companyId}, ${entry.branchId || null}, ${entry.entity}, ${entry.recordId || null}, ${entry.action}, ${entry.timestamp}, ${metadata ? JSON.stringify(metadata) : null}::jsonb)`;
    return entry;
  };

  const repository = {
    async getRecords<TRecord extends BaseRecord>(entity: TrackingEntity) { await ensureSchema(); const rows = await sql`SELECT data FROM tracking_records WHERE entity = ${entity} AND deleted_at IS NULL ORDER BY updated_at DESC`; return rows.map((row) => entityRecord<TRecord>(row)); },
    async getStorageStatus() { await ensureSchema(); const [records, audit, batches, tokens] = await Promise.all([sql`SELECT COUNT(*)::int AS count FROM tracking_records`, sql`SELECT COUNT(*)::int AS count FROM tracking_audit`, sql`SELECT COUNT(*)::int AS count FROM tracking_batches`, sql`SELECT COUNT(*)::int AS count FROM tracking_tokens`]); return { driver: "postgres", databasePath: "neon", legacyJsonPath: "", counts: { records: Number(records[0]?.count || 0), audit: Number(audit[0]?.count || 0), syncBatches: Number(batches[0]?.count || 0), authTokens: Number(tokens[0]?.count || 0) } }; },
    async getDeviceStatuses(companyId: string, branchId?: string) { await ensureSchema(); const rows = branchId ? await sql`SELECT device_id AS "deviceId", device_name AS "deviceName", company_id AS "companyId", branch_id AS "branchId", last_seen_at AS "lastSeenAt", accepted, rejected, batches, revoked_at AS "revokedAt" FROM tracking_devices WHERE company_id = ${companyId} AND (branch_id IS NULL OR branch_id = '' OR branch_id = ${branchId}) ORDER BY last_seen_at DESC` : await sql`SELECT device_id AS "deviceId", device_name AS "deviceName", company_id AS "companyId", branch_id AS "branchId", last_seen_at AS "lastSeenAt", accepted, rejected, batches, revoked_at AS "revokedAt" FROM tracking_devices WHERE company_id = ${companyId} ORDER BY last_seen_at DESC`; return rows.map((row) => ({ deviceId: String(row.deviceId), deviceName: String(row.deviceName), companyId: String(row.companyId), branchId: row.branchId ? String(row.branchId) : undefined, lastSeenAt: String(row.lastSeenAt), accepted: Number(row.accepted), rejected: Number(row.rejected), batches: Number(row.batches), revokedAt: row.revokedAt ? String(row.revokedAt) : undefined })); },
    async registerDevice(device: { deviceId: string; deviceName?: string; companyId: string; branchId?: string; accepted: number; rejected: number }) { await ensureSchema(); const existing = await sql`SELECT revoked_at FROM tracking_devices WHERE device_id = ${device.deviceId}`; if (existing[0]?.revoked_at) return false; const now = new Date().toISOString(); await sql`INSERT INTO tracking_devices (device_id, device_name, company_id, branch_id, last_seen_at, accepted, rejected, batches) VALUES (${device.deviceId}, ${device.deviceName || device.deviceId}, ${device.companyId}, ${device.branchId || null}, ${now}, ${device.accepted}, ${device.rejected}, 1) ON CONFLICT (device_id) DO UPDATE SET device_name = EXCLUDED.device_name, company_id = EXCLUDED.company_id, branch_id = EXCLUDED.branch_id, last_seen_at = EXCLUDED.last_seen_at, accepted = tracking_devices.accepted + EXCLUDED.accepted, rejected = tracking_devices.rejected + EXCLUDED.rejected, batches = tracking_devices.batches + 1`; return true; },
    async revokeDevice(principal: TrackingPrincipal, deviceId: string, companyId: string) { if (principal.role !== "owner" && !principal.permissions.includes("users.update")) return false; await ensureSchema(); const result = await sql`UPDATE tracking_devices SET revoked_at = ${new Date().toISOString()} WHERE device_id = ${deviceId} AND company_id = ${companyId}`; return result.length > 0; },
    async getRecord<TRecord extends BaseRecord>(entity: TrackingEntity, id: string) { await ensureSchema(); const rows = await sql`SELECT data FROM tracking_records WHERE entity = ${entity} AND id = ${id} AND deleted_at IS NULL`; return rows[0] ? entityRecord<TRecord>(rows[0]) : null; },
    async findRecordBy<TRecord extends BaseRecord>(entity: TrackingEntity, predicate: (record: TRecord) => boolean) { const records = await this.getRecords<TRecord>(entity); return records.find(predicate) || null; },
    async getScopedRecords<TRecord extends BaseRecord>(entity: TrackingEntity, companyId: string, branchId?: string) { await ensureSchema(); const rows = branchId ? await sql`SELECT data FROM tracking_records WHERE entity = ${entity} AND company_id = ${companyId} AND deleted_at IS NULL AND (branch_id IS NULL OR branch_id = '' OR branch_id = ${branchId}) ORDER BY updated_at DESC` : await sql`SELECT data FROM tracking_records WHERE entity = ${entity} AND company_id = ${companyId} AND deleted_at IS NULL ORDER BY updated_at DESC`; return rows.map((row) => entityRecord<TRecord>(row)); },
    async getAudit(companyId: string, branchId?: string, limit = 100) { await ensureSchema(); const capped = Math.min(limit, 250); const rows = branchId ? await sql`SELECT id, actor_id AS actorid, actor_name AS actorname, company_id AS companyid, branch_id AS branchid, entity, record_id AS recordid, action, timestamp, metadata FROM tracking_audit WHERE company_id = ${companyId} AND (branch_id IS NULL OR branch_id = '' OR branch_id = ${branchId}) ORDER BY timestamp DESC LIMIT ${capped}` : await sql`SELECT id, actor_id AS actorid, actor_name AS actorname, company_id AS companyid, branch_id AS branchid, entity, record_id AS recordid, action, timestamp, metadata FROM tracking_audit WHERE company_id = ${companyId} ORDER BY timestamp DESC LIMIT ${capped}`; return rows.map(auditFromRow); },
    async upsertRecord<TRecord extends BaseRecord>(principal: TrackingPrincipal, entity: TrackingEntity, record: TRecord, action: "create" | "update") { await ensureSchema(); await insertEntity(entity, record); await appendAudit(principal, entity, action, record.id, record.companyId, record.branchId, { updatedAt: record.updatedAt }); return record; },
    async softDeleteRecord(principal: TrackingPrincipal, entity: TrackingEntity, id: string, companyId: string, branchId?: string) { const existing = await this.getRecord<BaseRecord>(entity, id); if (!existing || existing.companyId !== companyId || (branchId && existing.branchId && existing.branchId !== branchId)) return null; const deleted = { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await insertEntity(entity, deleted); await appendAudit(principal, entity, "delete", id, companyId, existing.branchId || branchId, { updatedAt: deleted.updatedAt }); return deleted; },
    async createAuthToken(token: AuthTokenRecord) { await ensureSchema(); await sql`INSERT INTO tracking_tokens (id, user_id, name, token_hash, created_at, expires_at, revoked_at, last_used_at) VALUES (${token.id}, ${token.userId}, ${token.name}, ${token.tokenHash}, ${token.createdAt}, ${token.expiresAt || null}, ${token.revokedAt || null}, ${token.lastUsedAt || null}) ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, revoked_at = EXCLUDED.revoked_at, last_used_at = EXCLUDED.last_used_at`; return token; },
    async getAuthTokenByHash(tokenHash: string) { await ensureSchema(); const rows = await sql`SELECT id, user_id AS userid, name, token_hash AS tokenhash, created_at AS createdat, expires_at AS expiresat, revoked_at AS revokedat, last_used_at AS lastusedat FROM tracking_tokens WHERE token_hash = ${tokenHash}`; if (!rows[0]) return null; const token = tokenFromRow(rows[0]); if (token.revokedAt || (token.expiresAt && new Date(token.expiresAt).getTime() < Date.now())) return null; token.lastUsedAt = new Date().toISOString(); await sql`UPDATE tracking_tokens SET last_used_at = ${token.lastUsedAt} WHERE id = ${token.id}`; return token; },
    async getAuthTokensForUser(userId: string) { await ensureSchema(); const rows = await sql`SELECT id, user_id AS userid, name, token_hash AS tokenhash, created_at AS createdat, expires_at AS expiresat, revoked_at AS revokedat, last_used_at AS lastusedat FROM tracking_tokens WHERE user_id = ${userId} ORDER BY created_at DESC`; return rows.map(tokenFromRow); },
    async revokeAuthToken(userId: string, tokenId: string) { await ensureSchema(); const rows = await sql`UPDATE tracking_tokens SET revoked_at = ${new Date().toISOString()} WHERE id = ${tokenId} AND user_id = ${userId} RETURNING id, user_id AS userid, name, token_hash AS tokenhash, created_at AS createdat, expires_at AS expiresat, revoked_at AS revokedat, last_used_at AS lastusedat`; return rows[0] ? tokenFromRow(rows[0]) : null; },
    async exportBackup(): Promise<TrackingBackup> { await ensureSchema(); const [records, audit, batches, tokens] = await Promise.all([sql`SELECT entity, data FROM tracking_records`, sql`SELECT id, actor_id AS actorid, actor_name AS actorname, company_id AS companyid, branch_id AS branchid, entity, record_id AS recordid, action, timestamp, metadata FROM tracking_audit ORDER BY timestamp DESC`, sql`SELECT * FROM tracking_batches`, sql`SELECT id, user_id AS userid, name, token_hash AS tokenhash, created_at AS createdat, expires_at AS expiresat, revoked_at AS revokedat, last_used_at AS lastusedat FROM tracking_tokens`]); const entitiesData: EntityTables = {}; for (const row of records) { const record = entityRecord<BaseRecord>(row); if (record.id) (entitiesData[row.entity as TrackingEntity] ||= {})[record.id] = record; } const syncBatches: Record<string, SyncBatchRecord> = {}; for (const row of batches) syncBatches[String(row.batch_id)] = { batchId: String(row.batch_id), deviceId: String(row.device_id), companyId: String(row.company_id), branchId: row.branch_id ? String(row.branch_id) : undefined, accepted: Number(row.accepted), rejected: Number(row.rejected), auditIds: json<string[]>(row.audit_ids, []), serverTime: String(row.server_time) }; const authTokens: Record<string, AuthTokenRecord> = {}; for (const row of tokens) { const token = tokenFromRow(row); authTokens[token.id] = token; } return { schemaVersion: 1, exportedAt: new Date().toISOString(), entities: entitiesData, audit: audit.map(auditFromRow), syncBatches, authTokens }; },
    async restoreBackup(principal: TrackingPrincipal, backup: TrackingBackup) { if (backup?.schemaVersion !== 1 || !backup.entities) throw new Error("Unsupported tracking backup format"); await ensureSchema(); await sql`TRUNCATE tracking_records, tracking_audit, tracking_batches, tracking_tokens, tracking_devices`; for (const [entity, table] of Object.entries(backup.entities) as [TrackingEntity, Record<string, BaseRecord>][]) for (const record of Object.values(table || {})) if (record?.id && record.companyId && record.updatedAt) await insertEntity(entity, record); for (const entry of backup.audit || []) await sql`INSERT INTO tracking_audit (id, actor_id, actor_name, company_id, branch_id, entity, record_id, action, timestamp, metadata) VALUES (${entry.id}, ${entry.actorId}, ${entry.actorName}, ${entry.companyId}, ${entry.branchId || null}, ${entry.entity}, ${entry.recordId || null}, ${entry.action}, ${entry.timestamp}, ${entry.metadata ? JSON.stringify(entry.metadata) : null}::jsonb)`; for (const token of Object.values(backup.authTokens || {})) await this.createAuthToken(token); await appendAudit(principal, "companies", "restore", undefined, principal.companyIds[0] || defaultCompanyId, principal.branchIds[0], { restoredAt: new Date().toISOString() }); return { ok: true, restoredAt: new Date().toISOString() }; },
    async applySyncPush(principal: TrackingPrincipal, payload: SyncPushPayload): Promise<SyncPushResult> { await ensureSchema(); const previous = await sql`SELECT * FROM tracking_batches WHERE batch_id = ${payload.batchId}`; if (previous[0]) return { batchId: String(previous[0].batch_id), accepted: Number(previous[0].accepted), rejected: Number(previous[0].rejected), auditIds: json<string[]>(previous[0].audit_ids, []), serverTime: new Date().toISOString(), replayed: true }; const allowed = await this.registerDevice({ deviceId: payload.deviceId, deviceName: payload.deviceName, companyId: payload.scope.companyId, branchId: payload.scope.branchId, accepted: 0, rejected: 0 }); if (!allowed) throw new Error("Device access has been revoked"); let accepted = 0; let rejected = 0; const auditIds: string[] = []; for (const [entity, records] of Object.entries(payload.changes) as [TrackingEntity, BaseRecord[]][]) for (const record of records || []) { if (!entities.includes(entity) || !record.id || !record.updatedAt || record.companyId !== payload.scope.companyId || (payload.scope.branchId && record.branchId && record.branchId !== payload.scope.branchId) || (principal.role !== "owner" && record.branchId && !principal.branchIds.includes(record.branchId))) { rejected++; continue; } await insertEntity(entity, record); const audit = await appendAudit(principal, entity, record.deletedAt ? "delete" : "sync", record.id, record.companyId, record.branchId, { batchId: payload.batchId, deviceId: payload.deviceId, updatedAt: record.updatedAt }); auditIds.push(audit.id); accepted++; } const result: SyncPushResult = { batchId: payload.batchId, accepted, rejected, auditIds, serverTime: new Date().toISOString() }; await sql`UPDATE tracking_devices SET accepted = accepted + ${accepted}, rejected = rejected + ${rejected}, last_seen_at = ${result.serverTime} WHERE device_id = ${payload.deviceId}`; await sql`INSERT INTO tracking_batches (batch_id, device_id, company_id, branch_id, accepted, rejected, audit_ids, server_time) VALUES (${result.batchId}, ${payload.deviceId}, ${payload.scope.companyId}, ${payload.scope.branchId || null}, ${accepted}, ${rejected}, ${JSON.stringify(auditIds)}::jsonb, ${result.serverTime})`; return result; },
  };
  return repository;
};
