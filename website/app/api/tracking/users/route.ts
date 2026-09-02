import { authenticate } from "../../../../lib/tracking/auth";
import { createPasswordHash } from "../../../../lib/tracking/auth";
import { can, canUseScope } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type { Permission, Role, TrackingPrincipal, UserRecord } from "../../../../lib/tracking/types";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const roles: Role[] = ["admin", "manager", "cashier", "accountant", "inventory"];

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const cleanList = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];

const cleanRole = (value: unknown): Role => {
  const role = cleanText(value) as Role;
  return roles.includes(role) ? role : "cashier";
};

const publicUser = (record: UserRecord) => {
  const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...safeRecord } = record;
  return safeRecord;
};

const buildUserRecord = (body: Record<string, unknown>, id: string, existing?: UserRecord | null): UserRecord => {
  const companyIds = cleanList(body.companyIds);
  const branchIds = cleanList(body.branchIds);
  const primaryCompanyId = companyIds[0];
  const password = cleanText(body.password);

  return {
    ...(existing || {}),
    id,
    companyId: primaryCompanyId,
    branchId: branchIds[0],
    username: cleanText(body.username),
    name: cleanText(body.name),
    role: cleanRole(body.role),
    companyIds,
    branchIds,
    permissions: cleanList(body.permissions) as Permission[],
    status: body.status === "inactive" ? "inactive" : "active",
    updatedAt: new Date().toISOString(),
    ...(password ? createPasswordHash(password) : {}),
  };
};

const validateUserRecord = (record: UserRecord) => {
  if (!record.username || !record.name) return "Name and username are required";
  if (!record.companyIds.length) return "At least one company is required";
  if (!record.branchIds.length) return "At least one branch is required";
  return "";
};

const canManageUserScope = (principal: TrackingPrincipal, record: UserRecord) => {
  return record.companyIds.every((companyId) => canUseScope(principal, companyId)) &&
    record.branchIds.every((branchId) => record.companyIds.some((companyId) => canUseScope(principal, companyId, branchId)));
};

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "users.create")) return forbidden("Missing users.create permission");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Expected a user payload");

  const record = buildUserRecord(body as Record<string, unknown>, crypto.randomUUID());
  const validation = validateUserRecord(record);
  if (validation) return badRequest(validation);
  if (!canManageUserScope(principal, record)) return forbidden("User scope is outside this manager's access");

  const saved = await trackingRepository.upsertRecord(principal, "users", record, "create");
  return json(publicUser(saved), { status: 201 });
}

export async function PUT(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "users.update")) return forbidden("Missing users.update permission");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Expected a user payload");

  const id = cleanText((body as Record<string, unknown>).id);
  if (!id) return badRequest("User id is required");
  if (id === principal.id) return badRequest("You cannot edit your own active tracking identity here");

  const existing = await trackingRepository.getRecord<UserRecord>("users", id);
  const record = buildUserRecord(body as Record<string, unknown>, id, existing);
  const validation = validateUserRecord(record);
  if (validation) return badRequest(validation);
  if (!canManageUserScope(principal, record)) return forbidden("User scope is outside this manager's access");

  const saved = await trackingRepository.upsertRecord(principal, "users", record, "update");
  return json(publicUser(saved));
}

export async function DELETE(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "users.delete")) return forbidden("Missing users.delete permission");

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"));
  const companyId = cleanText(url.searchParams.get("companyId"));
  const branchId = cleanText(url.searchParams.get("branchId"));
  if (!id || !companyId) return badRequest("User id and company id are required");
  if (id === principal.id) return badRequest("You cannot delete your own active tracking identity");
  if (!canUseScope(principal, companyId, branchId || undefined)) return forbidden("User is outside this manager's scope");

  const deleted = await trackingRepository.softDeleteRecord(principal, "users", id, companyId, branchId || undefined);
  if (!deleted) return badRequest("User was not found");
  return json({ ok: true, deleted });
}
