// Parse in a template so the browser cannot act on the markup before filtering it.
// Keep only display elements and attributes, since CSP does not block frame self-navigation.
const RENDER_ARTIFACT = `
(() => {
  const template = document.createElement("template");
  template.innerHTML = JSON.parse(document.getElementById("artifact").textContent);

  const elements = new Set((
    "a abbr article aside b blockquote br caption code col colgroup dd del details div dl dt em " +
    "figcaption figure footer h1 h2 h3 h4 h5 h6 header hr i img kbd li main mark ol p pre " +
    "s samp section small span strong style sub summary sup table tbody td th thead tfoot tr u ul var"
  ).split(" "));
  const attributes = new Set((
    "alt class colspan dir height id lang open role rowspan scope span start style title width"
  ).split(" "));

  for (const element of template.content.querySelectorAll("*")) {
    if (element.namespaceURI !== "http://www.w3.org/1999/xhtml" || !elements.has(element.localName)) {
      element.remove();
      continue;
    }
    for (const attribute of [...element.attributes]) {
      if (attributes.has(attribute.name) || attribute.name.startsWith("aria-")) continue;
      if (element.localName === "img" && attribute.name === "src" && /^data:image\\//i.test(attribute.value)) continue;
      element.removeAttribute(attribute.name);
    }
  }

  document.body.replaceChildren(template.content);
})();`;

// This hash authorizes only RENDER_ARTIFACT. The unit test checks it against the script source.
const CSP = [
  "default-src 'none'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "script-src 'sha256-pS7wZLwrDkCaZ9g9/ZDkGyFk53O6fa9wA5jHNIXHTcg='",
  "style-src 'unsafe-inline'",
  "img-src data:",
].join("; ");

export function artifactFrameProps(html: string, title: string) {
  // Escape markup delimiters so the payload stays inside the inert JSON script element.
  const payload = JSON.stringify(html).replaceAll("<", "\\u003c");
  const srcDoc = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="referrer" content="no-referrer"></head><body><script type="application/json" id="artifact">${payload}</script><script>${RENDER_ARTIFACT}</script></body></html>`;
  return { sandbox: "allow-scripts", referrerPolicy: "no-referrer", title: title.trim() || "HTML artifact", srcDoc } as const;
}
