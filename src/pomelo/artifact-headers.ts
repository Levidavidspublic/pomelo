import path from "node:path";
import { checkBodyRef } from "./artifact.js";

const HTML_TYPE = "text/html; charset=utf-8";
const DIAGRAM_TYPE = "text/plain; charset=utf-8";
const CHART_TYPE = "application/json";
const DOWNLOAD_TYPE = "application/octet-stream";
const IMAGE_TYPES = new Map([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".gif", "image/gif"],
]);

const INERT_CSP = "default-src 'none'";
const HTML_CSP = [
  "sandbox allow-scripts",
  INERT_CSP,
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");

const FILENAME_CONTROLS = /[\p{Cc}\p{Bidi_Control}\p{Zl}\p{Zp}]/gu;

function contentType(kind: string | undefined, extension: string | undefined): string | undefined {
  switch (kind) {
    case "html":
      return extension === undefined || extension === ".html" || extension === ".htm" ? HTML_TYPE : undefined;
    case "diagram":
    case "mermaid":
      return extension === undefined || extension === ".mmd" ? DIAGRAM_TYPE : undefined;
    case "chart":
      return extension === undefined || extension === ".json" ? CHART_TYPE : undefined;
    case "image":
      return IMAGE_TYPES.get(extension ?? "");
  }
}

function attachmentDisposition(name: string): string {
  // Replace lone surrogates before encoding so malformed UTF-16 still gives a valid header.
  const displayName = name.replace(/[\uD800-\uDFFF]/gu, "\uFFFD").trim().replace(/[. ]+$/, "");
  const asciiName = displayName.replace(/[^a-z0-9._ -]+/gi, "_");
  const usableName = checkBodyRef(asciiName);
  const fallback = usableName ? asciiName : "artifact";
  const encoded = encodeURIComponent(usableName ? displayName : fallback)
    .replace(/['()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

export function artifactHeaders(input: { kind: string; fileName?: string; download?: boolean }): Record<string, string> {
  const fileName = input?.fileName;
  const name = typeof fileName === "string" ? fileName.split(/[\\/]/).at(-1) ?? "" : "";
  const cleanName = name.replace(FILENAME_CONTROLS, "");
  // A missing filename permits the fixed source types. An invalid filename matches no extension.
  let extension: string | undefined;
  if (fileName !== undefined) extension = name === cleanName && checkBodyRef(name) ? path.extname(name).toLowerCase() : "";

  const download = input?.download;
  const type = download === undefined || typeof download === "boolean" ? contentType(input?.kind, extension) : undefined;
  const headers: Record<string, string> = {
    "Content-Type": type ?? DOWNLOAD_TYPE,
    "Content-Security-Policy": type === HTML_TYPE ? HTML_CSP : INERT_CSP,
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  if (download === true || type === undefined) headers["Content-Disposition"] = attachmentDisposition(cleanName);
  return headers;
}
