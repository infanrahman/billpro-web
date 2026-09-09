const snakeKey = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

const moneyFields = new Set(["price", "cost", "total", "grand_total", "total_amount", "paid_amount", "remaining_amount", "tax_amount", "discount_amount", "net_amount", "subtotal", "sale_price", "purchase_price", "amount", "balance"]);
const decimalValue = (key: string, value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (moneyFields.has(key)) return value.toFixed(2);
    if (["quantity", "stock", "min_stock", "tax_rate"].includes(key)) return value.toFixed(3);
  }
  return value;
};

const resourcePaths: Record<string, string> = {
  sales: "sales", purchases: "purchases", expenses: "expenses", cashbook: "cash-entries",
  customerPayments: "customer-payments", purchasePayments: "purchase-payments",
};

// Translate the web form contract only when using the Django backend.
export function prepareApiRequest(path: string, init: RequestInit, remote: boolean) {
  if (!remote || typeof init.body !== "string" || !path.startsWith("/api/tracking/")) return { path, init };
  const source = JSON.parse(init.body) as Record<string, unknown>;
  const section = path.slice("/api/tracking/".length).split(/[/?]/)[0];
  const entity = section === "transactions" ? String(source.entity) : section;
  if (section === "transactions") {
    const resource = resourcePaths[entity];
    if (!resource) throw new Error("Unsupported transaction section");
    path = `/api/tracking/${resource}`;
  }
  const aliases: Record<string, string> = {
    companyId: "company", branchId: "branch", customerId: "customer", supplierId: "supplier",
    companyIds: "company_ids", branchIds: "branch_ids", permissions: "permissions_json", subTotal: "subtotal",
  };
  if (entity === "cashbook") aliases.type = "entry_type";
  if (entity === "purchases") aliases.type = "purchase_type";
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (key === "entity") continue;
    if (key === "items" && Array.isArray(value)) {
      body.items = value.map((line: Record<string, unknown>) => {
        const item = Object.fromEntries(Object.entries(line).map(([field, value]) => {
          const key = field === "itemId" ? "item" : snakeKey(field);
          return [key, decimalValue(key, value)];
        }));
        if (item.total === undefined) item.total = decimalValue("total", Number(line.quantity || 0) * Number(line.price ?? line.cost ?? 0));
        return item;
      });
    } else {
      const field = aliases[key] || snakeKey(key);
      body[field] = decimalValue(field, value);
    }
  }
  if (entity === "users" && source.status !== undefined) {
    body.is_active = source.status !== "inactive";
    delete body.status;
  }
  return { path, init: { ...init, body: JSON.stringify(body) } };
}

export function apiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const fields = Object.entries(payload).map(([key, value]) => {
      const message = typeof value === "string" ? value : JSON.stringify(value);
      return key === "error" || key === "detail" ? message : `${key}: ${message}`;
    });
    if (fields.length) return fields.join("; ");
  }
  return `Request failed (${status})`;
}
