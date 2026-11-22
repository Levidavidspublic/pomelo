import assert from "node:assert/strict";
import test from "node:test";
import { matchTarget } from "../src/pomelo/browser/target-match.js";
import { assertNoCanary } from "../src/pomelo/canary-sweep.js";

const save = { ref: 1, role: "button", name: "Save" };
const firstDelete = { ref: 2, role: "button", name: "Delete", group: "First row" };
const secondDelete = { ref: 3, role: "button", name: "Delete", group: "Second row" };
const deleteButtons = [firstDelete, secondDelete];
const deleteTarget = { role: "button", name: "Delete" };

test("returns the ref for one whole name regardless of case or surrounding whitespace", () => {
  for (const name of ["Save", "  save ", "SAVE"]) {
    assert.deepEqual(matchTarget({ role: "button", name }, [save]), {
      decision: "go",
      ref: 1,
      reason: "One element matches the target.",
    });
  }
});

test("holds when two buttons have the same name", () => {
  assert.deepEqual(matchTarget(deleteTarget, deleteButtons), {
    decision: "hold",
    candidates: [2, 3],
    reason: "Hold for Amit because 2 elements match the target.",
  });
});

test("uses a whole group label to settle a tie", () => {
  const result = matchTarget({ ...deleteTarget, near: "  SECOND\tROW " }, deleteButtons);
  assert.equal(result.decision, "go");
  assert.equal(result.decision === "go" && result.ref, 3);
});

test("holds when the group label matches neither button or both buttons", () => {
  const ambiguous = matchTarget(deleteTarget, deleteButtons);
  assert.deepEqual(matchTarget({ ...deleteTarget, near: "row" }, deleteButtons), ambiguous);
  assert.deepEqual(matchTarget({ ...deleteTarget, near: "First row" }, [
    firstDelete,
    { ...secondDelete, group: "First row" },
  ]), ambiguous);
});

test("takes a new read when no eligible element has the whole requested name", () => {
  const reread = {
    decision: "reread",
    reason: "Take a fresh masked read because 0 elements match the target.",
  };
  assert.deepEqual(matchTarget({ name: "Del" }, deleteButtons), reread);
  assert.deepEqual(matchTarget({ name: "Delete" }, [{ ...firstDelete, name: "Delete row" }]), reread);
  assert.deepEqual(matchTarget({ role: "link", name: "Save" }, [save]), reread);
  assert.deepEqual(matchTarget({ name: "Cancel" }, [save]), reread);
  assert.deepEqual(matchTarget({ name: "Save" }, []), reread);
});

test("matches Hebrew names and normalizes Unicode and internal whitespace", () => {
  const hebrew = { ref: 4, role: "button", name: "שמור" };
  assert.equal(matchTarget({ name: "שמור" }, [hebrew]).decision, "go");
  assert.equal(matchTarget({ name: "  שמור " }, [hebrew]).decision, "go");

  const mixed = { ref: 5, role: "link", name: "Cafe\u0301\n\tשמור" };
  assert.equal(matchTarget({ name: "CAFÉ שמור" }, [mixed]).decision, "go");
});

test("holds with a fixed reason for empty and non-string names", () => {
  for (const name of ["", " \n\t ", 42, null]) {
    assert.deepEqual(matchTarget({ name }, [save]), {
      decision: "hold",
      candidates: [],
      reason: "A target name is required.",
    });
  }
});

test("matches a masked field by its label and ignores its hidden value", () => {
  const field = { ref: 6, role: "textbox", name: "Passphrase", masked: true, value: "Hidden value" };
  assert.equal(matchTarget({ name: field.value }, [field]).decision, "reread");
  const result = matchTarget({ role: "textbox", name: field.name }, [field]);
  assert.equal(result.decision, "go");
  assert.equal(result.decision === "go" && result.ref, 6);
});

test("keeps all canary forms out of every result", () => {
  const canary = 'synthetic-"target"/שמור';
  const field = { ref: 7, role: "textbox", name: canary, group: canary, masked: true, value: canary };
  const duplicate = { ...field, ref: 8 };

  assertNoCanary(canary, {
    go: JSON.stringify(matchTarget({ name: canary }, [field])),
    reread: JSON.stringify(matchTarget({ role: "link", name: canary }, [field])),
    ambiguous: JSON.stringify(matchTarget({ name: canary, near: canary }, [field, duplicate])),
    invalid: JSON.stringify(matchTarget({ name: [canary] }, [field])),
  });
});
