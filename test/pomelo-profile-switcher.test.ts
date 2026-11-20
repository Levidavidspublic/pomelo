import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PomeloProfileSwitcher } from "../src/client/pomelo/PomeloProfileSwitcher.js";
import { profileSwitch } from "../src/client/pomelo/profile-switch.js";

const local = { id: "local", name: "Local browser", location: "local" } as const;
const cloud = { id: "cloud", name: "דפדפן ענן", location: "cloud" } as const;
const input = {
  profiles: [local, cloud],
  jobs: [],
  currentProfileId: local.id,
  cloudReachable: true,
} as const;

const render = (model = profileSwitch(input)) =>
  renderToStaticMarkup(createElement(PomeloProfileSwitcher, { model, onPick: () => {} }));
const radios = (html: string) => html.match(/<button\b[^>]*\brole="radio"[^>]*>[\s\S]*?<\/button>/g) ?? [];

test("browser profiles appear in a labelled radio group with the current profile checked", () => {
  const html = render();
  assert.match(html, /<div\b[^>]*role="radiogroup"[^>]*aria-label="Browser profiles"[^>]*>[\s\S]*<\/div>$/);
  const options = radios(html);
  assert.equal(options.length, 2);
  const [localOption, cloudOption] = options;
  assert.match(localOption, /aria-checked="true"/);
  assert.match(localOption, /tabindex="0"/);
  assert.match(localOption, />Local browser</);
  assert.match(localOption, /<svg\b[^>]*\baria-hidden="true"/);
  assert.doesNotMatch(localOption, /VPS/);
  assert.match(cloudOption, /aria-checked="false"/);
  assert.match(cloudOption, /tabindex="-1"/);
  assert.match(cloudOption, />VPS</);
  assert.match(cloudOption, /Cloud browser/);
  assert.match(cloudOption, /<span\b[^>]*dir="rtl"[^>]*>דפדפן ענן<\/span>/);
});

test("a blocked profile exposes its model reason through aria-describedby", () => {
  const model = profileSwitch({ ...input, cloudReachable: false });
  const html = render(model);
  const options = radios(html);
  assert.equal(options.length, 2);
  const [localOption, cloudOption] = options;
  assert.doesNotMatch(localOption, /aria-disabled="true"|aria-describedby=/);
  assert.match(cloudOption, /aria-disabled="true"/);
  const reasonId = cloudOption.match(/aria-describedby="([^"]+)"/)?.[1];
  assert.ok(reasonId);
  assert.match(html, new RegExp(`<[^>]+ id="${reasonId}"[^>]*>VPS not reachable</`));
});

test("an empty profile list renders the model's Settings prompt", () => {
  const model = profileSwitch({ ...input, profiles: [] });
  const html = render(model);
  assert.ok(model.emptyLine);
  assert.ok(html.includes(model.emptyLine));
  assert.deepEqual(radios(html), []);
});

test("profile inputs keep unused paths and addresses out of the markup", () => {
  const profile = {
    ...cloud,
    folder: "/example/profile-folder-canary",
    cdpUrl: "ws://profile-address-canary.invalid",
  };
  const html = render(profileSwitch({ ...input, profiles: [local, profile] }));
  assert.ok(html.includes(profile.name));
  assert.equal(html.includes(profile.folder), false);
  assert.equal(html.includes(profile.cdpUrl), false);
});
