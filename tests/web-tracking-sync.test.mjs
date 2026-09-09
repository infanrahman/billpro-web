import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

// Run the actual sync service with an isolated desktop database and HTTP transport.
const source = readFileSync(new URL("../src/services/webTrackingSyncService.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replaceAll("import.meta.env", "({})"), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;

function harness(rejected = 0) {
  const values = new Map([["webTrackingLastSyncAt", "2020-01-01T00:00:00.000Z"]]);
  const requests = [];
  const tables = {
    companies: [{id: "company", name: "Business"}],
    branches: [{id: "branch", companyId: "company", name: "Main"}],
    items: [{id: "legacy", companyId: "company", name: "Legacy product"}, {id: "foreign", companyId: "other"}],
    users: [{id: "user", companyId: "company", password: "must-not-leave-device"}],
  };
  const db = new Proxy({}, {get: (_, name) => name === "transaction" ? async (...args) => args.at(-1)() : {toArray: async () => tables[name] || []}});
  const context = {
    exports: {}, console, Date, setTimeout, clearTimeout,
    require: (name) => {
      assert.equal(name, "./db");
      return {db, getCurrentCompanyId: () => "company", getCurrentBranchId: () => "branch"};
    },
    localStorage: {getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key)},
    fetch: async (url, options) => {
      requests.push({url, options});
      return {ok: true, json: async () => options.method === "POST" ? {accepted: 4, rejected, serverTime: new Date().toISOString(), batchId: "test"} : {companies: [], branches: []}};
    },
  };
  vm.runInNewContext(compiled, context);
  return {api: context.exports, values, requests};
}

test("full desktop sync includes untimestamped records and normalizes /api endpoints", async () => {
  const {api, requests, values} = harness();
  await api.pushWebTrackingChanges({endpoint: "https://example.test/api/", token: "bt_test"}, true);
  assert.equal(requests[0].url, "https://example.test/api/sync/push");
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.changes.inventory.length, 1);
  assert.equal(body.changes.inventory[0].id, "legacy");
  assert.ok(Date.parse(body.changes.inventory[0].updatedAt));
  assert.equal(body.changes.users[0].password, undefined);
  assert.notEqual(values.get("webTrackingLastSyncAt"), "2020-01-01T00:00:00.000Z");
});

test("rejected records retain the cursor and a visible error", async () => {
  const {api, values} = harness(1);
  await assert.rejects(api.pushWebTrackingChanges({endpoint: "https://example.test", token: "bt_test"}, true), /1 rejected/);
  assert.equal(values.get("webTrackingLastSyncAt"), "2020-01-01T00:00:00.000Z");
  assert.match(values.get("webTrackingLastSyncError"), /1 rejected/);
});

test("missing or demo credentials are not sent as sync tokens", async () => {
  const {api, requests} = harness();
  await assert.rejects(api.pushWebTrackingChanges({token: "demo-owner-token"}), /sync token/);
  assert.equal(requests.length, 0);
});
