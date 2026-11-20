import assert from "node:assert/strict";
import test from "node:test";
import { importLayers, LAYER_RULES } from "../src/pomelo/import-layers.js";

const client = "src/client/pomelo/rail.tsx";
const server = "src/pomelo/threads.ts";

test("reports each crossing with only the path, added line number, and rule", () => {
  assert.deepEqual(LAYER_RULES, ["client-node", "client-server", "server-client", "src-test", "deep-escape"]);
  assert.deepEqual(importLayers([
    {
      path: client,
      added: [
        { line: 3, text: 'import fs from "node:fs";' },
        { line: 8, text: 'import { list } from "../../pomelo/threads.js";' },
        { line: 12, text: 'import { hideSecrets } from "../../secrets.js";' },
      ],
    },
    {
      path: server,
      added: [
        { line: 7, text: 'import { Rail } from "../client/pomelo/rail.js";' },
        { line: 9, text: 'import { fixture } from "../../test/helper.js";' },
        { line: 15, text: 'import "../../../outside.js";' },
      ],
    },
  ]), [
    { path: client, line: 3, rule: "client-node" },
    { path: client, line: 8, rule: "client-server" },
    { path: client, line: 12, rule: "client-server" },
    { path: server, line: 7, rule: "server-client" },
    { path: server, line: 9, rule: "src-test" },
    { path: server, line: 15, rule: "deep-escape" },
  ]);
});

test("checks dynamic imports, require calls, side-effect imports, and re-exports", () => {
  assert.deepEqual(importLayers([
    {
      path: client,
      added: [
        { line: 2, text: 'const fs = import("node:fs");' },
        { line: 4, text: "const fs = require ( 'fs' );" },
        { line: 6, text: 'import "path";' },
        { line: 7, text: 'import { readFile } from "fs/promises";' },
        { line: 8, text: 'export * from "node:crypto";' },
        { line: 10, text: 'export { list } from "../../pomelo/threads.js";' },
        { line: 12, text: 'export * as threads from "../../pomelo/threads.js";' },
      ],
    },
    {
      path: server,
      added: [{ line: 3, text: 'const fixture = import("../../test/helper.js");' }],
    },
  ]), [
    { path: client, line: 2, rule: "client-node" },
    { path: client, line: 4, rule: "client-node" },
    { path: client, line: 6, rule: "client-node" },
    { path: client, line: 7, rule: "client-node" },
    { path: client, line: 8, rule: "client-node" },
    { path: client, line: 10, rule: "client-server" },
    { path: client, line: 12, rule: "client-server" },
    { path: server, line: 3, rule: "src-test" },
  ]);
});

test("allows client siblings, server helpers, and type-only client references to server modules", () => {
  assert.deepEqual(importLayers([
    {
      path: client,
      added: [
        { line: 3, text: 'import type { Thread } from "../../pomelo/threads.js";' },
        { line: 4, text: 'import type { SessionEvent } from "../../types.js";' },
        { line: 5, text: 'export type { Thread } from "../../pomelo/threads.js";' },
        { line: 7, text: 'import { Row } from "./rail-row.js";' },
        { line: 9, text: 'import { useEffect } from "react";' },
        { line: 10, text: 'import "path-browserify";' },
        { line: 12, text: 'import "../../theme.css";' },
      ],
    },
    {
      path: server,
      added: [
        { line: 2, text: 'import { hideSecrets } from "../secrets.js";' },
        { line: 6, text: 'import fs from "node:fs";' },
      ],
    },
  ]), []);
});

test("keeps the type-only exception limited to the client-server rule", () => {
  assert.deepEqual(importLayers([
    {
      path: client,
      added: [
        { line: 1, text: 'import type { Stats } from "node:fs";' },
        { line: 5, text: 'import type from "../../pomelo/threads.js";' },
        { line: 8, text: 'import type { Fixture } from "../../../test/helper.js";' },
      ],
    },
    {
      path: server,
      added: [{ line: 4, text: 'import type { Props } from "../client/pomelo/rail.js";' }],
    },
  ]), [
    { path: client, line: 1, rule: "client-node" },
    { path: client, line: 5, rule: "client-server" },
    { path: client, line: 8, rule: "src-test" },
    { path: server, line: 4, rule: "server-client" },
  ]);
});

test("normalizes relative paths and recognizes Friday's client alias", () => {
  assert.deepEqual(importLayers([
    {
      path: "src/client/pomelo/nested/rail.tsx",
      added: [
        { line: 1, text: 'import "./../.././../pomelo/threads.js";' },
        { line: 2, text: 'import "../../../../src/client/rail.js";' },
        { line: 3, text: 'import "../../../../src-extra/rail.js";' },
        { line: 4, text: 'import "../../../../../test/helper.js";' },
      ],
    },
    {
      path: server,
      added: [{ line: 1, text: 'import { Rail } from "@/pomelo/rail.js";' }],
    },
  ]), [
    { path: "src/client/pomelo/nested/rail.tsx", line: 1, rule: "client-server" },
    { path: "src/client/pomelo/nested/rail.tsx", line: 3, rule: "deep-escape" },
    { path: "src/client/pomelo/nested/rail.tsx", line: 4, rule: "deep-escape" },
    { path: server, line: 1, rule: "server-client" },
  ]);
});

test("ignores comments, strings, property calls, and paths outside the two Pomelo folders", () => {
  const added = [{ line: 1, text: 'import "../../test/helper.js";' }];
  assert.deepEqual(importLayers([
    { path: "src/client/rail.tsx", added },
    { path: "src/pomelo-extra/rail.tsx", added },
    { path: "test/rail.test.ts", added },
    {
      path: client,
      added: [
        { line: 1, text: '// import "node:fs";' },
        { line: 2, text: '/* const fs = require("fs"); */' },
        { line: 4, text: ' * import("node:fs");' },
        { line: 8, text: `const message = "try import('node:fs') or require('fs')";` },
        { line: 10, text: 'const message = "ready"; // require("path");' },
        { line: 11, text: 'const result = loader.require("fs");' },
        { line: 12, text: "/*" },
        { line: 13, text: 'import "node:fs";' },
        { line: 14, text: "*/" },
      ],
    },
  ]), []);
});

test("reports distinct matching rules once each on a line", () => {
  assert.deepEqual(importLayers([{
    path: client,
    added: [
      { line: 8, text: "/*" },
      { line: 9, text: '*/ import "fs"; import "path"; import "../../pomelo/threads.js";' },
    ],
  }]), [
    { path: client, line: 9, rule: "client-node" },
    { path: client, line: 9, rule: "client-server" },
  ]);
});
