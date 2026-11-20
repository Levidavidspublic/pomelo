import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("the Pomelo build explicitly disables its update feed", () => {
  const config = require("../packaging/pomelo/electron-builder.cjs");

  assert.equal(config.publish, null);
});

test("the Pomelo build config has no reference to Friday's upstream owner", () => {
  const config = require("../packaging/pomelo/electron-builder.cjs");

  assert.doesNotMatch(JSON.stringify(config), /splashxmoon/i);
});
