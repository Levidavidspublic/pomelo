export interface PageSecurityFacts {
  url: string;
  errorText?: string;
  securityState?: "secure" | "insecure" | "unknown";
  certIssues?: readonly string[];
  isInterstitial: boolean;
  hasMixedActiveContent: boolean;
}

export type CertStopAction = "read" | "click" | "fill" | "import";

export interface CertStopResult {
  verdict: "go" | "hold" | "refuse";
  reason: string;
  card?: "certificate";
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const CERTIFICATE_ERRORS = [
  /\b(?:ERR_CERT_\w+|ERR_(?:SSL|TLS)_\w*CERT\w*)\b/i,
  /\b(?:SEC|MOZILLA_PKIX)_ERROR_\w*(?:CERT|ISSUER)\w*\b/i,
  /\b(?:CERT_\w+|\w*SELF_SIGNED_CERT\w*|UNABLE_TO_(?:GET_ISSUER_CERT\w*|VERIFY_LEAF_SIGNATURE))\b/i,
  /\b(?:certificate|self[- ]signed|unknown[- ]issuer|wrong[- ]host)\b|^(?:expired|revoked)$/i,
];

/** Decides from facts about the loaded page before the runner attempts an action. */
export function certStop(facts: PageSecurityFacts, action: CertStopAction): CertStopResult {
  let url: URL;
  try {
    url = new URL(facts.url);
  } catch {
    return { verdict: "refuse", reason: "The page address is invalid." };
  }

  const { hostname, protocol } = url;
  const site = hostname || "this page";
  const sendsSecrets = action === "fill" || action === "import";
  // Browser errors can include the destination URL alongside the diagnostic.
  const diagnostic = facts.errorText?.replace(/https?:\/\/\S+/gi, "").trim() ?? "";
  if (facts.isInterstitial || facts.certIssues?.length || CERTIFICATE_ERRORS.some((pattern) => pattern.test(diagnostic))) {
    const problem = facts.isInterstitial ? "browser security warning" : "certificate problem";
    return sendsSecrets
      ? { verdict: "refuse", reason: `A ${problem} blocks sending secrets to ${site}.` }
      : { verdict: "hold", reason: `A ${problem} on ${site} needs Amit's review.`, card: "certificate" };
  }

  if (protocol === "http:") {
    if (sendsSecrets) return { verdict: "refuse", reason: `The connection to ${hostname} uses plain HTTP.` };
    if (LOOPBACK_HOSTS.has(hostname)) return { verdict: "go", reason: `The page on ${hostname} is local.` };
    return { verdict: "hold", reason: `The plain HTTP connection to ${hostname} needs Amit's review.` };
  }

  if (protocol !== "https:") {
    return { verdict: "refuse", reason: `The address for ${site} uses an unsupported protocol.` };
  }

  if (sendsSecrets) {
    if (facts.securityState !== "secure") {
      return { verdict: "refuse", reason: `The browser has no confirmed secure connection to ${hostname}.` };
    }
    if (facts.hasMixedActiveContent) {
      return { verdict: "hold", reason: `The page on ${hostname} loads scripts or frames over plain HTTP.` };
    }
  }

  return { verdict: "go", reason: `The action can continue on ${hostname}.` };
}
