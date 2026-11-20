import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ImageCardView } from "../src/client/pomelo/ImageCardView.js";
import { imageFrame } from "../src/client/pomelo/image-frame.js";
import { checkImageSource } from "../src/client/pomelo/image-source.js";

type Props = ComponentProps<typeof ImageCardView>;

const localCard = { src: "  /api/image.png  ", alt: "  A view   of the harbor  ", width: 800, height: 400 };

function render(card: Props["card"], options: Partial<Omit<Props, "card">> = {}): string {
  const html = renderToStaticMarkup(createElement(ImageCardView, { card, where: "chat", ...options }));
  assert.doesNotMatch(html, /<script\b|\bonerror\s*=|style="animation/i);
  return html;
}

test("reserves the model's chat frame for one lazy image with the checked source and model alt", () => {
  const checked = checkImageSource(localCard);
  assert.equal(checked.mode, "show");
  const frame = imageFrame(localCard, "loading", "chat");
  const html = render(localCard);
  const images = html.match(/<img\b[^>]*>/g) ?? [];
  assert.equal(images.length, 1);
  assert.ok(images[0].includes(`src="${checked.src}"`));
  assert.ok(images[0].includes(`alt="${frame.alt}"`));
  assert.match(images[0], /\bloading="lazy"/);
  const style = html.match(/^<div\b[^>]*\bstyle="([^"]+)"/)?.[1];
  assert.ok(style);
  assert.ok(style.includes(`aspect-ratio:${frame.box.aspectRatio}`));
  assert.ok(style.includes(`max-height:${frame.box.maxHeight}px`));
});

test("uses the model's default alt when neither alt nor title is supplied", () => {
  const card = { src: localCard.src };
  const { alt } = imageFrame({}, "loading", "chat");
  assert.ok(alt);
  assert.ok(render(card).includes(`alt="${alt}"`));
});

test("keeps a Hebrew alt whole", () => {
  const card = { ...localCard, alt: "תצפית על נמל חיפה" };
  assert.ok(render(card).includes(`alt="${card.alt}"`));
});

test("uses the model's title fallback and omits the chat height cap in the panel", () => {
  const card = { ...localCard, alt: "", title: "Harbor at dawn" };
  const html = render(card, { where: "panel", initialState: "loaded" });
  const frame = imageFrame(card, "loaded", "panel");
  assert.ok(html.includes(`alt="${frame.alt}"`));
  assert.ok(html.includes(`aspect-ratio:${frame.box.aspectRatio}`));
  assert.doesNotMatch(html, /max-height:/);
});

test("renders a remote source as one new-tab link with the model alt and no image", () => {
  const card = { ...localCard, src: "https://EXAMPLE.com/image.png" };
  const checked = checkImageSource(card);
  assert.equal(checked.mode, "link");
  const html = render(card);
  assert.doesNotMatch(html, /<img\b|rel="preload"/);
  const links = html.match(/<a\b[^>]*>[^<]*<\/a>/g) ?? [];
  assert.equal(links.length, 1);
  assert.ok(links[0].includes(`href="${checked.href}"`));
  assert.ok(links[0].endsWith(`>${imageFrame(card, "loading", "chat").alt}</a>`));
  assert.match(links[0], /\btarget="_blank"/);
  const rel = links[0].match(/\brel="([^"]+)"/)?.[1].split(/\s+/) ?? [];
  assert.ok(rel.includes("noreferrer"));
  assert.ok(rel.includes("noopener"));
});

test("renders only the refusal reason for an unsupported source", () => {
  const card = { ...localCard, src: "javascript:unsupported" };
  const checked = checkImageSource(card);
  assert.equal(checked.mode, "refuse");
  const html = render(card);
  assert.doesNotMatch(html, /<(?:img|a)\b/);
  assert.equal(html.replace(/<[^>]+>/g, ""), checked.reason);
});

test("renders the model's failed note and keeps the frame without an image", () => {
  const frame = imageFrame(localCard, "failed", "chat");
  assert.equal(frame.state, "failed");
  const html = render(localCard, { initialState: "failed" });
  assert.doesNotMatch(html, /<(?:img|a)\b/);
  assert.ok(html.includes(frame.note));
  assert.ok(html.includes(`aspect-ratio:${frame.box.aspectRatio}`));
});

test("escapes markup in alt text", () => {
  const html = render({ ...localCard, alt: 'Harbor "<script>"' });
  assert.match(html, /alt="Harbor &quot;&lt;script&gt;&quot;"/);
});
