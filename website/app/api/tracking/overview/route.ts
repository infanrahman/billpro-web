import { authenticate } from "../../../../lib/tracking/auth";
import { canUseScope, canViewEntity } from "../../../../lib/tracking/permissions";
import { allPermissions, rolePermissions } from "../../../../lib/tracking/permissions";
import { trackingRepository } from "../../../../lib/tracking/repository";
import type {
  BaseRecord,
  BranchRecord,
  CompanyRecord,
  ExpenseRecord,
  InventoryRecord,
  PurchaseRecord,
  SaleRecord,
  TrackingEntity,
  UserRecord,
} from "../../../../lib/tracking/types";
import { forbidden, json, unauthorized } from "../../../../lib/tracking/responses";

const dashboardEntities: TrackingEntity[] = [
  "sales",
  "inventory",
  "categories",
  "customers",
  "suppliers",
  "purchases",
  "expenses",
  "cashbook",
  "cashParties",
  "customerPayments",
  "purchasePayments",
  "notifications",
  "scales",
  "scaleLogs",
  "spreadsheets",
  "shifts",
];

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const recordTitle = (entity: TrackingEntity, record: BaseRecord & Record<string, unknown>) => {
  if (typeof record.name === "string") return record.name;
  if (typeof record.invoiceNumber === "string") return record.invoiceNumber;
  if (typeof record.orderNumber === "string") return record.orderNumber;
  if (typeof record.description === "string") return record.description;
  return `${entity} ${record.id.slice(0, 8)}`;
};

const recordAmount = (record: Record<string, unknown>) =>
  numberValue(record.grandTotal) || numberValue(record.totalAmount) || numberValue(record.amount) || numberValue(record.balance);

export async function GET(request: Request) {
  const principal = await authenticate(request);
  if (!principal) return unauthorized();
  if (!canViewEntity(principal, "reports")) return forbidden("Missing reports.view permission");

  const url = new URL(request.url);
  const allCompanies = await trackingRepository.getRecords<CompanyRecord>("companies");
  const requestedCompanyId = url.searchParams.get("companyId") || principal.companyIds[0] || allCompanies[0]?.id || "";
  const requestedBranchId = url.searchParams.get("branchId") || undefined;

  if (!canUseScope(principal, requestedCompanyId, requestedBranchId)) {
    return forbidden("Scope is outside this user's companies or branches");
  }

  const companies = principal.role === "owner"
    ? allCompanies
    : allCompanies.filter((company) => principal.companyIds.includes(company.id));
  const branches = await trackingRepository.getScopedRecords<BranchRecord>("branches", requestedCompanyId);
  const sales = await trackingRepository.getScopedRecords<SaleRecord>("sales", requestedCompanyId, requestedBranchId);
  const purchases = await trackingRepository.getScopedRecords<PurchaseRecord>("purchases", requestedCompanyId, requestedBranchId);
  const expenses = await trackingRepository.getScopedRecords<ExpenseRecord>("expenses", requestedCompanyId, requestedBranchId);
  const inventory = await trackingRepository.getScopedRecords<InventoryRecord>("inventory", requestedCompanyId, requestedBranchId);
  const customers = canViewEntity(principal, "customers")
    ? await trackingRepository.getScopedRecords("customers", requestedCompanyId, requestedBranchId)
    : [];
  const suppliers = canViewEntity(principal, "suppliers")
    ? await trackingRepository.getScopedRecords("suppliers", requestedCompanyId, requestedBranchId)
    : [];
  const audit = await trackingRepository.getAudit(requestedCompanyId, requestedBranchId, 20);
  const users = canViewEntity(principal, "users")
    ? await trackingRepository.getScopedRecords<UserRecord>("users", requestedCompanyId, requestedBranchId)
    : [];
  const publicUsers = users.map((user) => {
    const { passwordHash: _passwordHash, passwordSalt: _passwordSalt, ...safeUser } = user;
    return safeUser;
  });

  const entityCards = await Promise.all(
    dashboardEntities.map(async (entity) => {
      const records = canViewEntity(principal, entity)
        ? await trackingRepository.getScopedRecords<BaseRecord & Record<string, unknown>>(entity, requestedCompanyId, requestedBranchId)
        : [];
      const latest = [...records]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 4)
        .map((record) => ({
          id: record.id,
          title: recordTitle(entity, record),
          amount: recordAmount(record),
          branchId: record.branchId,
          updatedAt: record.updatedAt,
        }));

      return { entity, count: records.length, latest };
    }),
  );

  const branchHealth = branches
    .filter((branch) => !requestedBranchId || branch.id === requestedBranchId)
    .map((branch) => {
      const branchSales = sales.filter((sale) => !sale.branchId || sale.branchId === branch.id);
      const branchPurchases = purchases.filter((purchase) => !purchase.branchId || purchase.branchId === branch.id);
      const branchExpenses = expenses.filter((expense) => !expense.branchId || expense.branchId === branch.id);
      const branchInventory = inventory.filter((item) => !item.branchId || item.branchId === branch.id);

      const revenue = branchSales.reduce((sum, sale) => sum + numberValue(sale.grandTotal), 0);
      const paid = branchSales.reduce((sum, sale) => sum + numberValue(sale.paidAmount), 0);
      const outstanding = branchSales.reduce((sum, sale) => sum + numberValue(sale.remainingAmount), 0);
      const expenseTotal = branchExpenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0);

      return {
        branchId: branch.id,
        branchName: branch.name,
        revenue,
        paid,
        outstanding,
        purchases: branchPurchases.reduce((sum, purchase) => sum + numberValue(purchase.totalAmount), 0),
        expenses: expenseTotal,
        estimatedCashProfit: paid - expenseTotal,
        lowStock: branchInventory.filter((item) => numberValue(item.stock) <= numberValue(item.minStock)).length,
        transactionCount: branchSales.length + branchPurchases.length + branchExpenses.length,
      };
    });

  return json({
    principal: {
      id: principal.id,
      name: principal.name,
      role: principal.role,
      permissions: principal.permissions,
    },
    scope: { companyId: requestedCompanyId, branchId: requestedBranchId },
    companies,
    branches,
    users: publicUsers,
    masterData: {
      inventory,
      customers,
      suppliers,
    },
    transactions: {
      sales,
      purchases,
      expenses,
      cashbook: canViewEntity(principal, "cashbook")
        ? await trackingRepository.getScopedRecords("cashbook", requestedCompanyId, requestedBranchId)
        : [],
      customerPayments: canViewEntity(principal, "customers")
        ? await trackingRepository.getScopedRecords("customerPayments", requestedCompanyId, requestedBranchId)
        : [],
      purchasePayments: canViewEntity(principal, "purchases")
        ? await trackingRepository.getScopedRecords("purchasePayments", requestedCompanyId, requestedBranchId)
        : [],
    },
    permissionCatalog: {
      roles: rolePermissions,
      permissions: allPermissions,
    },
    totals: {
      sales: sales.reduce((sum, sale) => sum + numberValue(sale.grandTotal), 0),
      paid: sales.reduce((sum, sale) => sum + numberValue(sale.paidAmount), 0),
      outstanding: sales.reduce((sum, sale) => sum + numberValue(sale.remainingAmount), 0),
      purchases: purchases.reduce((sum, purchase) => sum + numberValue(purchase.totalAmount), 0),
      expenses: expenses.reduce((sum, expense) => sum + numberValue(expense.amount), 0),
      lowStock: inventory.filter((item) => numberValue(item.stock) <= numberValue(item.minStock)).length,
    },
    branchHealth,
    entities: entityCards,
    audit,
    generatedAt: new Date().toISOString(),
  });
}
