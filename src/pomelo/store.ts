import type { LocalKV } from "../local/kv.js";
import { hideSecretsIn } from "../secrets.js";

export interface PomeloStore {
  get<T = unknown>(key: string): Promise<T | null>;
  /** With `ifMissing`, returns false if the key already exists. */
  set(key: string, value: unknown, condition?: "ifMissing"): Promise<boolean>;
  /** Lists JSON records by their keys relative to this store, in key order. */
  list<T = unknown>(prefix: string): Promise<{ key: string; value: T }[]>;
  appendLog(key: string, entry: unknown): Promise<void>;
}

function encode(value: unknown): string {
  // The replacer sees the actual string values that will be written, including any returned by toJSON.
  const json = JSON.stringify(value, (_key, item: unknown) => typeof item === "string" ? hideSecretsIn(item) : item);
  if (json === undefined) throw new TypeError("PomeloStore requires a JSON value");
  return json;
}

export function pomeloStore(redis: LocalKV["redis"], prefix = ""): PomeloStore {
  const namespace = `pomelo:${prefix}`;
  return {
    async get<T = unknown>(key: string): Promise<T | null> {
      const [raw] = await redis.mget(namespace + key);
      return typeof raw === "string" ? JSON.parse(raw) as T : null;
    },
    async set(key, value, condition) {
      const raw = encode(value);
      const result = condition === "ifMissing"
        ? await redis.set(namespace + key, raw, "NX")
        : await redis.set(namespace + key, raw);
      return result === "OK";
    },
    async list<T = unknown>(keyPrefix: string) {
      const start = namespace + keyPrefix;
      const records = new Map<string, string>();
      let cursor = "0";
      do {
        const [next, keys] = await redis.scan(cursor, "COUNT", 100);
        cursor = next;
        // Redis and the in-memory client differ in how they escape SCAN patterns.
        const matches = keys.filter((key) => key.startsWith(start));
        if (matches.length === 0) continue;
        const values = await redis.mget(...matches);
        for (const [index, key] of matches.entries()) {
          const raw = values[index];
          // Redis returns null for lists here. The in-memory client can return the list itself.
          if (typeof raw === "string") records.set(key, raw);
        }
      } while (cursor !== "0");

      return [...records.keys()].sort().map((key) => ({
        key: key.slice(namespace.length),
        value: JSON.parse(records.get(key)!) as T,
      }));
    },
    async appendLog(key, entry) {
      const logKey = key.endsWith(":events") ? key : `${key}:events`;
      await redis.rpush(namespace + logKey, encode(entry));
    },
  };
}
