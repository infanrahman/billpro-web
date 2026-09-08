import { authenticate } from "../../../../lib/tracking/auth";
import { can, canUseScope } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type { CompanyRecord } from "../../../../lib/tracking/types";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "companies.create")) return forbidden("Missing companies.create permission");

  const body = await request.json().catch(() => null);
  const name = cleanText(body?.name);
  if (!name) return badRequest("Company name is required");

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const record: CompanyRecord = {
    id,
    companyId: id,
    name,
    legalName: cleanText(body?.legalName) || name,
    vatNumber: cleanText(body?.vatNumber) || undefined,
    status: body?.status === "inactive" ? "inactive" : "active",
    updatedAt: now,
  };

  return json(await trackingRepository.upsertRecord(principal, "companies", record, "create"), { status: 201 });
}

export async function PUT(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "companies.update")) return forbidden("Missing companies.update permission");

  const body = await request.json().catch(() => null);
  const id = cleanText(body?.id);
  const name = cleanText(body?.name);
  if (!id || !name) return badRequest("Company id and name are required");
  if (!canUseScope(principal, id)) return forbidden("Company is outside this user's scope");

  const record: CompanyRecord = {
    id,
    companyId: id,
    name,
    legalName: cleanText(body?.legalName) || name,
    vatNumber: cleanText(body?.vatNumber) || undefined,
    status: body?.status === "inactive" ? "inactive" : "active",
    updatedAt: new Date().toISOString(),
  };

  return json(await trackingRepository.upsertRecord(principal, "companies", record, "update"));
}

export async function DELETE(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "companies.delete")) return forbidden("Missing companies.delete permission");

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"));
  if (!id) return badRequest("Company id is required");
  if (!canUseScope(principal, id)) return forbidden("Company is outside this user's scope");

  const deleted = await trackingRepository.softDeleteRecord(principal, "companies", id, id);
  if (!deleted) return badRequest("Company was not found");
  return json({ ok: true, deleted });
}
