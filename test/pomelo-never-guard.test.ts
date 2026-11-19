import assert from "node:assert/strict";
import test from "node:test";
import { neverGuard } from "../src/pomelo/never-guard.js";

const serverPath = "src/pomelo/providers.ts";
const clientPath = "src/client/pomelo/settings.ts";
const router = "open" + "router";
const integration = "compo" + "sio";
const automation = "n" + "8n";
const apiHost = "api." + "openai.com";
const accountHost = "claude" + ".ai";

test("reports each rule with the added line number and no source text", () => {
  assert.deepEqual(neverGuard([{
    path: serverPath,
    added: [
      { line: 3, text: `const baseUrl = "https://${router}.ai/api/v1";` },
      { line: 7, text: `import "@${integration}/core";` },
      { line: 11, text: `import "${automation}-nodes-base";` },
      { line: 14, text: `const api = "https://${apiHost}/v1";` },
      { line: 21, text: `const login = "https://${accountHost}/login";` },
    ],
  }]), [
    { path: serverPath, line: 3, rule: router },
    { path: serverPath, line: 7, rule: integration },
    { path: serverPath, line: 11, rule: automation },
    { path: serverPath, line: 14, rule: "openai-api" },
    { path: serverPath, line: 21, rule: "claude-login" },
  ]);
});

test("matches mixed-case package names, hosts, and Claude account routes in client code", () => {
  assert.deepEqual(neverGuard([{
    path: clientPath,
    added: [
      { line: 1, text: 'import "@Open' + 'Router/sdk";' },
      { line: 2, text: 'import "Compo' + 'Sio";' },
      { line: 3, text: 'const flow = "https://N' + '8N.example.test";' },
      { line: 4, text: 'const api = "https://API.' + 'OpenAI.COM:443/v1";' },
      { line: 5, text: 'const oauth = "https://Claude' + '.AI/OAuth/authorize";' },
      { line: 6, text: 'const auth = "https://CLAUDE' + '.ai/API/Auth?mode=login";' },
    ],
  }]), [
    { path: clientPath, line: 1, rule: router },
    { path: clientPath, line: 2, rule: integration },
    { path: clientPath, line: 3, rule: automation },
    { path: clientPath, line: 4, rule: "openai-api" },
    { path: clientPath, line: 5, rule: "claude-login" },
    { path: clientPath, line: 6, rule: "claude-login" },
  ]);
});

test("skips Friday files and exact allow-listed Pomelo paths", () => {
  const judgePath = "src/pomelo/judge.ts";
  const added = [{ line: 5, text: `import "${router}";` }];
  assert.deepEqual(neverGuard([
    { path: "src/secrets.ts", added },
    { path: "src/pomelo-extra/providers.ts", added },
    { path: judgePath, added },
    { path: `${judgePath}x`, added },
  ], [judgePath]), [
    { path: `${judgePath}x`, line: 5, rule: router },
  ]);
});

test("matches provider names inside environment variables and identifiers", () => {
  assert.deepEqual(neverGuard([{
    path: serverPath,
    added: [
      { line: 1, text: `process.env.${router.toUpperCase()}_API_KEY` },
      { line: 2, text: "createOpen" + "Router()" },
      { line: 3, text: `const ${integration}_client = client;` },
      { line: 4, text: "new Compo" + "sioToolSet()" },
    ],
  }]), [
    { path: serverPath, line: 1, rule: router },
    { path: serverPath, line: 2, rule: router },
    { path: serverPath, line: 3, rule: integration },
    { path: serverPath, line: 4, rule: integration },
  ]);
});

test("matches prohibited hosts and account routes on subdomains", () => {
  assert.deepEqual(neverGuard([{
    path: clientPath,
    added: [
      { line: 1, text: `const login = "https://www.${accountHost}/login";` },
      { line: 2, text: `const oauth = "https://accounts.${accountHost}/oauth/authorize";` },
      { line: 3, text: `const auth = "https://accounts.${accountHost}/api/auth";` },
      { line: 4, text: `const api = "https://gateway.${apiHost}/v1";` },
    ],
  }]), [
    { path: clientPath, line: 1, rule: "claude-login" },
    { path: clientPath, line: 2, rule: "claude-login" },
    { path: clientPath, line: 3, rule: "claude-login" },
    { path: clientPath, line: 4, rule: "openai-api" },
  ]);
});

test("ignores clean lines, longer words, and lookalike hosts or routes", () => {
  assert.deepEqual(neverGuard([{
    path: serverPath,
    added: [
      { line: 1, text: "const ready = true;" },
      { line: 2, text: `const f${automation}ame = true;` },
      { line: 3, text: `const url = "https://${apiHost}.example.test";` },
      { line: 4, text: `const url = "https://${accountHost}/logins";` },
      { line: 5, text: `const url = "https://${accountHost}/chat";` },
      { line: 6, text: `const url = "https://fake-${apiHost}/v1";` },
      { line: 7, text: `const url = "https://www.fake-${accountHost}/login";` },
    ],
  }]), []);
});

test("reports two different rules once each on the same line", () => {
  assert.deepEqual(neverGuard([{
    path: serverPath,
    added: [{ line: 8, text: `import "${router}"; import "${integration}"; import "@${router}/sdk";` }],
  }]), [
    { path: serverPath, line: 8, rule: router },
    { path: serverPath, line: 8, rule: integration },
  ]);
});
