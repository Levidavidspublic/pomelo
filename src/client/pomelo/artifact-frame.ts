const CSP = [
  "default-src 'none'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data:",
].join("; ");

export function artifactFrameProps(html: string, title: string) {
  const content = html.replace(/^\s*<!doctype\s+[^>]*>/i, "");
  // The browser puts these metas in the head before parsing a fragment or a full page.
  // CSP blocks resource loads here. Frame self-navigation is outside these directives.
  const srcDoc = `<!doctype html><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="referrer" content="no-referrer">${content || "<body></body>"}`;
  return { sandbox: "allow-scripts", referrerPolicy: "no-referrer", title: title.trim() || "HTML artifact", srcDoc } as const;
}
