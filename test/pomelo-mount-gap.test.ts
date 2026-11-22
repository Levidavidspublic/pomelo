import { test } from "node:test";
import assert from "node:assert/strict";
import { mountGaps } from "../src/pomelo/mount-gap.js";

const reason = "No Friday file or mounted Pomelo component imports this.";

function pomelo(name: string, text = "") {
  return { path: `src/client/pomelo/${name}`, text };
}

test("finds direct mounts and follows imports through reached Pomelo files", () => {
  const container = pomelo("Container.tsx", [
    "import {",
    "  Child,",
    "  type ChildProps,",
    "} from './Child.tsx';",
    "import { model } from './model.ts';",
  ].join("\n"));
  const child = pomelo("Child.tsx", "import { Container } from './Container';");
  const leaf = pomelo("Leaf.tsx");
  const model = pomelo("model.ts", "import { Leaf } from './Leaf';");
  const friday = {
    path: "src/client/panels/Sidebar.tsx",
    text: 'import { Container } from "../pomelo/Container.js";',
  };
  const files = [leaf, model, container, friday, child];
  const expected = { ok: true, mounted: [child.path, container.path, leaf.path], gaps: [] };
  assert.deepEqual(mountGaps(files), expected);
  assert.deepEqual(mountGaps(files.toReversed()), expected);
});

test("lists gaps in path order even if they are imported by tests or by an unmounted cycle", () => {
  const first = pomelo("CycleA.tsx", 'import { CycleB } from "./CycleB.js";');
  const second = pomelo("CycleB.tsx", 'import { CycleA } from "./CycleA.js";');
  const orphan = pomelo("Orphan.tsx");
  const orphanTest = {
    path: "test/pomelo-orphan.test.ts",
    text: 'import { Orphan } from "../src/client/pomelo/Orphan.js";',
  };
  const friday = { path: "src/client/App.tsx", text: "" };
  assert.deepEqual(mountGaps([orphan, second, orphanTest, friday, pomelo("model.ts"), first]), {
    ok: true,
    mounted: [],
    gaps: [first, second, orphan].map(({ path }) => ({ path, reason })),
  });
});

test("ignores type-only imports, aliases and import examples in comments and strings", () => {
  const panel = pomelo("Panel.tsx");
  const friday = {
    path: "src/client/App.tsx",
    text: [
      'import type { Panel } from "./pomelo/Panel.js";',
      'import { type Panel as Props } from "./pomelo/Panel";',
      "import type {",
      "  Panel,",
      '} from "./pomelo/Panel";',
      'import { Panel } from "@/pomelo/Panel";',
      '// import { Panel } from "./pomelo/Panel";',
      '/*',
      'import { Panel } from "./pomelo/Panel";',
      '*/',
      'const example = `',
      'import { Panel } from "./pomelo/Panel";',
      '`;',
    ].join("\n"),
  };
  assert.deepEqual(mountGaps([panel, friday]), {
    ok: true,
    mounted: [],
    gaps: [{ path: panel.path, reason }],
  });
});

test("refuses empty or non-array input with a reason", () => {
  for (const files of [[], null, "not an array", { path: "src/client/App.tsx", text: "" }]) {
    const result = mountGaps(files as Parameters<typeof mountGaps>[0]);
    assert.equal(result.ok, false);
    assert.ok(result.reason.trim());
  }
});
