export type ToolbarKind = "html" | "mermaid" | "chart" | "image";

export type ArtifactToolbar = {
  copy: { enabled: boolean; label: string };
  download: { fileName: string; mime: string };
  openInWindow: { enabled: boolean; sandbox: string | null; features: string };
  versions: { version: number; label: string; current: boolean; latest: boolean }[];
};

const DOWNLOADS: Record<ToolbarKind, { extension: string; mime: string }> = {
  html: { extension: "html", mime: "text/html" },
  mermaid: { extension: "mmd", mime: "text/plain" },
  chart: { extension: "json", mime: "application/json" },
  image: { extension: "png", mime: "image/png" },
};

const MAX_ARRAY_LENGTH = 2 ** 32 - 1;

export function artifactToolbar(input: { kind: ToolbarKind; title: string; version: number; latest: number }): ArtifactToolbar {
  const { kind, title, version, latest } = input;
  const latestVersion = Number.isInteger(latest) && latest >= 1 && latest <= MAX_ARRAY_LENGTH ? latest : 1;
  const currentVersion = Number.isInteger(version) && version >= 1 && version <= latestVersion ? version : latestVersion;

  const cleanTitle = title.replace(/[^\p{L}\p{Nd}]+/gu, "-").replace(/^-|-$/g, "");
  const stem = Array.from(cleanTitle).slice(0, 60).join("") || "artifact";
  const { extension, mime } = DOWNLOADS[kind];

  return {
    copy: { enabled: true, label: kind === "image" ? "Copy image" : "Copy source" },
    download: { fileName: `${stem}-v${currentVersion}.${extension}`, mime },
    openInWindow: {
      enabled: true,
      sandbox: kind === "html" ? "allow-scripts" : null,
      features: "noopener,noreferrer",
    },
    versions: Array.from({ length: latestVersion }, (_, index) => {
      const version = latestVersion - index;
      return { version, label: `v${version}`, current: version === currentVersion, latest: index === 0 };
    }),
  };
}
