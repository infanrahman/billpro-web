export type Row = Record<string, any> & { id: string; companyId?: string; branchId?: string; updatedAt?: string };
export type Overview = {
  principal: { id: string; name: string; role: string; permissions: string[] };
  scope: { companyId?: string; branchId?: string };
  companies: Row[];
  branches: Row[];
  masterData: { inventory: Row[]; customers: Row[]; suppliers: Row[] };
  users: Row[];
  transactions: { sales: Row[]; purchases: Row[]; expenses: Row[]; cashbook: Row[]; customerPayments: Row[]; purchasePayments: Row[] };
  totals: { sales: number; paid: number; outstanding: number; purchases: number; expenses: number; lowStock: number };
  branchHealth: Row[];
  entities: Row[];
  audit: Row[];
};

export const emptyOverview: Overview = {
  principal: { id: "", name: "", role: "", permissions: [] }, scope: {}, companies: [], branches: [],
  masterData: { inventory: [], customers: [], suppliers: [] }, users: [],
  transactions: { sales: [], purchases: [], expenses: [], cashbook: [], customerPayments: [], purchasePayments: [] },
  totals: { sales: 0, paid: 0, outstanding: 0, purchases: 0, expenses: 0, lowStock: 0 },
  branchHealth: [], entities: [], audit: [],
};

const camelize = (value: unknown): any => {
  if (Array.isArray(value)) return value.map(camelize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()), camelize(item)]));
};

const normalizeRecord = (value: unknown, entity: string): Row => {
  const source = camelize(value) as Record<string, any>;
  const record = { ...source, id: String(source.id || crypto.randomUUID()) } as Row;
  if (source.company !== undefined) record.companyId = String(source.company);
  if (source.branch !== undefined && source.branch !== null) record.branchId = String(source.branch);
  if (entity === "companies") record.companyId = record.id;
  if (entity === "users") { record.name = source.name || source.username || ""; record.username = source.username || ""; record.status = source.isActive === false ? "inactive" : "active"; }
  return record;
};

export const normalizeOverview = (payload: any): Overview => {
  const records = payload?.records || {};
  const recordsFor = (entity: string) => (records[entity] || payload?.[entity] || []).map((item: unknown) => normalizeRecord(item, entity));
  const companies = (payload?.companies || recordsFor("companies")).map((item: unknown) => normalizeRecord(item, "companies"));
  const branches = (payload?.branches || recordsFor("branches")).map((item: unknown) => normalizeRecord(item, "branches"));
  const sales = (payload?.transactions?.sales || recordsFor("sales")) as Row[];
  const purchases = (payload?.transactions?.purchases || recordsFor("purchases")) as Row[];
  const expenses = (payload?.transactions?.expenses || recordsFor("expenses")) as Row[];
  const total = (rows: Row[], ...keys: string[]) => rows.reduce((sum, row) => sum + Number(keys.map((key) => row[key]).find((item) => item !== undefined) || 0), 0);
  return {
    ...emptyOverview, ...payload, principal: payload?.principal || emptyOverview.principal,
    scope: payload?.scope || { companyId: companies[0]?.id }, companies, branches,
    users: (payload?.users || recordsFor("users")) as Row[],
    masterData: { inventory: (payload?.masterData?.inventory || recordsFor("inventory")) as Row[], customers: (payload?.masterData?.customers || recordsFor("customers")) as Row[], suppliers: (payload?.masterData?.suppliers || recordsFor("suppliers")) as Row[] },
    transactions: { sales, purchases, expenses, cashbook: (payload?.transactions?.cashbook || recordsFor("cashbook")) as Row[], customerPayments: (payload?.transactions?.customerPayments || recordsFor("customerPayments")) as Row[], purchasePayments: (payload?.transactions?.purchasePayments || recordsFor("purchasePayments")) as Row[] },
    totals: payload?.totals || { sales: total(sales, "grandTotal"), paid: total(sales, "paidAmount"), outstanding: total(sales, "remainingAmount"), purchases: total(purchases, "totalAmount"), expenses: total(expenses, "amount"), lowStock: 0 },
    branchHealth: payload?.branchHealth || [], entities: payload?.entities || [], audit: payload?.audit || payload?.recentAudit || [],
  };
};
