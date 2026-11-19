interface SwitchProfile {
  id: string;
  name: string;
  location: "local" | "cloud";
}

interface SwitchJob {
  profileId: string;
  state: string;
}

interface ProfileOption {
  id: string;
  label: string;
  vps: boolean;
  current: boolean;
  disabled: boolean;
  reason: string | null;
}

export function profileSwitch({
  profiles,
  jobs,
  currentProfileId,
  cloudReachable,
}: {
  profiles: readonly SwitchProfile[];
  jobs: readonly SwitchJob[];
  currentProfileId: string | null;
  cloudReachable: boolean;
}): { options: ProfileOption[]; canSwitch: boolean; emptyLine: string | null } {
  const heldProfileIds = new Set(
    jobs.filter(({ state }) => state === "running" || state === "waiting").map(({ profileId }) => profileId),
  );
  const currentProfileRunning = jobs.some(
    ({ profileId, state }) => profileId === currentProfileId && state === "running",
  );

  const options = profiles.map(({ id, name, location }): ProfileOption => {
    const vps = location === "cloud";
    const current = id === currentProfileId;
    let reason: string | null = null;
    if (heldProfileIds.has(id)) {
      reason = "A job is running on this profile";
    } else if (vps && !cloudReachable) {
      reason = "VPS not reachable";
    } else if (!current && currentProfileRunning) {
      reason = "A job is running on the current profile";
    }

    return { id, label: name, vps, current, disabled: reason !== null, reason };
  });

  options.sort((a, b) =>
    Number(b.current) - Number(a.current) || Number(a.vps) - Number(b.vps) || a.label.localeCompare(b.label),
  );

  return {
    options,
    canSwitch: options.some(({ current, disabled }) => !current && !disabled),
    emptyLine: options.length === 0 ? "Add a browser profile in Settings." : null,
  };
}
