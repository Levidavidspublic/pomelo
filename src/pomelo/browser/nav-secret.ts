import { canaryForms } from "../canary-sweep.js";
import { MASK } from "../mask.js";
import type { NavigationVerdict } from "./nav-rule.js";

interface AddressSecretOptions {
  knownSecrets?: readonly string[];
  /** Set only when the caller expects a sign-in return. */
  allowSignInReturn?: boolean;
}

interface AddressSecretProblem {
  part: "address" | "user-info" | "host" | "path" | "query" | "fragment";
  key: string | null;
  reason: string;
}

interface AddressSecretResult {
  verdict: Extract<NavigationVerdict, "go" | "refuse">;
  problems: AddressSecretProblem[];
  safeAddress: string;
}

// Includes the sensitive URL parameter names used by net-mask.ts.
const SECRET_KEY = /^(?:password|passwd|pwd|token|access_token|id_token|api_key|apikey|secret|otp|code|key|sig|signature|session)$/;

function* percentLayers(raw: string): Generator<string> {
  let value = raw;
  for (;;) {
    yield value;
    // Decode valid escapes even beside a stray percent sign or malformed UTF-8.
    const decoded = value.replace(/(?:%[\da-f]{2})+/gi, (escapes) =>
      new URLSearchParams(`v=${escapes}`).get("v")!,
    );
    if (decoded === value) return;
    value = decoded;
  }
}

function decodeParameter(raw: string): string {
  let decoded = "";
  for (const layer of percentLayers(raw.replaceAll("+", " "))) decoded = layer;
  return decoded;
}

function secretMatcher(secrets: Iterable<string>): (text: string, formEncoded?: boolean) => boolean {
  const literal = new Set<string>();
  const form = new Set<string>();
  const hex = new Set<string>();
  for (const secret of new Set(secrets)) {
    if (secret === "") continue;
    form.add(new URLSearchParams([["", secret]]).toString().slice(1));
    if (Array.from(secret).length >= 8) {
      for (const { form: encoding, needle } of canaryForms(secret)) {
        if (encoding === "hex") hex.add(needle.toLowerCase());
        else literal.add(needle);
      }
    } else {
      // The sweep helper requires eight characters, but a registered value can be shorter.
      const bytes = Buffer.from(secret);
      literal.add(secret);
      literal.add(JSON.stringify(secret).slice(1, -1));
      literal.add(bytes.toString("base64"));
      literal.add(bytes.toString("base64url"));
      hex.add(bytes.toString("hex"));
    }
  }
  if (literal.size === 0) return () => false;
  return (text, formEncoded = false) => {
    for (const layer of percentLayers(text)) {
      for (const needle of literal) {
        if (layer.includes(needle)) return true;
      }
      if (formEncoded) {
        for (const needle of form) {
          if (layer.includes(needle)) return true;
        }
      }
      const lowercase = layer.toLowerCase();
      for (const needle of hex) {
        if (lowercase.includes(needle)) return true;
      }
    }
    return false;
  };
}

/** Checks an address without opening it. Only safeAddress is suitable for logging. */
export function addressSecretCheck(address: string, options: AddressSecretOptions = {}): AddressSecretResult {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return {
      verdict: "refuse",
      problems: [{ part: "address", key: null, reason: "The address is invalid." }],
      safeAddress: MASK,
    };
  }

  const problems: AddressSecretProblem[] = [];
  const maskedValues = new Set<string>();
  const matchesKnown = secretMatcher(options.knownSecrets ?? []);
  const matchesInParameter = (value: string) => matchesKnown(value, true) || matchesKnown(decodeParameter(value));
  const knownReason = "The address contains a registered secret.";
  let foundKnown = false;

  function reportKnown(part: AddressSecretProblem["part"], key: string | null = null) {
    foundKnown = true;
    problems.push({ part, key, reason: knownReason });
  }

  function checkParameters(part: "query" | "fragment", raw: string) {
    if (!raw) return;
    // A fragment can carry a route before its parameters. Keep question marks inside values.
    const prefix = part === "fragment" ? raw.match(/^[^?=&]*\?/)?.[0] ?? "" : "";
    const parameters = raw.slice(prefix.length).split("&").map((entry) => {
      const separator = entry.indexOf("=");
      const rawKey = separator === -1 ? entry : entry.slice(0, separator);
      const value = separator === -1 ? "" : entry.slice(separator + 1);
      return { rawKey, key: decodeParameter(rawKey).toLowerCase(), value };
    });
    const codes = parameters.filter(({ key }) => key === "code");
    const states = parameters.filter(({ key }) => key === "state");
    const allowCode = options.allowSignInReturn === true && codes.length === 1 && states.length === 1 &&
      decodeParameter(codes[0].value).trim() !== "" && decodeParameter(states[0].value).trim() !== "";

    let partHasKnown = false;
    for (const { rawKey, key, value } of parameters) {
      const knownKey = matchesInParameter(rawKey) || matchesKnown(key);
      const namedSecret = SECRET_KEY.test(key);
      const knownValue = matchesInParameter(value);
      const safeKey = !knownKey && /^[\w.-]+$/.test(key) ? key : null;
      if (knownKey || knownValue) {
        reportKnown(part, safeKey);
        partHasKnown = true;
      } else if (namedSecret && !(key === "code" && allowCode)) {
        problems.push({ part, key: safeKey, reason: "This parameter may carry a secret." });
      }
      if (namedSecret || (key === "state" && codes.length > 0)) {
        maskedValues.add(value);
        maskedValues.add(decodeParameter(value));
      }
    }
    // This also covers a canary in the fragment route or across parameter delimiters.
    if (!partHasKnown && matchesInParameter(raw)) reportKnown(part);
  }

  if (url.username || url.password) {
    problems.push({ part: "user-info", key: null, reason: "The address contains user-info." });
    foundKnown = matchesKnown(url.username) || matchesKnown(url.password);
    for (const value of [url.username, url.password]) {
      for (const layer of percentLayers(value)) maskedValues.add(layer);
    }
  }
  if (matchesKnown(url.host)) reportKnown("host");
  if (matchesKnown(url.pathname)) reportKnown("path");
  checkParameters("query", url.search.slice(1));
  checkParameters("fragment", url.hash.slice(1));
  // URL parsing can discard text, such as a path segment before '..'.
  const rawOnlyMatch = !foundKnown && matchesKnown(address);
  if (rawOnlyMatch) reportKnown("address");

  let safeAddress = url.href;
  if (problems.length > 0 || maskedValues.size > 0) {
    // A value found in one part can also appear in the origin or a reported key.
    const matchesMasked = secretMatcher(maskedValues);
    for (const problem of problems) {
      if (problem.key !== null && matchesMasked(problem.key)) problem.key = null;
    }
    const { origin } = url;
    safeAddress = rawOnlyMatch || origin === "null" || matchesKnown(origin) || matchesMasked(origin)
      ? MASK
      : `${origin}/${MASK}`;
  }
  return { verdict: problems.length > 0 ? "refuse" : "go", problems, safeAddress };
}
