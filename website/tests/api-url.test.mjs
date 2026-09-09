import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { buildApiUrl } from "../lib/tracking/apiUrl.ts";

test("remote paths are canonical and preserve query parameters", () => {
  const base = "https://example.test/api/";
  assert.equal(buildApiUrl("/api/auth/login", base), `${base}auth/login/`);
  assert.equal(buildApiUrl("/api/auth/logout/", base), `${base}auth/logout/`);
  assert.equal(buildApiUrl("/api/tracking/transactions", base), `${base}transactions/`);
  assert.equal(buildApiUrl("/api/tracking/overview?companyId=a&branchId=b", base), `${base}overview/?companyId=a&branchId=b`);
  assert.equal(buildApiUrl("/api/tracking/zatca?id=a%2Fb", base), `${base}zatca/?id=a%2Fb`);
  assert.equal(buildApiUrl("/api/auth/login", ""), "/api/auth/login");
});

test("login reaches a slash-based server as POST with its body intact", async () => {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ method: request.method, url: request.url, body });
    if (request.url === "/api/auth/login") {
      response.writeHead(301, { Location: "/api/auth/login/" });
    } else {
      response.writeHead(request.method === "POST" ? 200 : 405);
    }
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api`;
    const body = JSON.stringify({ username: "test-account", password: "test-only" });
    const response = await fetch(buildApiUrl("/api/auth/login", base), {
      method: "POST", headers: { "Content-Type": "application/json" }, body,
    });
    assert.equal(response.status, 200);
    assert.equal(response.redirected, false);
    assert.deepEqual(requests, [{ method: "POST", url: "/api/auth/login/", body }]);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
