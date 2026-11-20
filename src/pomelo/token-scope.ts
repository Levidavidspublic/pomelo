export type TokenScopeVerdict = "go" | "stop" | "unreadable";

export interface TokenScopeOptions {
  allowedAccounts: readonly string[];
  neededScopes?: readonly string[];
  /** A rule ending in a colon matches every scope with that prefix. */
  tooWideScopes?: readonly string[];
}

export interface TokenScopeResult {
  verdict: TokenScopeVerdict;
  problems: string[];
}

interface AccountStatus {
  name: string;
  loggedIn: boolean;
  active?: boolean | null;
  scopes?: string | null;
}

const defaultNeededScopes = ["repo"];
const defaultTooWideScopes = ["workflow", "delete_repo", "admin:", "write:packages", "delete:packages"];
// Only recognized GitHub scope names may appear in diagnostics.
const knownScopes = new Set([
  "repo", "repo:status", "repo_deployment", "public_repo", "repo:invite", "security_events",
  "workflow", "delete_repo", "read:packages", "write:packages", "delete:packages",
  "admin:org", "write:org", "read:org", "manage_runners:org",
  "admin:public_key", "write:public_key", "read:public_key",
  "admin:repo_hook", "write:repo_hook", "read:repo_hook", "admin:org_hook",
  "gist", "notifications", "user", "read:user", "user:email", "user:follow",
  "write:discussion", "read:discussion",
  "admin:enterprise", "manage_runners:enterprise", "manage_billing:enterprise", "read:enterprise", "scim:enterprise",
  "audit_log", "read:audit_log", "codespace", "codespace:secrets", "copilot", "manage_billing:copilot",
  "write:network_configurations", "read:network_configurations", "project", "read:project",
  "admin:gpg_key", "write:gpg_key", "read:gpg_key",
  "admin:ssh_signing_key", "write:ssh_signing_key", "read:ssh_signing_key",
]);
const loginLine = /^(?:[✓✔✗✘x]\s+)?(Logged in to|Failed to log in to) \S+ (?:account|as) (\S+)(?:\s+\(.+\))?$/i;
const noLoginLine = /^(?:You are )?(?:not logged in\b|not logged into\b|no accounts\b)/i;
const hostLine = /^[\w-]+(?:\.[\w-]+)+$/;
const maskedToken = /^(?:(?:gh[opusr]|github_pat)_)?\*+$/;
const scopeName = /^[a-z][a-z0-9_-]*(?::[a-z][a-z0-9_-]*)*$/;
const tokenShape = /(?:gh[opusr]|github_pat)_[a-z0-9_]+|[a-f0-9]{40}/i;

function readScopes(value: string | null | undefined): Set<string> | null {
  if (!value) return null;

  const scopes = new Set<string>();
  for (const field of value.split(",")) {
    const scope = field.trim().replace(/^(['"])(.*)\1$/, "$2");
    if (!scopeName.test(scope)) return null;
    scopes.add(scope);
  }
  return scopes;
}

/** Check supplied GitHub CLI status text for the active account's token scopes. */
export function checkTokenScopes(statusText: unknown, opts: TokenScopeOptions): TokenScopeResult {
  const unreadable: TokenScopeResult = { verdict: "unreadable", problems: ["could not read auth status"] };
  if (typeof statusText !== "string") return unreadable;

  const accounts: AccountStatus[] = [];
  let account: AccountStatus | undefined;
  let noLogin = false;
  for (const rawLine of statusText.split(/\r?\n/)) {
    const line = rawLine.replace(/\x1b\[[\d;]*m/g, "").trim();
    const field = line.replace(/^-\s*/, "");
    const token = /^Token:\s*(.+)$/i.exec(field)?.[1];
    if (tokenShape.test(line) || (token && !maskedToken.test(token))) {
      return { verdict: "stop", problems: ["token shown"] };
    }

    const login = loginLine.exec(line);
    if (login) {
      account = { name: login[2], loggedIn: /^Logged/i.test(login[1]) };
      accounts.push(account);
    } else if (noLoginLine.test(line)) {
      account = undefined;
      noLogin = true;
    } else if (hostLine.test(line)) {
      account = undefined;
    } else if (account) {
      const active = /^Active account:\s*(.*)$/i.exec(field)?.[1];
      if (active !== undefined) {
        account.active = account.active === undefined && /^(true|false)$/.test(active) ? active === "true" : null;
      }
      const scopes = /^Token scopes:\s*(.*)$/i.exec(field)?.[1];
      if (scopes !== undefined) account.scopes = account.scopes === undefined ? scopes : null;
    }
  }

  if (noLogin) return { verdict: "stop", problems: ["not logged in"] };
  if (accounts.length === 0 || accounts.some(({ active }) => active === null)) return unreadable;
  // Older gh versions omit the active flag when reporting a single account.
  if (accounts.length > 1 && accounts.some(({ active }) => active === undefined)) return unreadable;

  const activeAccounts = accounts.filter(({ active }) => active === true || active === undefined);
  if (activeAccounts.length > 1) return { verdict: "stop", problems: ["multiple active accounts"] };
  const activeAccount = activeAccounts[0];
  if (!activeAccount?.loggedIn) return { verdict: "stop", problems: ["not logged in"] };

  const problems: string[] = [];
  if (!opts.allowedAccounts.includes(activeAccount.name)) problems.push("active account is not allowed");

  const scopes = readScopes(activeAccount.scopes);
  if (scopes === null) {
    problems.push("unknown scopes");
  } else {
    const neededScopes = new Set(opts.neededScopes ?? defaultNeededScopes);
    for (const scope of neededScopes) {
      if (!knownScopes.has(scope)) problems.push("invalid required scope");
      else if (!scopes.has(scope)) problems.push(`missing scope: ${scope}`);
    }

    const tooWideScopes = opts.tooWideScopes ?? defaultTooWideScopes;
    let hasUnknownScope = false;
    for (const scope of scopes) {
      const rule = tooWideScopes.find((rule) => rule.endsWith(":") ? scope.startsWith(rule) : scope === rule);
      const isKnown = knownScopes.has(scope);
      if (!isKnown) hasUnknownScope = true;
      if (rule !== undefined) {
        const label = isKnown ? scope : rule === "admin:" ? "admin:" : "unrecognized name";
        problems.push(`scope too wide: ${label}`);
      }
    }
    if (hasUnknownScope) problems.push("unknown scopes");
  }

  return { verdict: problems.length === 0 ? "go" : "stop", problems };
}
