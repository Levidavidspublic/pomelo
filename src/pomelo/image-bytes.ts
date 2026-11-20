export type ImageKind = "png" | "jpeg" | "gif" | "webp";
export type ImageContentType = `image/${ImageKind}`;

export interface ImageBytesLimits {
  maxBytes?: number;
}

export type ImageBytesResult =
  | { ok: true; kind: ImageKind; contentType: ImageContentType; reason: null }
  | { ok: false; kind: null; contentType: null; reason: string };

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024;
const REFUSED = { ok: false, kind: null, contentType: null } as const;

const SIGNATURES: readonly (readonly [ImageKind, readonly (number | null)[]])[] = [
  ["png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
  ["jpeg", [0xff, 0xd8, 0xff]],
  ["gif", [0x47, 0x49, 0x46, 0x38, 0x37, 0x61]], // GIF87a
  ["gif", [0x47, 0x49, 0x46, 0x38, 0x39, 0x61]], // GIF89a
  // RIFF, four variable size bytes, then WEBP.
  ["webp", [0x52, 0x49, 0x46, 0x46, null, null, null, null, 0x57, 0x45, 0x42, 0x50]],
];

/** Checks the byte length and the raster signature in the first 12 bytes. */
export function checkImageBytes(
  bytes: Uint8Array,
  declaredType?: string,
  limits?: ImageBytesLimits,
): ImageBytesResult {
  const maxBytes = limits?.maxBytes ?? DEFAULT_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    return { ...REFUSED, reason: "The image size limit must be a nonnegative whole number of bytes." };
  }
  if (bytes.length === 0) return { ...REFUSED, reason: "The image is empty." };
  if (bytes.length > maxBytes) return { ...REFUSED, reason: "The image exceeds the size limit." };

  const match = SIGNATURES.find(([, signature]) =>
    bytes.length >= signature.length &&
    signature.every((value, index) => value === null || bytes[index] === value),
  );
  if (!match) return { ...REFUSED, reason: "The image signature is unsupported." };

  const [kind] = match;
  const contentType: ImageContentType = `image/${kind}`;
  if (declaredType !== undefined &&
      (typeof declaredType !== "string" || declaredType.trim().toLowerCase() !== contentType)) {
    return { ...REFUSED, reason: "The declared media type does not match the image format." };
  }
  return { ok: true, kind, contentType, reason: null };
}
