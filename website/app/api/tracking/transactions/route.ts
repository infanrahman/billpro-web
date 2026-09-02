import { authenticate } from "../../../../lib/tracking/auth";
import { can, canUseScope } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type { BaseRecord, Permission, TrackingEntity } from "../../../../lib/tracking/types";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const transactionEntities = ["sales", "purchases", "expenses", "cashbook", "customerPayments", "purchasePayments"] as const;
type TransactionEntity = typeof transactionEntities[number];

const permissionEntity: Record<TransactionEntity, TrackingEntity> = {
  sales: "sales",
  purchases: "purchases",
  expenses: "expenses",
  cashbook: "cashbook",
  customerPayments: "customers",
  purchasePayments: "purchases",
};

const cleanText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const cleanNumber = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const getEntity = (value: unknown): TransactionEntity | null => {
  const entity = cleanText(value) as TransactionEntity;
  return transactionEntities.includes(entity) ? entity : null;
};

const editableFields = (entity: TransactionEntity, body: Record<string, unknown>) => {
  if (entity === "sales") {
    return {
      invoiceNumber: cleanText(body.invoiceNumber),
      customerName: cleanText(body.customerName) || "Walk-in Customer",
      grandTotal: cleanNumber(body.grandTotal),
      paidAmount: cleanNumber(body.paidAmount),
      remainingAmount: cleanNumber(body.remainingAmount),
      paymentStatus: cleanText(body.paymentStatus) || "pending",
      status: cleanText(body.status) || "pending",
      createdAt: cleanText(body.createdAt) || new Date().toISOString(),
    };
  }

  if (entity === "purchases") {
    return {
      orderNumber: cleanText(body.orderNumber),
      supplierName: cleanText(body.supplierName) || "Supplier",
      totalAmount: cleanNumber(body.totalAmount),
      paidAmount: cleanNumber(body.paidAmount),
      status: cleanText(body.status) || "pending",
      type: cleanText(body.type) || "bill",
      date: cleanText(body.date) || new Date().toISOString(),
    };
  }

  if (entity === "expenses") {
    return {
      description: cleanText(body.description),
      category: cleanText(body.category) || "General",
      amount: cleanNumber(body.amount),
      date: cleanText(body.date) || new Date().toISOString(),
    };
  }

  if (entity === "cashbook") {
    return {
      type: cleanText(body.type) === "out" ? "out" : "in",
      category: cleanText(body.category) || "General",
      description: cleanText(body.description),
      amount: cleanNumber(body.amount),
      date: cleanText(body.date) || new Date().toISOString(),
    };
  }

  return {
    amount: cleanNumber(body.amount),
    date: cleanText(body.date) || new Date().toISOString(),
    paymentMode: cleanText(body.paymentMode) || "cash",
    reference: cleanText(body.reference) || undefined,
    note: cleanText(body.note) || undefined,
  };
};

const requiredValue = (entity: TransactionEntity, record: Record<string, unknown>) => {
  if (entity === "sales") return Boolean(record.invoiceNumber);
  if (entity === "purchases") return Boolean(record.orderNumber);
  if (entity === "expenses" || entity === "cashbook") return Boolean(record.description);
  return cleanNumber(record.amount) > 0;
};

const handleWrite = async (request: Request, action: "create" | "update") => {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return badRequest("Expected a transaction payload");

  const entity = getEntity((body as Record<string, unknown>).entity);
  if (!entity) return badRequest("Unsupported transaction entity");

  const permission = `${permissionEntity[entity]}.${action}` as Permission;
  if (!can(principal, permission)) return forbidden(`Missing ${permission} permission`);

  const payload = body as Record<string, unknown>;
  const id = action === "create" ? crypto.randomUUID() : cleanText(payload.id);
  if (!id) return badRequest("Record id is required");

  const existing = action === "update"
    ? await trackingRepository.getRecord<BaseRecord & Record<string, unknown>>(entity, id)
    : null;
  if (action === "update" && !existing) return badRequest("Transaction was not found");

  const companyId = cleanText(payload.companyId) || existing?.companyId;
  const branchId = cleanText(payload.branchId) || existing?.branchId;
  if (!companyId) return badRequest("Company id is required");
  if (!canUseScope(principal, companyId, branchId)) return forbidden("Transaction scope is outside this user's access");

  const record = {
    ...(existing || {}),
    ...editableFields(entity, payload),
    id,
    companyId,
    branchId,
    updatedAt: new Date().toISOString(),
  } as BaseRecord & Record<string, unknown>;

  if (!requiredValue(entity, record)) return badRequest("Required transaction fields are missing");

  return json(await trackingRepository.upsertRecord(principal, entity, record, action), {
    status: action === "create" ? 201 : 200,
  });
};

export const POST = (request: Request) => handleWrite(request, "create");

export const PUT = (request: Request) => handleWrite(request, "update");

export async function DELETE(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();

  const url = new URL(request.url);
  const entity = getEntity(url.searchParams.get("entity"));
  const id = cleanText(url.searchParams.get("id"));
  const companyId = cleanText(url.searchParams.get("companyId"));
  const branchId = cleanText(url.searchParams.get("branchId"));
  if (!entity || !id || !companyId) return badRequest("Entity, record id, and company id are required");

  const permission = `${permissionEntity[entity]}.delete` as Permission;
  if (!can(principal, permission)) return forbidden(`Missing ${permission} permission`);
  if (!canUseScope(principal, companyId, branchId || undefined)) return forbidden("Transaction scope is outside this user's access");

  const deleted = await trackingRepository.softDeleteRecord(principal, entity, id, companyId, branchId || undefined);
  if (!deleted) return badRequest("Transaction was not found");
  return json({ ok: true, deleted });
}
