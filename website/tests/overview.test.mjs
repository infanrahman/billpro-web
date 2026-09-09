import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeOverview } from "../lib/tracking/overview.ts";

test("Django admin records populate web lists and totals", () => {
  const overview = normalizeOverview({
    principal: {id: "1", name: "Admin", role: "owner", permissions: []},
    companies: [{id: "company", name: "Business"}],
    branches: [{id: "branch", company: "company", name: "Main"}],
    records: {
      inventory: [{id: "item", company: "company", branch: "branch", name: "Product", sale_price: "23.00"}],
      sales: [{id: "sale", invoice_number: "INV-1", grand_total: "23.00", paid_amount: "20.00", remaining_amount: "3.00"}],
      purchases: [{id: "purchase", total_amount: "12.00"}],
      expenses: [{id: "expense", amount: "2.00"}],
      customers: [{id: "customer", name: "Customer"}],
      suppliers: [{id: "supplier", name: "Supplier"}],
    },
  });
  assert.equal(overview.branches[0].companyId, "company");
  assert.equal(overview.masterData.inventory[0].salePrice, "23.00");
  assert.equal(overview.masterData.inventory[0].branchId, "branch");
  assert.equal(overview.transactions.sales[0].invoiceNumber, "INV-1");
  assert.equal(overview.masterData.customers.length, 1);
  assert.equal(overview.masterData.suppliers.length, 1);
  assert.deepEqual(overview.totals, {sales: 23, paid: 20, outstanding: 3, purchases: 12, expenses: 2, lowStock: 0});
});
