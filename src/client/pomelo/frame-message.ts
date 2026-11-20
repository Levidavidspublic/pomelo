const HEIGHT_MESSAGE = "pomelo:artifact:height";
const HEIGHT_FIELDS = new Set(["type", "token", "height"]);
const DEFAULT_MIN_HEIGHT = 80;
const DEFAULT_MAX_HEIGHT = 4000;

type FrameMessageResult = { action: "resize"; height: number } | { action: "ignore"; reason: string };

function ignore(reason: string): FrameMessageResult {
  return { action: "ignore", reason };
}

export function readFrameMessage(
  event: { origin: string; fromOwnFrame: boolean; data: unknown },
  expectedToken: string,
  limits?: { minHeight?: number; maxHeight?: number },
): FrameMessageResult {
  try {
    if (event.origin !== "null") return ignore("Unexpected frame origin.");
    if (event.fromOwnFrame !== true) return ignore("Message came from a different frame.");

    const { data } = event;
    if (data === null || typeof data !== "object" || Array.isArray(data)) {
      return ignore("Expected a plain message object.");
    }
    const prototype = Object.getPrototypeOf(data);
    if (prototype !== Object.prototype && prototype !== null) return ignore("Expected a plain message object.");

    // Allow only resize fields, including when an extra key is hidden from Object.keys.
    const keys = Reflect.ownKeys(data);
    if (keys.length > HEIGHT_FIELDS.size || keys.some((key) => typeof key !== "string" || !HEIGHT_FIELDS.has(key))) {
      return ignore("Unexpected message fields.");
    }

    // Read own values without invoking accessors or falling back to inherited fields.
    const type: unknown = Object.getOwnPropertyDescriptor(data, "type")?.value;
    if (type !== HEIGHT_MESSAGE) return ignore("Unsupported message type.");

    const token = Object.getOwnPropertyDescriptor(data, "token");
    if (!token) return ignore("Missing frame token.");
    if (typeof token.value !== "string" || token.value !== expectedToken) return ignore("Incorrect frame token.");

    const height: unknown = Object.getOwnPropertyDescriptor(data, "height")?.value;
    if (typeof height !== "number" || !Number.isFinite(height)) return ignore("Expected a finite numeric height.");

    const { minHeight = DEFAULT_MIN_HEIGHT, maxHeight = DEFAULT_MAX_HEIGHT } = limits ?? {};
    if (!Number.isFinite(minHeight) || !Number.isFinite(maxHeight) || minHeight < 0 || maxHeight < minHeight) {
      return ignore("Invalid height limits.");
    }
    return { action: "resize", height: Math.max(minHeight, Math.min(maxHeight, Math.round(height))) };
  } catch {
    return ignore("Message could not be read.");
  }
}
