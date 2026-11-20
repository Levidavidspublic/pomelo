import assert from "node:assert/strict";
import test from "node:test";
import { secretFiles } from "../src/pomelo/secret-files.js";

for (const [path, kind] of [
  [".env", "env"],
  [".env.local", "env"],
  ["config/prod.pem", "key-file"],
  ["config/prod.key", "key-file"],
  ["config/prod.p12", "key-file"],
  ["config/prod.pfx", "key-file"],
  ["config/prod.jks", "key-file"],
  ["vault.kdbx", "password-database"],
  ["keys/id_rsa", "ssh-key"],
  ["keys/id_ed25519", "ssh-key"],
  ["keys/id_ecdsa", "ssh-key"],
  [".npmrc", "credential-file"],
  [".netrc", "credential-file"],
  [".git-credentials", "credential-file"],
  ["credentials.json", "credential-file"],
  ["profiles/work/Default/Cookies", "browser-profile"],
  ["profiles/work/Default/Login Data", "browser-profile"],
  ["profiles/work/Default/Web Data", "browser-profile"],
  ["profiles/work/Default/Cookies-journal", "browser-profile"],
  ["profiles/work/Default/Login Data-journal", "browser-profile"],
  ["profiles/work/Default/Web Data-journal", "browser-profile"],
  ["export.1pux", "1password-export"],
]) {
  test(`reports an added ${path}`, () => {
    const { ok, findings } = secretFiles(`A\t${path}\n`);

    assert.equal(ok, false);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].path, path);
    assert.equal(findings[0].kind, kind);
    assert.ok(findings[0].reason.trim());
  });
}

test("allows env examples and checks only the last path segment", () => {
  const diff = [
    "A\t.env.example",
    "A\tconfig/.ENV.SAMPLE",
    "A\t.env.template",
    "A\t.env/README.md",
    "A\tconfig/prod.pem.txt",
    "A\tkeys/id_rsa.pub",
    "A\tprofiles/Cookies.md",
  ].join("\n");

  assert.deepEqual(secretFiles(diff), { ok: true, findings: [] });
  assert.equal(secretFiles("A\t.env.example.local").findings[0].path, ".env.example.local");
});

test("reports only rename and copy destinations", () => {
  const diff = [
    "R095\tconfig/settings.txt\tconfig/.env",
    "C100\tconfig/settings.txt\tconfig/.npmrc",
    "R100\told/.env\told/settings.txt",
    "C100\told/.npmrc\told/npm-settings.txt",
  ].join("\n");

  const { ok, findings } = secretFiles(diff);
  assert.equal(ok, false);
  assert.deepEqual(findings.map(({ path }) => path), ["config/.env", "config/.npmrc"]);
});

test("allows deletions and modifications of secret-file names", () => {
  assert.deepEqual(secretFiles("D\t.env\nM\t.npmrc\n"), { ok: true, findings: [] });
});

test("reads Windows line endings and preserves path spacing and case", () => {
  const path = "profiles/Work Profile/Default/lOgIn DaTa-JoUrNaL";
  const diff = `M\tREADME.md\r\nA\t${path}\r\nA\tKeys/Prod.PEM\r\n`;

  const { ok, findings } = secretFiles(diff);
  assert.equal(ok, false);
  assert.deepEqual(findings.map((finding) => finding.path), [path, "Keys/Prod.PEM"]);
});

test("reads Git-quoted paths, including octal UTF-8 and escaped whitespace", () => {
  const source = String.raw`"old\tname.txt"`;
  const destination = String.raw`"caf\303\251\tprofile/Cookies"`;
  const diff = `R100\t${source}\t${destination}`;

  const { ok, findings } = secretFiles(diff);
  assert.equal(ok, false);
  assert.deepEqual(findings.map(({ path }) => path), ["café\tprofile/Cookies"]);
});

test("fails closed for missing or empty input", () => {
  for (const input of [undefined, "", "\r\n", "  \n"]) {
    const { ok, findings } = secretFiles(input);

    assert.equal(ok, false);
    assert.equal(findings.length, 1);
    assert.equal(findings[0].kind, "unreadable");
    assert.ok(findings[0].reason.trim());
  }
});

test("reports unreadable rows and still checks later paths", () => {
  const diff = ["unreadable row", "R100\told.txt", 'A\t"unterminated', "A\tconfig/", "A\t.env"].join("\n");

  const { ok, findings } = secretFiles(diff);
  assert.equal(ok, false);
  assert.deepEqual(findings.map(({ path, kind }) => ({ path, kind })), [
    { path: null, kind: "unreadable" },
    { path: null, kind: "unreadable" },
    { path: null, kind: "unreadable" },
    { path: null, kind: "unreadable" },
    { path: ".env", kind: "env" },
  ]);
  assert.match(findings[0].reason, /line 1/i);
  assert.doesNotMatch(findings[0].reason, /unreadable row/);
});
