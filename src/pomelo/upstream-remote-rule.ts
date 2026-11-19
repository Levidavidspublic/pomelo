type Direction = "fetch" | "push";
type RemoteAddresses = Record<Direction, Set<string>>;

export type UpstreamRemoteOptions = {
  upstreamRepo?: string;
  originRepo?: string;
};

type RemoteProblem = { code: string; remote: string; message: string };
const disabledPushAddress = /^(?:no_push|disabled)$/i;

function normalizeRepo(repo: string): string {
  return repo.toLowerCase().replace(/\.git$/, "");
}

function repoFromPath(path: string): string | undefined {
  const match = /^\/?([\w.-]+\/[\w.-]+)\/?$/.exec(path);
  return match ? normalizeRepo(match[1]) : undefined;
}

function readAddress(address: string, expectedRepos: ReadonlySet<string>): { repo?: string; display: string } {
  // Echo only recognized repository paths. An unexpected path can itself carry a credential.
  function displayPath(path: string, repo: string | undefined): string {
    if (repo && expectedRepos.has(repo)) return path;
    return path.startsWith("/") ? "/***" : "***";
  }

  if (disabledPushAddress.test(address)) return { display: address };

  const scheme = /^(?:git\+)?(?:https?|ssh|git):\/\//i.exec(address)?.[0];
  if (scheme) {
    const url = URL.parse(address.replace(/^git\+/i, ""));
    if (!url?.hostname) return { display: "***" };
    const repo = repoFromPath(url.pathname);
    const userinfo = url.username || url.password ? "***@" : "";
    const query = url.search ? "?***" : "";
    const fragment = url.hash ? "#***" : "";
    return { repo, display: `${scheme}${userinfo}${url.host}${displayPath(url.pathname, repo)}${query}${fragment}` };
  }

  // Git also accepts SCP-style SSH addresses, such as git@github.com:owner/repo.
  const ssh = /^([^@/:?#\s]+@)?(\[[\da-f:]+\]|[\w.-]+):(\/?[^?#\s]+)([?#].*)?$/i.exec(address);
  if (ssh && !/^[a-z]:/i.test(address)) {
    const [, userinfo, host, path, suffix] = ssh;
    const repo = suffix ? undefined : repoFromPath(path);
    const maskedSuffix = suffix ? `${suffix[0]}***` : "";
    return { repo, display: `${userinfo ? "***@" : ""}${host}:${displayPath(path, repo)}${maskedSuffix}` };
  }

  return { display: "***" };
}

export function checkUpstreamRemote(text: string, opts: UpstreamRemoteOptions = {}): {
  ok: boolean;
  problems: RemoteProblem[];
} {
  const upstreamRepo = normalizeRepo(opts.upstreamRepo ?? "splashxmoon/friday");
  const originRepo = normalizeRepo(opts.originRepo ?? "Division6066/pomelo");
  const expectedRepos = new Set([upstreamRepo, originRepo]);
  const remotes = new Map<string, RemoteAddresses>();
  const problems: RemoteProblem[] = [];

  for (const line of text.split(/\r?\n/)) {
    const match = /^(\S+)[ \t]+(.+?)[ \t]+\((fetch|push)\)$/.exec(line.trim());
    if (!match) continue;
    const [, remote, address, direction] = match;
    let addresses = remotes.get(remote);
    if (!addresses) {
      addresses = { fetch: new Set(), push: new Set() };
      remotes.set(remote, addresses);
    }
    addresses[direction as Direction].add(address);
  }

  for (const [remote, addresses] of remotes) {
    for (const direction of ["fetch", "push"] as const) {
      if (addresses[direction].size > 1) {
        const listed = [...addresses[direction]].map(address => readAddress(address, expectedRepos).display).join(", ");
        problems.push({ code: "conflicting-addresses", remote, message: `The remote has different ${direction} addresses (${listed}).` });
      }
    }
  }

  const upstream = remotes.get("upstream");
  if (!upstream) {
    problems.push({ code: "missing-upstream", remote: "upstream", message: "The upstream remote is missing." });
  } else {
    checkRepo("upstream", "fetch", upstream.fetch, upstreamRepo, "wrong-upstream-fetch");
    if (upstream.push.size === 0) {
      problems.push({ code: "upstream-push-enabled", remote: "upstream", message: "The upstream push address must be set to no_push or DISABLED." });
    }
    for (const address of upstream.push) {
      if (disabledPushAddress.test(address)) continue;
      const { display } = readAddress(address, expectedRepos);
      problems.push({ code: "upstream-push-enabled", remote: "upstream", message: `Replace the upstream push address (${display}) with no_push or DISABLED.` });
    }
  }

  const origin = remotes.get("origin");
  if (!origin) {
    problems.push({ code: "missing-origin", remote: "origin", message: "The origin remote is missing." });
  } else {
    checkRepo("origin", "fetch", origin.fetch, originRepo, "wrong-origin");
    checkRepo("origin", "push", origin.push, originRepo, "wrong-origin");
  }

  return { ok: problems.length === 0, problems };

  function checkRepo(remote: string, direction: Direction, addresses: Set<string>, expectedRepo: string, code: string) {
    if (addresses.size === 0) {
      problems.push({ code, remote, message: `The ${remote} ${direction} address is missing.` });
    }
    for (const address of addresses) {
      const { repo, display } = readAddress(address, expectedRepos);
      if (repo !== expectedRepo) {
        problems.push({ code, remote, message: `The ${remote} ${direction} address (${display}) must point to ${expectedRepo}.` });
      }
    }
  }
}
