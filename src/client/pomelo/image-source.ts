export const IMAGE_SOURCE_LIMITS = Object.freeze({ maxDataUrlChars: 1_048_576, maxAltChars: 240 });

export type ImageSourceCard = { src: unknown; alt?: unknown };
export type ImageSourceCheck =
  | { mode: "show"; src: string; alt: string }
  | { mode: "link"; href: string; alt: string; reason: "remote" }
  | { mode: "refuse"; reason: string };

const CONTROL_CHARACTER = /\p{Cc}/u;
const INLINE_IMAGE_HEADER = /^data:image\/(?:png|jpeg|gif|webp|avif)(?:;[^,]*)?$/i;

function isLocalPath(src: string): boolean {
  const path = src.split(/[?#]/, 1)[0]!;
  if (!path || path === "." || path.startsWith("~/")) return false;
  if (path.startsWith("/") && !path.startsWith("/api/")) return false;

  try {
    // Check decoded path segments for traversal and separators. API query values can contain encoded file paths.
    return path.split("/").every((segment) => {
      const name = decodeURIComponent(segment);
      return name !== ".." && !/[\\/]/.test(name) && !CONTROL_CHARACTER.test(name);
    });
  } catch {
    return false;
  }
}

export function checkImageSource(card: ImageSourceCard): ImageSourceCheck {
  if (typeof card.src !== "string" || CONTROL_CHARACTER.test(card.src)) {
    return { mode: "refuse", reason: "Give an image source without control characters." };
  }
  const src = card.src.trim();
  const label = typeof card.alt === "string" ? card.alt.trim() : "";
  const alt = label.slice(0, IMAGE_SOURCE_LIMITS.maxAltChars).replace(/[\uD800-\uDBFF]$/, "").trimEnd() || "Image";

  if (/^https?:/i.test(src)) {
    try {
      return { mode: "link", href: new URL(src).href, alt, reason: "remote" };
    } catch {
      return { mode: "refuse", reason: "Give a valid HTTP or HTTPS address." };
    }
  }

  if (/^data:/i.test(src)) {
    if (src.length > IMAGE_SOURCE_LIMITS.maxDataUrlChars) {
      return { mode: "refuse", reason: "The inline image is too large." };
    }
    const comma = src.indexOf(",");
    if (comma < 0 || comma === src.length - 1 || !INLINE_IMAGE_HEADER.test(src.slice(0, comma))) {
      return { mode: "refuse", reason: "Give an inline PNG, JPEG, GIF, WebP or AVIF image." };
    }
    return { mode: "show", src, alt };
  }

  if (/^[a-z][a-z\d+.-]*:/i.test(src) || !isLocalPath(src)) {
    return { mode: "refuse", reason: "Give a local image path or a supported image address." };
  }
  return { mode: "show", src, alt };
}
