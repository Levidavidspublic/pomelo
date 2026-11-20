type Machine = "pc" | "vps";

interface ProfileVersion {
  profileId: string;
  lastWrittenBy?: string;
  home: Machine;
}

interface RunnerVersion {
  version: string;
  where: Machine;
}

interface BrowserVersionResult {
  verdict: "open" | "hold" | "refuse";
  reason: string;
  card?: { title: string; body: string };
}

const machineName = { pc: "PC", vps: "VPS" } as const;

function parseVersion(version: string): bigint[] | undefined {
  if (typeof version !== "string" || !/^\d+(?:\.\d+){3}$/.test(version)) return undefined;
  return version.split(".").map(BigInt);
}

function compareVersions(lastWrittenBy: string | undefined, runner: RunnerVersion): BrowserVersionResult {
  const runnerVersion = parseVersion(runner.version);
  const profileVersion = lastWrittenBy === undefined ? undefined : parseVersion(lastWrittenBy);
  if (!runnerVersion || (lastWrittenBy !== undefined && !profileVersion)) {
    return { verdict: "hold", reason: "The browser version could not be read" };
  }
  if (!profileVersion) {
    return { verdict: "open", reason: "This is a new profile." };
  }

  const [runnerMajor] = runnerVersion;
  const [profileMajor] = profileVersion;
  const difference = runnerMajor - profileMajor;
  if (difference < 0n) {
    return {
      verdict: "refuse",
      reason: `Chromium major ${runnerMajor} can damage a profile last saved by major ${profileMajor}. Update the browser on the ${machineName[runner.where]}.`,
    };
  }
  if (difference === 0n) {
    return { verdict: "open", reason: `The browser and profile use Chromium major ${runnerMajor}.` };
  }
  if (difference <= 3n) {
    return { verdict: "open", reason: `The profile will be upgraded from Chromium major ${profileMajor} to ${runnerMajor}.` };
  }

  const reason = `The profile was last used by a much older browser (Chromium major ${profileMajor}).`;
  return {
    verdict: "hold",
    reason,
    card: {
      title: "Confirm browser profile upgrade",
      body: `${reason} Amit, please confirm the upgrade to Chromium major ${runnerMajor}.`,
    },
  };
}

/** Compare the supplied versions. Profile ownership is checked separately. */
export function checkBrowserVersion(profile: ProfileVersion, runner: RunnerVersion): BrowserVersionResult {
  const result = compareVersions(profile.lastWrittenBy, runner);
  if (profile.home === runner.where) return result;

  const context = `The profile lives on the ${machineName[profile.home]}. The browser would run on the ${machineName[runner.where]}.`;
  return {
    ...result,
    card: {
      title: result.card?.title ?? "Browser version check",
      body: `${context} ${result.card?.body ?? result.reason}`,
    },
  };
}
