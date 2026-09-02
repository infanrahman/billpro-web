import { authenticate } from "../../../../lib/tracking/auth";
import { can, canUseScope } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type { BranchRecord } from "../../../../lib/tracking/types";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "branches.create")) return forbidden("Missing branches.create permission");

  const body = await request.json().catch(() => null);
  const companyId = cleanText(body?.companyId);
  const name = cleanText(body?.name);
  if (!companyId || !name) return badRequest("Company id and branch name are required");
  if (!canUseScope(principal, companyId)) return forbidden("Company is outside this user's scope");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: BranchRecord = {
    id,
    companyId,
    branchId: id,
    name,
    location: cleanText(body?.location) || undefined,
    isMaster: Boolean(body?.isMaster),
    status: body?.status === "inactive" ? "inactive" : "active",
    updatedAt: now,
  };

  return json(await trackingRepository.upsertRecord(principal, "branches", record, "create"), { status: 201 });
}

export async function PUT(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "branches.update")) return forbidden("Missing branches.update permission");

  const body = await request.json().catch(() => null);
  const id = cleanText(body?.id);
  const companyId = cleanText(body?.companyId);
  const name = cleanText(body?.name);
  if (!id || !companyId || !name) return badRequest("Branch id, company id, and branch name are required");
  if (!canUseScope(principal, companyId, id)) return forbidden("Branch is outside this user's scope");

  const record: BranchRecord = {
    id,
    companyId,
    branchId: id,
    name,
    location: cleanText(body?.location) || undefined,
    isMaster: Boolean(body?.isMaster),
    status: body?.status === "inactive" ? "inactive" : "active",
    updatedAt: new Date().toISOString(),
  };

  return json(await trackingRepository.upsertRecord(principal, "branches", record, "update"));
}

export async function DELETE(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "branches.delete")) return forbidden("Missing branches.delete permission");

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"));
  const companyId = cleanText(url.searchParams.get("companyId"));
  if (!id || !companyId) return badRequest("Branch id and company id are required");
  if (!canUseScope(principal, companyId, id)) return forbidden("Branch is outside this user's scope");

  const deleted = await trackingRepository.softDeleteRecord(principal, "branches", id, companyId, id);
  if (!deleted) return badRequest("Branch was not found");
  return json({ ok: true, deleted });
}
