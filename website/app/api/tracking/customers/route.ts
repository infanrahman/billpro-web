import { authenticate } from "../../../../lib/tracking/auth";
import { can, canUseScope } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type { CustomerRecord } from "../../../../lib/tracking/types";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const cleanNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const buildCustomerRecord = (body: Record<string, unknown>, id: string): CustomerRecord => ({
  id,
  companyId: cleanText(body.companyId),
  branchId: cleanText(body.branchId) || undefined,
  name: cleanText(body.name),
  phone: cleanText(body.phone) || undefined,
  balance: cleanNumber(body.balance),
  totalSpent: cleanNumber(body.totalSpent),
  updatedAt: new Date().toISOString(),
});

export async function POST(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "customers.create")) return forbidden("Missing customers.create permission");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Expected a customer payload");
  const record = buildCustomerRecord(body as Record<string, unknown>, crypto.randomUUID());
  if (!record.companyId || !record.name) return badRequest("Company id and customer name are required");
  if (!canUseScope(principal, record.companyId, record.branchId)) return forbidden("Customer scope is outside this user's access");

  return json(await trackingRepository.upsertRecord(principal, "customers", record, "create"), { status: 201 });
}

export async function PUT(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "customers.update")) return forbidden("Missing customers.update permission");

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Expected a customer payload");
  const id = cleanText((body as Record<string, unknown>).id);
  if (!id) return badRequest("Customer id is required");

  const record = buildCustomerRecord(body as Record<string, unknown>, id);
  if (!record.companyId || !record.name) return badRequest("Company id and customer name are required");
  if (!canUseScope(principal, record.companyId, record.branchId)) return forbidden("Customer scope is outside this user's access");

  return json(await trackingRepository.upsertRecord(principal, "customers", record, "update"));
}

export async function DELETE(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "customers.delete")) return forbidden("Missing customers.delete permission");

  const url = new URL(request.url);
  const id = cleanText(url.searchParams.get("id"));
  const companyId = cleanText(url.searchParams.get("companyId"));
  const branchId = cleanText(url.searchParams.get("branchId"));
  if (!id || !companyId) return badRequest("Customer id and company id are required");
  if (!canUseScope(principal, companyId, branchId || undefined)) return forbidden("Customer scope is outside this user's access");

  const deleted = await trackingRepository.softDeleteRecord(principal, "customers", id, companyId, branchId || undefined);
  if (!deleted) return badRequest("Customer was not found");
  return json({ ok: true, deleted });
}
