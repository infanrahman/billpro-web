import { authenticate } from "../../../../lib/tracking/auth";
import { can, canUseScope } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type { SupplierRecord } from "../../../../lib/tracking/types";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const cleanNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const buildSupplierRecord = (body: Record<string, unknown>, id: string): SupplierRecord => ({
  id,
  companyId: cleanText(body.companyId),
  branchId: cleanText(body.branchId) || undefined,
  name: cleanText(body.name),
  phone: cleanText(body.phone) || undefined,
  balance: cleanNumber(body.balance),
  updatedAt: new Date().toISOString(),
});

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "suppliers.create")) return forbidden("Missing suppliers.create permission");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Expected a supplier payload");
  const record = buildSupplierRecord(body as Record<string, unknown>, crypto.randomUUID());
  if (!record.companyId || !record.name) return badRequest("Company id and supplier name are required");
  if (!canUseScope(principal, record.companyId, record.branchId)) return forbidden("Supplier scope is outside this user's access");

  return json(await trackingRepository.upsertRecord(principal, "suppliers", record, "create"), { status: 201 });
}

export async function PUT(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "suppliers.update")) return forbidden("Missing suppliers.update permission");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Expected a supplier payload");
  const id = cleanText((body as Record<string, unknown>).id);
  if (!id) return badRequest("Supplier id is required");

  const record = buildSupplierRecord(body as Record<string, unknown>, id);
  if (!record.companyId || !record.name) return badRequest("Company id and supplier name are required");
  if (!canUseScope(principal, record.companyId, record.branchId)) return forbidden("Supplier scope is outside this user's access");

  return json(await trackingRepository.upsertRecord(principal, "suppliers", record, "update"));
}

export async function DELETE(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "suppliers.delete")) return forbidden("Missing suppliers.delete permission");

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"));
  const companyId = cleanText(url.searchParams.get("companyId"));
  const branchId = cleanText(url.searchParams.get("branchId"));
  if (!id || !companyId) return badRequest("Supplier id and company id are required");
  if (!canUseScope(principal, companyId, branchId || undefined)) return forbidden("Supplier scope is outside this user's access");

  const deleted = await trackingRepository.softDeleteRecord(principal, "suppliers", id, companyId, branchId || undefined);
  if (!deleted) return badRequest("Supplier was not found");
  return json({ ok: true, deleted });
}
