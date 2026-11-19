export type PanelState = {
  open: { artifactId: string; version: number; pinned: boolean } | null;
};

export type PanelAction =
  | { type: "open"; artifactId: string; version: number; latest: number }
  | { type: "pick"; version: number; latest: number }
  | { type: "newVersion"; artifactId: string; version: number }
  | { type: "close" };

function validVersion(version: number): boolean {
  return Number.isInteger(version) && version >= 1;
}

export function panelReduce(state: PanelState, action: PanelAction): PanelState {
  const current = state.open;

  switch (action.type) {
    case "open": {
      const { artifactId, version, latest } = action;
      if (!artifactId || !validVersion(version) || !validVersion(latest)) return state;
      return { open: { artifactId, version, pinned: version < latest } };
    }
    case "pick": {
      const { version, latest } = action;
      if (!current || !validVersion(version) || !validVersion(latest)) return state;
      return { open: { ...current, version, pinned: version < latest } };
    }
    case "newVersion": {
      const { artifactId, version } = action;
      if (!current || !artifactId || artifactId !== current.artifactId || current.pinned) return state;
      if (!validVersion(version) || version <= current.version) return state;
      return { open: { ...current, version } };
    }
    case "close":
      return current ? { open: null } : state;
  }
}
