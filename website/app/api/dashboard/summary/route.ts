import { authenticate } from "../../../../lib/tracking/auth";
import { canUseScope, canViewEntity } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type { ExpenseRecord, InventoryRecord, PurchaseRecord, SaleRecord } from "../../../../lib/tracking/types";
import { forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export async function GET(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!canViewEntity(principal, "reports")) return forbidden("Missing reports.view permission");

  const url = new URL(request.url);
  const companyId = url.searchParams.get("companyId") || principal.companyIds[0];
  const branchId = url.searchParams.get("branchId") || undefined;

  if (!canUseScope(principal, companyId, branchId)) {
    return forbidden("Scope is outside this user's companies or branches");
  }

  const sales = await trackingRepository.getScopedRecords<SaleRecord>("sales", companyId, branchId);
  const purchases = await trackingRepository.getScopedRecords<PurchaseRecord>("purchases", companyId, branchId);
  const expenses = await trackingRepository.getScopedRecords<ExpenseRecord>("expenses", companyId, branchId);
  const inventory = await trackingRepository.getScopedRecords<InventoryRecord>("inventory", companyId, branchId);

  const totalSales = sales.reduce((sum, sale) => sum + numberValue(sale.grandTotal), 0);
  const totalPaid = sales.reduce((sum, sale) => sum + numberValue(sale.paidAmount), 0);
  const totalOutstanding = sales.reduce((sum, sale) => sum + numberValue(sale.remainingAmount), 0);
  const totalExpenses = expenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);
  const totalPurchases = purchases.reduce((sum, purchase) => sum + numberValue(purchase.totalAmount), 0);
  const lowStock = inventory.filter(item => numberValue(item.stock) <= numberValue(item.minStock)).length;

  return json({
    scope: { companyId, branchId },
    totals: {
      totalSales,
      totalPaid,
      totalOutstanding,
      totalExpenses,
      totalPurchases,
      estimatedCashProfit: totalPaid - totalExpenses,
      lowStock,
    },
    counts: {
      sales: sales.length,
      purchases: purchases.length,
      expenses: expenses.length,
      inventory: inventory.length,
    },
    generatedAt: new Date().toISOString(),
  });
}
