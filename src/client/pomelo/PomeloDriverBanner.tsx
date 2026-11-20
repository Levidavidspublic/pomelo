import type { driverBanner } from "./driver-banner.js";
import { textDirection } from "./text-direction.js";

export interface PomeloDriverBannerProps {
  banner: (Omit<NonNullable<ReturnType<typeof driverBanner>>, "text"> & { readonly text: string }) | null;
  onOpenSettings: () => void;
}

export function PomeloDriverBanner({ banner, onOpenSettings }: PomeloDriverBannerProps) {
  if (banner === null) return null;

  return (
    <div
      role="status"
      dir={textDirection(banner.text)}
      className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-card-foreground"
    >
      <p>{banner.text}</p>
      <button
        type="button"
        onClick={onOpenSettings}
        className="cursor-pointer rounded-md bg-secondary px-3 py-1.5 font-medium text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-2 focus-visible:ring-ring"
      >
        Open Settings
      </button>
    </div>
  );
}
