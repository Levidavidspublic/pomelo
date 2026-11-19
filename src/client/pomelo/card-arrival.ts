export type CardArrival =
  | { state: "placeholder"; label: string }
  | { state: "ready"; kind: string; args: Record<string, unknown> }
  | { state: "fallback"; text: string };

const placeholderLabels = new Map<string, string>([
  ["chart", "Chart on its way"],
  ["diagram", "Diagram on its way"],
  ["artifact", "Artifact on its way"],
  ["image", "Image on its way"],
  ["widget", "Widget on its way"],
]);

export function cardArrival({ kind, argsText, ended, failed }: {
  kind?: string;
  argsText: string;
  ended: boolean;
  failed?: boolean;
}): CardArrival {
  const label = placeholderLabels.get(kind ?? "");
  if (!ended) return { state: "placeholder", label: label ?? "Card on its way" };
  if (failed) return { state: "fallback", text: "Card could not load." };
  if (kind === undefined || label === undefined) return { state: "fallback", text: "Unknown card type." };

  try {
    const args: unknown = JSON.parse(argsText);
    if (typeof args === "object" && args !== null && !Array.isArray(args)) {
      return { state: "ready", kind, args: args as Record<string, unknown> };
    }
  } catch {
    // Parse errors may include raw arguments. Keep the fallback text fixed.
  }
  return { state: "fallback", text: "Card data is invalid." };
}
