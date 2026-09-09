import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareApiRequest, apiErrorMessage } from "../lib/tracking/apiRequest.ts";

test("web forms target typed Django resources and translate fields", () => {
  for (const [entity, endpoint] of Object.entries({sales: "sales", purchases: "purchases", expenses: "expenses", cashbook: "cash-entries"})) {
    const result = prepareApiRequest("/api/tracking/transactions", { method: "POST", body: JSON.stringify({entity, companyId: "company", branchId: "branch", grandTotal: 23, invoiceNumber: "INV", items: [{itemId: "item", name: "Product", taxAmount: 3}]}) }, true);
    assert.equal(result.path, `/api/tracking/${endpoint}`);
    const body = JSON.parse(result.init.body);
    assert.equal(body.company, "company");
    assert.equal(body.branch, "branch");
    assert.equal(body.grand_total, "23.00");
    assert.deepEqual(body.items, [{item: "item", name: "Product", tax_amount: "3.00", total: "0.00"}]);
    assert.equal(body.entity, undefined);
  }
  const users = prepareApiRequest("/api/tracking/users", {body: JSON.stringify({companyIds: ["a"], branchIds: ["b"], permissions: [], status: "active"})}, true);
  assert.deepEqual(JSON.parse(users.init.body), {company_ids: ["a"], branch_ids: ["b"], permissions_json: [], is_active: true});
});

test("checkout decimals fit the Django currency fields", () => {
  const prepared = prepareApiRequest("/api/tracking/transactions", {body: JSON.stringify({entity: "sales", taxAmount: 20 * 15 / 115, items: [{name: "Product", quantity: 1, price: 20, taxAmount: 20 * 15 / 115, netAmount: 20 * 100 / 115}]})}, true);
  const body = JSON.parse(prepared.init.body);
  assert.equal(body.tax_amount, "2.61");
  assert.equal(body.items[0].net_amount, "17.39");
  assert.equal(body.items[0].total, "20.00");
});

test("local API and login payloads remain unchanged; field errors are visible", () => {
  const init = {method: "POST", body: JSON.stringify({companyId: "a"})};
  assert.deepEqual(prepareApiRequest("/api/tracking/inventory", init, false), {path: "/api/tracking/inventory", init});
  assert.deepEqual(prepareApiRequest("/api/auth/login", init, true), {path: "/api/auth/login", init});
  assert.match(apiErrorMessage({company: ["This field is required."]}, 400), /company.*required/);
});
