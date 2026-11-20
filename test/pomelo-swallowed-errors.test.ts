import assert from "node:assert/strict";
import test from "node:test";
import { swallowedErrors } from "../src/pomelo/swallowed-errors.js";

const path = "src/pomelo/worker.ts";
const testPath = "test/pomelo-worker.test.ts";

function lines(first: number, ...source: string[]) {
  return source.map((text, offset) => ({ line: first + offset, text }));
}

test("reports empty catches with and without a binding, including across added lines", () => {
  assert.deepEqual(swallowedErrors([{
    path: testPath,
    added: lines(4,
      "try { assert.equal(actual, expected); } catch {}",
      "try { check(); } catch (e) {}",
      "try { check(); } catch (error) {",
      "",
      "}",
    ),
  }]), [
    { path: testPath, line: 4, rule: "empty-catch" },
    { path: testPath, line: 5, rule: "empty-catch" },
    { path: testPath, line: 6, rule: "empty-catch" },
  ]);
});

test("reports comment-only catches and catches that return without a failure value", () => {
  assert.deepEqual(swallowedErrors([{
    path,
    added: lines(10,
      "try { work(); } catch { /* ignored */ }",
      "try { work(); } catch (error) {",
      "  // Ignore the error",
      "}",
      "try { work(); } catch { return; }",
      "try { work(); } catch { return undefined; }",
    ),
  }]), [
    { path, line: 10, rule: "comment-only-catch" },
    { path, line: 11, rule: "comment-only-catch" },
    { path, line: 14, rule: "empty-catch" },
    { path, line: 15, rule: "empty-catch" },
  ]);
});

test("reports empty promise catch callbacks and then rejection handlers", () => {
  assert.deepEqual(swallowedErrors([{
    path,
    added: lines(20,
      "work().catch(() => {});",
      "work().catch(() => undefined);",
      "work().catch(() => null);",
      "work().catch(noop);",
      "work().then(undefined, () => {});",
      "work().then(value => report(value, format(value)),",
      "  function (error) { return; },",
      ");",
      "work().catch(async (error: unknown) => { /* ignored */ });",
    ),
  }]), [
    { path, line: 20, rule: "empty-promise-catch" },
    { path, line: 21, rule: "empty-promise-catch" },
    { path, line: 22, rule: "empty-promise-catch" },
    { path, line: 23, rule: "empty-promise-catch" },
    { path, line: 24, rule: "empty-rejection-handler" },
    { path, line: 25, rule: "empty-rejection-handler" },
    { path, line: 28, rule: "empty-promise-catch" },
  ]);
});

test("accepts failures that are rethrown, returned, reported, or asserted", () => {
  const added = lines(40,
    "try { work(); } catch (error) { throw error; }",
    "try { work(); } catch (error) { return { ok: false, reason: error }; }",
    "try { work(); } catch (error) { report(error); }",
    "work().catch(error => { throw error; });",
    "work().catch(error => ({ ok: false, reason: error }));",
    "work().then(undefined, error => report(error));",
    "work().then(() => {});",
    "work().catch(() => undefinedIfHandled());",
    "await assert.rejects(work());",
    "assert.throws(work);",
  );
  assert.deepEqual(swallowedErrors([{ path: testPath, added }]), []);
});

test("ignores catch syntax in strings, template literals, and comments", () => {
  const added = lines(60,
    'const doubleQuoted = "try { work(); } catch {}";',
    "const singleQuoted = 'work().catch(() => {})';",
    "const template = `try { work(); } catch (error) {}",
    "work().then(undefined, () => {});",
    "`;",
    "// try { work(); } catch {}",
    "/* work().catch(() => {});",
    "try { work(); } catch (error) {} */",
    "try { work(); } catch (error) { return 'handled'; }",
    "const matcher = /} catch {}/;",
    "const nested = \`example: \${\`try { work(); } catch {}\`}\`;",
    "const nestedWithDelimiters = \`example: \${format({ value: \`work().catch(noop)\` })}\`;",
  );
  assert.deepEqual(swallowedErrors([{ path, added }]), []);
});

test("recognizes catch clauses at the start of a diff fragment and ignores methods named catch", () => {
  assert.deepEqual(swallowedErrors([{
    path,
    added: [
      ...lines(3, "catch (error) {}"),
      ...lines(9, "} catch (error) {}"),
      ...lines(15, "class Trap { other() {} catch(error: unknown) {} }"),
    ],
  }]), [
    { path, line: 3, rule: "empty-catch" },
    { path, line: 9, rule: "empty-catch" },
  ]);
});

test("checks only Pomelo paths, honors exact allowlisted paths, and sorts findings", () => {
  const clientPath = "src/client/pomelo/panel.tsx";
  const allowedPath = "src/pomelo/allowed.ts";
  const added = [...lines(12, "try { work(); } catch {}"), ...lines(4, "work().catch(noop);")];
  assert.deepEqual(swallowedErrors([
    { path: testPath, added },
    { path: "test/session.test.ts", added },
    { path: "test/nested/pomelo-worker.test.ts", added },
    { path: "test/pomelo-worker.ts", added },
    { path: "src/app.ts", added },
    { path: "src/client/pomelo-extra/panel.tsx", added },
    { path: "src/pomelo-extra/worker.ts", added },
    { path: allowedPath, added },
    { path, added },
    { path: clientPath, added },
  ], [allowedPath, "src/pomelo/"]), [clientPath, path, testPath].flatMap((path) => [
    { path, line: 4, rule: "empty-promise-catch" },
    { path, line: 12, rule: "empty-catch" },
  ]));
});

test("skips malformed entries and does not join additions across missing lines", () => {
  assert.deepEqual(swallowedErrors(null), []);
  assert.deepEqual(swallowedErrors([
    null,
    { added: lines(3, "try { work(); } catch {}") },
    { path, added: "work().catch(noop)" },
    { path, added: [
      null,
      { line: 0, text: "work().catch(noop);" },
      { line: 7, text: "try { work(); } catch {" },
      { line: 8 },
      { line: 9, text: "}" },
      { line: 10, text: "work().catch(" },
      { line: 12, text: "  () => {});" },
      { line: 16, text: "work().catch(noop);" },
    ] },
  ]), [{ path, line: 16, rule: "empty-promise-catch" }]);
});
