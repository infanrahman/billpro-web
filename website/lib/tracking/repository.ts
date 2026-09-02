import { existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { trackingConfig } from "./config";
import type {
  AuditEntry,
  AuthTokenRecord,
  BaseRecord,
  CompanyRecord,
  SyncPushPayload,
  SyncPushResult,
  TrackingEntity,
  TrackingPrincipal,
} from "./types";

type EntityTables = Partial<Record<TrackingEntity, Record<string, BaseRecord>>>;

interface SyncBatchRecord extends SyncPushResult {
  deviceId: string;
  companyId: string;
  branchId?: string;
}

interface LegacyTrackingDatabase {
  entities?: EntityTables;
  audit?: AuditEntry[];
  syncBatches?: Record<string, SyncBatchRecord>;
  authTokens?: Record<string, AuthTokenRecord>;
}

type EntityRow = {
  data: string;
};

type AuditRow = {
  id: string;
  actorId: string;
  actorName: string;
  companyId: string;
  branchId: string | null;
  entity: string;
  recordId: string | null;
  action: string;
  timestamp: string;
  metadata: string | null;
};

type TokenRow = {
  id: string;
  userId: string;
  name: string;
  tokenHash: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
};

type BatchRow = {
  data: string;
};

export interface TrackingBackup {
  schemaVersion: 1;
  exportedAt: string;
  entities: EntityTables;
  audit: AuditEntry[];
  syncBatches: Record<string, SyncBatchRecord>;
  authTokens: Record<string, AuthTokenRecord>;
}

const databasePath = trackingConfig.databasePath;
const dataDir = path.dirname(databasePath);
const legacyJsonPath = trackingConfig.legacyJsonPath;
const defaultCompanyId = "11111111-1111-1111-1111-111111111111";

const defaultCompany: CompanyRecord = {
  id: defaultCompanyId,
  companyId: defaultCompanyId,
  name: "Default Company",
  legalName: "Default Company",
  status: "active",
  updatedAt: new Date().toISOString(),
};

let database: DatabaseSync | null = null;

const parseJson = <T>(value: string | null | undefined, fallback: T): T => {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

const recordFromRow = <TRecord extends BaseRecord>(row: EntityRow) => parseJson<TRecord>(row.data, {} as TRecord);

const auditFromRow = (row: AuditRow): AuditEntry => ({
  id: row.id,
  actorId: row.actorId,
  actorName: row.actorName,
  companyId: row.companyId,
  branchId: row.branchId || undefined,
  entity: row.entity as TrackingEntity,
  recordId: row.recordId || undefined,
  action: row.action as AuditEntry["action"],
  timestamp: row.timestamp,
  metadata: parseJson<Record<string, unknown> | undefined>(row.metadata, undefined),
});

const tokenFromRow = (row: TokenRow): AuthTokenRecord => ({
  id: row.id,
  userId: row.userId,
  name: row.name,
  tokenHash: row.tokenHash,
  createdAt: row.createdAt,
  expiresAt: row.expiresAt || undefined,
  revokedAt: row.revokedAt || undefined,
  lastUsedAt: row.lastUsedAt || undefined,
});

const insertEntity = (db: DatabaseSync, entity: TrackingEntity, record: BaseRecord) => {
  db.prepare(`
    INSERT OR REPLACE INTO records (entity, id, companyId, branchId, updatedAt, deletedAt, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    entity,
    record.id,
    record.companyId,
    record.branchId || null,
    record.updatedAt,
    record.deletedAt || null,
    JSON.stringify(record),
  );
};

const insertAudit = (db: DatabaseSync, entry: AuditEntry) => {
  db.prepare(`
    INSERT OR REPLACE INTO audit (id, actorId, actorName, companyId, branchId, entity, recordId, action, timestamp, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.actorId,
    entry.actorName,
    entry.companyId,
    entry.branchId || null,
    entry.entity,
    entry.recordId || null,
    entry.action,
    entry.timestamp,
    entry.metadata ? JSON.stringify(entry.metadata) : null,
  );
};

const insertBatch = (db: DatabaseSync, batch: SyncBatchRecord) => {
  db.prepare(`
    INSERT OR REPLACE INTO sync_batches (batchId, deviceId, companyId, branchId, data)
    VALUES (?, ?, ?, ?, ?)
  `).run(batch.batchId, batch.deviceId, batch.companyId, batch.branchId || null, JSON.stringify(batch));
};

const insertToken = (db: DatabaseSync, token: AuthTokenRecord) => {
  db.prepare(`
    INSERT OR REPLACE INTO auth_tokens (id, userId, name, tokenHash, createdAt, expiresAt, revokedAt, lastUsedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    token.id,
    token.userId,
    token.name,
    token.tokenHash,
    token.createdAt,
    token.expiresAt || null,
    token.revokedAt || null,
    token.lastUsedAt || null,
  );
};

const clearDatabaseData = (db: DatabaseSync) => {
  db.prepare("DELETE FROM records").run();
  db.prepare("DELETE FROM audit").run();
  db.prepare("DELETE FROM sync_batches").run();
  db.prepare("DELETE FROM auth_tokens").run();
};

const migrateLegacyJson = (db: DatabaseSync) => {
  const migrated = db.prepare("SELECT value FROM meta WHERE key = ?").get("legacyJsonMigrated") as { value?: string } | undefined;
  if (migrated?.value === "true" || !existsSync(legacyJsonPath)) return;

  const legacy = parseJson<LegacyTrackingDatabase>(readFileSync(legacyJsonPath, "utf8"), {});
  for (const [entity, table] of Object.entries(legacy.entities || {}) as [TrackingEntity, Record<string, BaseRecord>][]) {
    for (const record of Object.values(table)) {
      if (record?.id && record.companyId && record.updatedAt) insertEntity(db, entity, record);
    }
  }
  for (const entry of legacy.audit || []) insertAudit(db, entry);
  for (const batch of Object.values(legacy.syncBatches || {})) insertBatch(db, batch);
  for (const token of Object.values(legacy.authTokens || {})) insertToken(db, token);

  db.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)").run("legacyJsonMigrated", "true");
};

const getDatabase = () => {
  if (database) return database;

  mkdirSync(dataDir, { recursive: true });
  database = new DatabaseSync(databasePath);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS records (
      entity TEXT NOT NULL,
      id TEXT NOT NULL,
      companyId TEXT NOT NULL,
      branchId TEXT,
      updatedAt TEXT NOT NULL,
      deletedAt TEXT,
      data TEXT NOT NULL,
      PRIMARY KEY (entity, id)
    );
    CREATE INDEX IF NOT EXISTS idx_records_scope ON records (entity, companyId, branchId, deletedAt);
    CREATE TABLE IF NOT EXISTS audit (
      id TEXT PRIMARY KEY,
      actorId TEXT NOT NULL,
      actorName TEXT NOT NULL,
      companyId TEXT NOT NULL,
      branchId TEXT,
      entity TEXT NOT NULL,
      recordId TEXT,
      action TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_audit_scope ON audit (companyId, branchId, timestamp);
    CREATE TABLE IF NOT EXISTS sync_batches (
      batchId TEXT PRIMARY KEY,
      deviceId TEXT NOT NULL,
      companyId TEXT NOT NULL,
      branchId TEXT,
      data TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auth_tokens (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT NOT NULL,
      tokenHash TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL,
      expiresAt TEXT,
      revokedAt TEXT,
      lastUsedAt TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_auth_tokens_user ON auth_tokens (userId, revokedAt);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  migrateLegacyJson(database);

  const existingCompany = database
    .prepare("SELECT data FROM records WHERE entity = ? AND id = ? AND deletedAt IS NULL")
    .get("companies", defaultCompanyId) as EntityRow | undefined;
  if (!existingCompany) insertEntity(database, "companies", defaultCompany);

  return database;
};

const appendAudit = (
  db: DatabaseSync,
  principal: TrackingPrincipal,
  entity: TrackingEntity,
  action: AuditEntry["action"],
  recordId: string | undefined,
  companyId: string,
  branchId: string | undefined,
  metadata?: Record<string, unknown>,
) => {
  const entry: AuditEntry = {
    id: crypto.randomUUID(),
    actorId: principal.id,
    actorName: principal.name,
    companyId,
    branchId,
    entity,
    recordId,
    action,
    timestamp: new Date().toISOString(),
    metadata,
  };
  insertAudit(db, entry);
  return entry;
};

export const trackingRepository = {
  async getRecords<TRecord extends BaseRecord>(entity: TrackingEntity) {
    const db = getDatabase();
    return db
      .prepare("SELECT data FROM records WHERE entity = ? AND deletedAt IS NULL ORDER BY updatedAt DESC")
      .all(entity)
      .map((row) => recordFromRow<TRecord>(row as EntityRow));
  },

  async getStorageStatus() {
    const db = getDatabase();
    const counts = {
      records: (db.prepare("SELECT COUNT(*) AS count FROM records").get() as { count: number }).count,
      audit: (db.prepare("SELECT COUNT(*) AS count FROM audit").get() as { count: number }).count,
      syncBatches: (db.prepare("SELECT COUNT(*) AS count FROM sync_batches").get() as { count: number }).count,
      authTokens: (db.prepare("SELECT COUNT(*) AS count FROM auth_tokens").get() as { count: number }).count,
    };
    return {
      driver: "sqlite",
      databasePath,
      legacyJsonPath,
      counts,
    };
  },

  async getRecord<TRecord extends BaseRecord>(entity: TrackingEntity, id: string) {
    const db = getDatabase();
    const row = db
      .prepare("SELECT data FROM records WHERE entity = ? AND id = ? AND deletedAt IS NULL")
      .get(entity, id) as EntityRow | undefined;
    return row ? recordFromRow<TRecord>(row) : null;
  },

  async findRecordBy<TRecord extends BaseRecord>(
    entity: TrackingEntity,
    predicate: (record: TRecord) => boolean,
  ) {
    const records = await this.getRecords<TRecord>(entity);
    return records.find(predicate) || null;
  },

  async getScopedRecords<TRecord extends BaseRecord>(entity: TrackingEntity, companyId: string, branchId?: string) {
    const db = getDatabase();
    const rows = branchId
      ? db.prepare(`
          SELECT data FROM records
          WHERE entity = ? AND companyId = ? AND deletedAt IS NULL AND (branchId IS NULL OR branchId = '' OR branchId = ?)
          ORDER BY updatedAt DESC
        `).all(entity, companyId, branchId)
      : db.prepare(`
          SELECT data FROM records
          WHERE entity = ? AND companyId = ? AND deletedAt IS NULL
          ORDER BY updatedAt DESC
        `).all(entity, companyId);
    return rows.map((row) => recordFromRow<TRecord>(row as EntityRow));
  },

  async getAudit(companyId: string, branchId?: string, limit = 100) {
    const db = getDatabase();
    const cappedLimit = Math.min(limit, 250);
    const rows = branchId
      ? db.prepare(`
          SELECT * FROM audit
          WHERE companyId = ? AND (branchId IS NULL OR branchId = '' OR branchId = ?)
          ORDER BY timestamp DESC
          LIMIT ?
        `).all(companyId, branchId, cappedLimit)
      : db.prepare(`
          SELECT * FROM audit
          WHERE companyId = ?
          ORDER BY timestamp DESC
          LIMIT ?
        `).all(companyId, cappedLimit);
    return rows.map((row) => auditFromRow(row as AuditRow));
  },

  async upsertRecord<TRecord extends BaseRecord>(
    principal: TrackingPrincipal,
    entity: TrackingEntity,
    record: TRecord,
    action: "create" | "update",
  ) {
    const db = getDatabase();
    insertEntity(db, entity, record);
    appendAudit(db, principal, entity, action, record.id, record.companyId, record.branchId, {
      updatedAt: record.updatedAt,
    });
    return record;
  },

  async softDeleteRecord(principal: TrackingPrincipal, entity: TrackingEntity, id: string, companyId: string, branchId?: string) {
    const existing = await this.getRecord<BaseRecord>(entity, id);
    if (!existing || existing.companyId !== companyId || (branchId && existing.branchId && existing.branchId !== branchId)) {
      return null;
    }

    const deleted = {
      ...existing,
      deletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const db = getDatabase();
    insertEntity(db, entity, deleted);
    appendAudit(db, principal, entity, "delete", id, companyId, existing.branchId || branchId, {
      updatedAt: deleted.updatedAt,
    });
    return deleted;
  },

  async createAuthToken(token: AuthTokenRecord) {
    insertToken(getDatabase(), token);
    return token;
  },

  async getAuthTokenByHash(tokenHash: string) {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM auth_tokens WHERE tokenHash = ?").get(tokenHash) as TokenRow | undefined;
    if (!row) return null;

    const token = tokenFromRow(row);
    if (token.revokedAt) return null;
    if (token.expiresAt && new Date(token.expiresAt).getTime() < Date.now()) return null;

    token.lastUsedAt = new Date().toISOString();
    insertToken(db, token);
    return token;
  },

  async getAuthTokensForUser(userId: string) {
    const rows = getDatabase()
      .prepare("SELECT * FROM auth_tokens WHERE userId = ? ORDER BY createdAt DESC")
      .all(userId);
    return rows.map((row) => tokenFromRow(row as TokenRow));
  },

  async revokeAuthToken(userId: string, tokenId: string) {
    const db = getDatabase();
    const row = db.prepare("SELECT * FROM auth_tokens WHERE id = ? AND userId = ?").get(tokenId, userId) as TokenRow | undefined;
    if (!row) return null;

    const token = {
      ...tokenFromRow(row),
      revokedAt: new Date().toISOString(),
    };
    insertToken(db, token);
    return token;
  },

  async exportBackup() {
    const db = getDatabase();
    const backup: TrackingBackup = {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      entities: {},
      audit: db.prepare("SELECT * FROM audit ORDER BY timestamp DESC").all().map((row) => auditFromRow(row as AuditRow)),
      syncBatches: {},
      authTokens: {},
    };

    for (const row of db.prepare("SELECT entity, data FROM records").all() as Array<{ entity: TrackingEntity; data: string }>) {
      const record = parseJson<BaseRecord>(row.data, {} as BaseRecord);
      if (!backup.entities[row.entity]) backup.entities[row.entity] = {};
      if (record.id) backup.entities[row.entity]![record.id] = record;
    }

    for (const row of db.prepare("SELECT data FROM sync_batches").all() as BatchRow[]) {
      const batch = parseJson<SyncBatchRecord>(row.data, {} as SyncBatchRecord);
      if (batch.batchId) backup.syncBatches[batch.batchId] = batch;
    }

    for (const row of db.prepare("SELECT * FROM auth_tokens").all() as TokenRow[]) {
      const token = tokenFromRow(row);
      backup.authTokens[token.id] = token;
    }

    return backup;
  },

  async restoreBackup(principal: TrackingPrincipal, backup: TrackingBackup) {
    if (backup?.schemaVersion !== 1 || !backup.entities) {
      throw new Error("Unsupported tracking backup format");
    }

    const db = getDatabase();
    db.exec("BEGIN");
    try {
      clearDatabaseData(db);
      for (const [entity, table] of Object.entries(backup.entities) as [TrackingEntity, Record<string, BaseRecord>][]) {
        for (const record of Object.values(table || {})) {
          if (record?.id && record.companyId && record.updatedAt) insertEntity(db, entity, record);
        }
      }
      for (const entry of backup.audit || []) insertAudit(db, entry);
      for (const batch of Object.values(backup.syncBatches || {})) insertBatch(db, batch);
      for (const token of Object.values(backup.authTokens || {})) insertToken(db, token);

      appendAudit(db, principal, "backup", "restore", undefined, principal.companyIds[0] || defaultCompanyId, principal.branchIds[0], {
        restoredAt: new Date().toISOString(),
      });
      db.exec("COMMIT");
      return { ok: true, restoredAt: new Date().toISOString() };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },

  async applySyncPush(principal: TrackingPrincipal, payload: SyncPushPayload): Promise<SyncPushResult> {
    const db = getDatabase();
    const previousBatch = db.prepare("SELECT data FROM sync_batches WHERE batchId = ?").get(payload.batchId) as { data: string } | undefined;
    if (previousBatch) {
      const batch = parseJson<SyncBatchRecord>(previousBatch.data, {} as SyncBatchRecord);
      return {
        batchId: batch.batchId,
        accepted: batch.accepted,
        rejected: batch.rejected,
        auditIds: batch.auditIds,
        serverTime: new Date().toISOString(),
        replayed: true,
      };
    }

    let accepted = 0;
    let rejected = 0;
    const auditIds: string[] = [];

    db.exec("BEGIN");
    try {
      for (const [entity, records] of Object.entries(payload.changes) as [TrackingEntity, BaseRecord[]][]) {
        for (const record of records || []) {
          if (!record.id || !record.updatedAt || record.companyId !== payload.scope.companyId) {
            rejected += 1;
            continue;
          }
          if (payload.scope.branchId && record.branchId && record.branchId !== payload.scope.branchId) {
            rejected += 1;
            continue;
          }

          insertEntity(db, entity, record);
          const audit = appendAudit(
            db,
            principal,
            entity,
            record.deletedAt ? "delete" : "sync",
            record.id,
            record.companyId,
            record.branchId,
            { batchId: payload.batchId, deviceId: payload.deviceId, updatedAt: record.updatedAt },
          );
          auditIds.push(audit.id);
          accepted += 1;
        }
      }

      const result: SyncPushResult = {
        batchId: payload.batchId,
        accepted,
        rejected,
        auditIds,
        serverTime: new Date().toISOString(),
      };

      insertBatch(db, {
        ...result,
        deviceId: payload.deviceId,
        companyId: payload.scope.companyId,
        branchId: payload.scope.branchId,
      });
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  },
};
