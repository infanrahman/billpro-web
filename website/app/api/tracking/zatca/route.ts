import { authenticate } from "../../../../lib/tracking/auth";
import { can, canUseScope } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type { CompanyRecord, SaleRecord } from "../../../../lib/tracking/types";
import { badRequest, forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const value = (record: Record<string, unknown>, ...keys: string[]) => keys.map((key) => record[key]).find((item) => item !== undefined && item !== null && item !== "");

const checksFor = (record: SaleRecord & Record<string, unknown>) => [
  { key: "supplier", label: "Supplier VAT and company scope", passed: Boolean(record.companyId) },
  { key: "xml", label: "UBL invoice XML", passed: Boolean(value(record, "zatcaXml", "xml", "signedXml")) },
  { key: "security", label: "Invoice hash and UUID", passed: Boolean(value(record, "zatcaHash", "invoiceHash") && value(record, "zatcaUuid", "uuid")) },
  { key: "qr", label: "Security QR payload", passed: Boolean(value(record, "zatcaQrCode", "qrCode", "qr")) },
  { key: "response", label: "Reporting or clearance response", passed: record.zatcaStatus === "REPORTED" || record.zatcaStatus === "CLEARED" },
];

export async function GET(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!can(principal, "sales.view")) return forbidden("Missing sales.view permission");

  const url = new URL(request.url);
  const companies = await trackingRepository.getRecords<CompanyRecord>("companies");
  const companyId = url.searchParams.get("companyId") || principal.companyIds[0] || companies[0]?.id || "";
  const branchId = url.searchParams.get("branchId") || undefined;
  const id = url.searchParams.get("id") || "";
  if (companyId && !canUseScope(principal, companyId, branchId)) return forbidden("Invoice scope is outside this user's access");

  const invoices = companyId ? await trackingRepository.getScopedRecords<SaleRecord>("sales", companyId, branchId) : [];
  if (!id) {
    return json({ phase: "2", environment: process.env.ZATCA_ENVIRONMENT || "SIMULATION", configured: Boolean(process.env.ZATCA_CSID && process.env.ZATCA_SECRET), invoices: invoices.map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: (invoice as SaleRecord & Record<string, unknown>).zatcaStatus || "PENDING", ready: checksFor(invoice as SaleRecord & Record<string, unknown>).every((check) => check.passed) })) });
  }

  const invoice = invoices.find((item) => item.id === id);
  if (!invoice) return badRequest("Invoice was not found in the selected scope");
  const checks = checksFor(invoice as SaleRecord & Record<string, unknown>);
  const ready = checks.every((check) => check.passed);
  return json({ phase: "2", ready, invoiceId: invoice.id, status: (invoice as SaleRecord & Record<string, unknown>).zatcaStatus || "PENDING", checks, message: ready ? "Invoice has all tracked Phase 2 fields." : "Invoice is missing one or more tracked Phase 2 fields." });
}
