import assert from "node:assert/strict";
import test from "node:test";
import { fitTagChips } from "../src/client/pomelo/chip-overflow.js";

const limits = { maxChips: 3, maxChars: 20 };
const empty = { shown: [], hiddenCount: 0, moreLabel: "", ariaLabel: "" };

test("three tags fit without a more chip", () => {
  assert.deepEqual(fitTagChips(["Design", "Docs", "Build"], limits), {
    shown: [
      { tag: "Design", label: "Design" },
      { tag: "Docs", label: "Docs" },
      { tag: "Build", label: "Build" },
    ],
    hiddenCount: 0,
    moreLabel: "",
    ariaLabel: "Design, Docs, Build",
  });
});

test("five tags with room for two show +3 and name all five for screen readers", () => {
  const tags = ["Design", "Docs", "Build", "Review", "Release"];
  assert.deepEqual(fitTagChips(tags, { ...limits, maxChips: 2 }), {
    shown: [
      { tag: "Design", label: "Design" },
      { tag: "Docs", label: "Docs" },
    ],
    hiddenCount: 3,
    moreLabel: "+3",
    ariaLabel: "Design, Docs, Build, Review, Release",
  });
});

test("empty tags and case-insensitive repeats are dropped", () => {
  assert.deepEqual(fitTagChips(["Pomelo", "", "pomelo", "  ", "Docs"], limits), {
    shown: [
      { tag: "Pomelo", label: "Pomelo" },
      { tag: "Docs", label: "Docs" },
    ],
    hiddenCount: 0,
    moreLabel: "",
    ariaLabel: "Pomelo, Docs",
  });
});

test("the active tag moves ahead of the other tags without changing the input", () => {
  const tags = Object.freeze(["Design", "Docs", "Build"]);
  assert.deepEqual(fitTagChips(tags, { ...limits, maxChips: 2, activeTag: "build" }), {
    shown: [
      { tag: "Build", label: "Build" },
      { tag: "Design", label: "Design" },
    ],
    hiddenCount: 1,
    moreLabel: "+1",
    ariaLabel: "Build, Design, Docs",
  });
  assert.deepEqual(fitTagChips(tags, { ...limits, activeTag: "Release" }), fitTagChips(tags, limits));
});

test("a shortened Hebrew label keeps letters and their marks together", () => {
  const tag = "שָׁלוֹם";
  const result = fitTagChips([tag, "אַבּ"], { ...limits, maxChars: 2 });
  assert.deepEqual(result.shown, [
    { tag, label: "שָׁ…" },
    { tag: "אַבּ", label: "אַבּ" },
  ]);
  assert.equal(result.ariaLabel, `${tag}, אַבּ`);
  assert.deepEqual(fitTagChips([tag], { ...limits, maxChars: 1 }).shown, [{ tag, label: "…" }]);
});

test("zero visible slots count and name every tag, including the active one", () => {
  assert.deepEqual(fitTagChips(["Design", "Docs"], { ...limits, maxChips: 0, activeTag: "Design" }), {
    shown: [],
    hiddenCount: 2,
    moreLabel: "+2",
    ariaLabel: "Design, Docs",
  });
});

test("invalid input returns an empty result", () => {
  assert.deepEqual(fitTagChips("Design", limits), empty);
  assert.deepEqual(fitTagChips(["Design", null], limits), empty);
  assert.deepEqual(fitTagChips(["Design"], { ...limits, maxChips: -1 }), empty);
  assert.deepEqual(fitTagChips(["Design"], { ...limits, maxChars: NaN }), empty);
  assert.deepEqual(fitTagChips(["Design"], { ...limits, maxChars: 0 }), empty);
  assert.deepEqual(fitTagChips(["Design"], {
    ...limits,
    get maxChips(): number { throw new Error("Unreadable limit"); },
  }), empty);
  assert.deepEqual(fitTagChips([], limits), empty);
});
