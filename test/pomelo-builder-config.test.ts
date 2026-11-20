import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { build: friday } = require("../package.json");

test("the Pomelo installer has a separate identity from Friday", () => {
  const pomelo = require("../packaging/pomelo/electron-builder.cjs");

  assert.equal(pomelo.productName, "Pomelo");
  assert.equal(pomelo.appId, "com.levidavidspublic.pomelo");
  assert.notEqual(pomelo.appId, friday.appId);
  assert.equal(pomelo.extraMetadata.name, "pomelo");
  assert.equal(pomelo.nsis.shortcutName, "Pomelo");
  assert.equal(pomelo.icon, "packaging/pomelo/icon.png");

  for (const artifactName of [pomelo.nsis.artifactName, pomelo.linux.artifactName, pomelo.mac.artifactName]) {
    assert.match(artifactName, /^Pomelo/);
    assert.doesNotMatch(artifactName, /friday/i);
  }
});

test("the Pomelo config inherits Friday's files and platform targets", () => {
  const pomelo = require("../packaging/pomelo/electron-builder.cjs");

  assert.deepEqual(pomelo.files, friday.files);
  assert.deepEqual(pomelo.win.target, friday.win.target);
  assert.deepEqual(pomelo.linux.target, friday.linux.target);
  assert.deepEqual(pomelo.mac.target, friday.mac.target);
});
