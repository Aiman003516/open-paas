import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { forwardEngineRequest } from "../src/app/api/engine/[...path]/proxy-core.mjs";

const token = "integration-test-token-0123456789abcdef0123456789abcdef";
let server;
let engineUrl;
let expectedToken = token;
let requests = [];
let lastDeploymentBody = "";
const originalEnvironment = {
  OPEN_PAAS_ENGINE_URL: process.env.OPEN_PAAS_ENGINE_URL,
  OPEN_PAAS_API_TOKEN: process.env.OPEN_PAAS_API_TOKEN,
  DASHBOARD_ALLOWED_ORIGINS: process.env.DASHBOARD_ALLOWED_ORIGINS,
};

before(async () => {
  server = createServer(async (request, response) => {
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization, origin: request.headers.origin });
    if (request.method === "OPTIONS") {
      const origin = request.headers.origin;
      if (origin === "http://localhost:3000") response.setHeader("Access-Control-Allow-Origin", origin);
      response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
      response.writeHead(204).end();
      return;
    }
    if (request.headers.authorization !== `Bearer ${expectedToken}`) {
      response.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "valid bearer token required" }));
      return;
    }
    if (request.url === "/health") {
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "ok" }));
      return;
    }
    if (request.url === "/deploy" && request.method === "POST") {
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      lastDeploymentBody = Buffer.concat(chunks).toString("utf8");
      response.writeHead(202, { "Content-Type": "application/json" }).end(JSON.stringify({ status: "accepted" }));
      return;
    }
    response.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  engineUrl = `http://127.0.0.1:${server.address().port}`;
  process.env.OPEN_PAAS_ENGINE_URL = engineUrl;
  process.env.OPEN_PAAS_API_TOKEN = token;
  process.env.DASHBOARD_ALLOWED_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000";
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function requestFor(endpoint, { method = "GET", origin = "http://localhost:3000", body } = {}) {
  const headers = new Headers();
  if (origin) headers.set("Origin", origin);
  if (body !== undefined) headers.set("Content-Type", "application/json");
  const request = new Request(`http://localhost:3000/api/engine/${endpoint}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { request, context: endpoint.split("/") };
}

test("same-origin dashboard proxy attaches its server-side bearer token", async () => {
  requests = [];
  const { request, context } = requestFor("health");
  const response = await forwardEngineRequest(request, context[0]);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
  assert.equal(requests.at(-1).authorization, `Bearer ${token}`);
  assert.equal(requests.at(-1).origin, undefined, "browser Origin is not forwarded to the engine");
});

test("deployment requests preserve the payload and receive the engine's accepted response", async () => {
  const payload = { repo_url: "https://github.com/example/project", subdomain: "local-demo" };
  const { request, context } = requestFor("deploy", { method: "POST", body: payload });
  const response = await forwardEngineRequest(request, context[0]);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { status: "accepted" });
  assert.equal(requests.at(-1).authorization, `Bearer ${token}`);
  assert.deepEqual(JSON.parse(lastDeploymentBody), payload);
});

test("unexpected origins are rejected before reaching the engine", async () => {
  const callCount = requests.length;
  const { request, context } = requestFor("deploy", { method: "POST", origin: "https://attacker.example", body: { repo_url: "https://github.com/example/project" } });
  const response = await forwardEngineRequest(request, context[0]);
  assert.equal(response.status, 403);
  assert.equal(requests.length, callCount);
});

test("unknown engine endpoints are not forwarded", async () => {
  const callCount = requests.length;
  const { request, context } = requestFor("restart");
  const response = await forwardEngineRequest(request, context[0]);
  assert.equal(response.status, 404);
  assert.equal(requests.length, callCount);
});

test("missing dashboard credentials fail closed", async () => {
  const configuredToken = process.env.OPEN_PAAS_API_TOKEN;
  delete process.env.OPEN_PAAS_API_TOKEN;
  const { request, context } = requestFor("health");
  const response = await forwardEngineRequest(request, context[0]);
  process.env.OPEN_PAAS_API_TOKEN = configuredToken;
  assert.equal(response.status, 503);
});

test("engine authentication errors are passed back through the proxy", async () => {
  expectedToken = "a-different-engine-secret-that-the-proxy-does-not-have";
  const { request, context } = requestFor("health");
  const response = await forwardEngineRequest(request, context[0]);
  expectedToken = token;
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "valid bearer token required" });
});
