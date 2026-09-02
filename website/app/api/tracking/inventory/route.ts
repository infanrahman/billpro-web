import { authenticate } from "../../../../lib/tracking/auth";
import { can, canUseScope } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type { InventoryRecord } from "../../../../lib/tracking/types";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const cleanNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const buildInventoryRecord = (body: Record<string, unknown>, id: string): InventoryRecord => ({
  id,
  companyId: cleanText(body.companyId),
  branchId: cleanText(body.branchId) || undefined,
  name: cleanText(body.name),
  barcode: cleanText(body.barcode) || undefined,
  stock: cleanNumber(body.stock),
  minStock: cleanNumber(body.minStock),
  salePrice: cleanNumber(body.salePrice),
  purchasePrice: cleanNumber(body.purchasePrice),
  updatedAt: new Date().toISOString(),
});

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "inventory.create")) return forbidden("Missing inventory.create permission");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Expected an inventory payload");
  const record = buildInventoryRecord(body as Record<string, unknown>, crypto.randomUUID());
  if (!record.companyId || !record.name) return badRequest("Company id and item name are required");
  if (!canUseScope(principal, record.companyId, record.branchId)) return forbidden("Item scope is outside this user's access");

  return json(await trackingRepository.upsertRecord(principal, "inventory", record, "create"), { status: 201 });
}

export async function PUT(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "inventory.update")) return forbidden("Missing inventory.update permission");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Expected an inventory payload");
  const id = cleanText((body as Record<string, unknown>).id);
  if (!id) return badRequest("Item id is required");

  const record = buildInventoryRecord(body as Record<string, unknown>, id);
  if (!record.companyId || !record.name) return badRequest("Company id and item name are required");
  if (!canUseScope(principal, record.companyId, record.branchId)) return forbidden("Item scope is outside this user's access");

  return json(await trackingRepository.upsertRecord(principal, "inventory", record, "update"));
}

export async function DELETE(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "inventory.delete")) return forbidden("Missing inventory.delete permission");

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"));
  const companyId = cleanText(url.searchParams.get("companyId"));
  const branchId = cleanText(url.searchParams.get("branchId"));
  if (!id || !companyId) return badRequest("Item id and company id are required");
  if (!canUseScope(principal, companyId, branchId || undefined)) return forbidden("Item scope is outside this user's access");

  const deleted = await trackingRepository.softDeleteRecord(principal, "inventory", id, companyId, branchId || undefined);
  if (!deleted) return badRequest("Item was not found");
  return json({ ok: true, deleted });
}
