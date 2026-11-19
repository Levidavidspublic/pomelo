export type SecretRef = Readonly<{
  id: string;
  opRef: string;
  allowedOrigins: readonly string[];
  field: string;
  expiresAt?: number;
}>;

const refFields = ["id", "opRef", "allowedOrigins", "field", "expiresAt"];
// A vault, item and field, with an optional section before the field.
const opReference = /^op:\/\/[^/:@\s\\?#\p{Cc}]+(?:\/[^/\s\\?#\p{Cc}]+){2,3}$/u;

export function secretRefKey(id: string): string {
  return `pomelo:ref:${id}`;
}

// Require the same serialized origin that a browser supplies for an exact match.
function isHttpsOrigin(origin: unknown): origin is string {
  return typeof origin === "string" && origin.startsWith("https://") && !origin.includes("*") &&
    URL.canParse(origin) && new URL(origin).origin === origin;
}

export function newSecretRef(input: SecretRef): SecretRef {
  if (Reflect.ownKeys(input).some((key) => typeof key !== "string" || !refFields.includes(key))) {
    throw new TypeError("Secret ref has an unexpected field");
  }

  const { id, opRef, allowedOrigins, field, expiresAt } = input;
  if (typeof opRef !== "string" || !opReference.test(opRef)) {
    throw new TypeError("Secret ref requires an op:// reference");
  }
  if (typeof id !== "string" || !id.trim() || typeof field !== "string" || !field.trim()) {
    throw new TypeError("Secret ref requires an id and a field");
  }
  if (expiresAt !== undefined && !Number.isFinite(expiresAt)) {
    throw new TypeError("Secret ref expiresAt must be a finite timestamp");
  }

  const origins = Array.isArray(allowedOrigins) ? [...allowedOrigins] : [];
  if (!origins.length || !origins.every(isHttpsOrigin)) {
    throw new TypeError("Secret ref allowedOrigins must contain full HTTPS origins");
  }

  const ref = { id, opRef, allowedOrigins: Object.freeze(origins), field };
  return Object.freeze(expiresAt === undefined ? ref : { ...ref, expiresAt });
}
