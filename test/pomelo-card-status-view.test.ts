import assert from "node:assert/strict";
import { test } from "node:test";
import { Children, createElement, isValidElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloCardStatus } from "../src/client/pomelo/PomeloCardStatus.js";
import { cardArrival } from "../src/client/pomelo/card-arrival.js";
import { cardView, emptyCardFailures, failCard, retryCard } from "../src/client/pomelo/card-failure.js";

type StatusProps = ComponentProps<typeof PomeloCardStatus>;

const placeholder = cardArrival({ kind: "chart", argsText: "{", ended: false });
const fallback = cardArrival({ kind: "chart", argsText: "{", ended: true });
const ready = cardArrival({ kind: "chart", argsText: "{}", ended: true });

const chart = { id: "chart-1", kind: "chart", title: "Monthly totals" } as const;
const initial = emptyCardFailures({ cardIds: [chart.id], retryLimit: 1 });
const drawError = new Error("Chart renderer rejected its input");
const failed = failCard(initial, chart, drawError);
const retrying = retryCard(failed, chart.id);
const okView = cardView(initial, chart);
const failedView = cardView(failed, chart);
const retryingView = cardView(retrying, chart);
const exhaustedView = cardView(failCard(retrying, chart, drawError), chart);
const failureText = /Couldn&#x27;t display this chart \(Monthly totals\)\./;

function render(props: Omit<StatusProps, "onRetry"> = {}) {
  return renderToStaticMarkup(createElement(PomeloCardStatus, {
    ...props,
    onRetry: () => assert.fail("Rendering should never retry a card"),
  }));
}

test("a streaming chart shows one busy status line", () => {
  const html = render({ arrival: placeholder });
  assert.match(html, /^<\w+\b(?=[^>]*\brole="status")(?=[^>]*\baria-busy="true")[^>]*>Chart on its way<\/\w+>$/);
});

test("an ended card with invalid data shows the fixed fallback as text", () => {
  const html = render({ arrival: fallback });
  assert.match(html, />Card data is invalid\.</);
  assert.doesNotMatch(html, /\baria-busy="true"|<button\b/);
});

test("a ready card, an ok failure view, and absent models render nothing", () => {
  assert.equal(render({ arrival: ready }), "");
  assert.equal(render({ failure: okView }), "");
  assert.equal(render(), "");
});

test("a failed card shows its fallback and one Try again button", () => {
  const html = render({ failure: failedView });
  assert.match(html, failureText);
  assert.ok(!html.includes(drawError.message));
  assert.equal([...html.matchAll(/<button\b/g)].length, 1);
  assert.match(html, /<button\b[^>]*\btype="button"[^>]*>Try again<\/button>/);
  assert.doesNotMatch(html, /\baria-busy="true"/);
});

test("a failed card out of retries shows its fallback without a button", () => {
  const html = render({ failure: exhaustedView });
  assert.match(html, failureText);
  assert.doesNotMatch(html, /<button\b|\baria-busy="true"/);
});

test("a retrying card keeps its fallback busy and shows no button", () => {
  const html = render({ failure: retryingView });
  assert.match(html, failureText);
  assert.match(html, /^<\w+\b[^>]*\baria-busy="true"/);
  assert.doesNotMatch(html, /<button\b/);
});

test("the button calls onRetry once per press", () => {
  let retries = 0;
  const status = PomeloCardStatus({ failure: failedView, onRetry: () => { retries++; } });
  assert.ok(status);
  const button = Children.toArray(status.props.children).find(
    (child) => isValidElement(child) && child.type === "button",
  );
  assert.ok(isValidElement<{ onClick: () => void }>(button));
  assert.equal(retries, 0);
  button.props.onClick();
  assert.equal(retries, 1);
  button.props.onClick();
  assert.equal(retries, 2);
});

test("failed and retrying views take precedence over an arriving card", () => {
  for (const failure of [failedView, retryingView]) {
    assert.equal(render({ arrival: placeholder, failure }), render({ failure }));
  }
  assert.equal(render({ arrival: placeholder, failure: okView }), render({ arrival: placeholder }));
});

test("the model filters a markup title and the view escapes markup in fallback text", () => {
  const title = "<script>chart</script>";
  const failure = cardView(failed, { ...chart, title });
  const html = render({ failure });
  assert.match(html, /Couldn&#x27;t display this chart\./);
  assert.doesNotMatch(html, /<\/?script\b/);

  // Supply markup as display text to exercise the view's escaping after model filtering.
  const withMarkup = render({ failure: { ...failure, fallbackText: title } });
  assert.match(withMarkup, />&lt;script&gt;chart&lt;\/script&gt;</);
  assert.doesNotMatch(withMarkup, /<\/?script\b/);
});

test("the region direction follows the displayed text", () => {
  const title = "סיכום חודשי";
  const failure = cardView(failed, { ...chart, title });
  const mixed = render({ failure });
  assert.match(mixed, /^<\w+\b[^>]*\bdir="ltr"/);
  assert.ok(mixed.includes(title));

  // The model's template starts in English. Exercise Hebrew-first text at the view boundary.
  const hebrew = render({ failure: { ...failure, fallbackText: `לא ניתן להציג את התרשים (${title}).` } });
  assert.match(hebrew, /^<\w+\b[^>]*\bdir="rtl"/);
  assert.match(hebrew, />לא ניתן להציג את התרשים \(סיכום חודשי\)\.</);
});

test("all states stay free of focus attributes, links, raw HTML, and animation", () => {
  const states = [
    { arrival: placeholder }, { arrival: fallback }, { arrival: ready },
    { failure: okView }, { failure: failedView }, { failure: retryingView }, { failure: exhaustedView },
  ];
  for (const props of states) {
    assert.doesNotMatch(render(props), /\b(?:autofocus|tabindex|dangerouslySetInnerHTML)\b|<a\b|\banimate[-:]|\banimation\s*:/i);
  }
});
