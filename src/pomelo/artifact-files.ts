import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm } from "node:fs/promises";
import path from "node:path";
import { ARTIFACT_KINDS, artifactKey, checkBodyRef, type Artifact } from "./artifact.js";

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const extensions: Record<Artifact["kind"], string> = {
  html: "html",
  mermaid: "mmd",
  chart: "json",
  image: "bin",
};

export function artifactDir(home: string): string {
  return path.resolve(home, "artifacts");
}

function resolveBodyPath(dir: string, bodyRef: string): string | null {
  if (!checkBodyRef(bodyRef)) return null;
  const file = path.resolve(dir, bodyRef);
  return file.startsWith(dir + path.sep) ? file : null;
}

export async function writeArtifactBody(
  home: string,
  { id, version, kind }: Pick<Artifact, "id" | "version" | "kind">,
  body: string | Uint8Array,
): Promise<string> {
  artifactKey(id);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid artifact version");
  if (!ARTIFACT_KINDS.includes(kind)) throw new Error("Invalid artifact kind");
  const bytes = typeof body === "string" ? Buffer.byteLength(body) : body.byteLength;
  if (bytes > MAX_BODY_BYTES) throw new Error("Artifact body exceeds 5 MB");

  const dir = artifactDir(home);
  const bodyRef = `${id}.v${version}.${extensions[kind]}`;
  const file = resolveBodyPath(dir, bodyRef);
  if (!file) throw new Error("Invalid artifact bodyRef");

  await mkdir(dir, { recursive: true, mode: 0o700 });
  if (!(await lstat(dir)).isDirectory()) throw new Error("Invalid artifacts directory");

  // Leading ~ keeps temporary files out of the bodyRef namespace.
  const tempPath = path.join(dir, `~${randomUUID()}.tmp`);
  const temp = await open(tempPath, "wx", 0o600);
  try {
    try {
      await temp.writeFile(body);
    } finally {
      await temp.close();
    }
    await rename(tempPath, file);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
  return bodyRef;
}

export async function readArtifactBody(home: string, bodyRef: string): Promise<Buffer | null> {
  const dir = artifactDir(home);
  const file = resolveBodyPath(dir, bodyRef);
  if (!file) return null;

  try {
    const actualDir = artifactDir(await realpath(path.dirname(dir)));
    if (!(await lstat(actualDir)).isDirectory()) return null;
    const actualFile = await realpath(file);
    const actualRef = path.relative(actualDir, actualFile).split(path.sep).join("/");
    if (!resolveBodyPath(actualDir, actualRef)) return null;
    if (!(await lstat(actualFile)).isFile()) return null;
    return await readFile(actualFile);
  } catch (error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === "ENOENT" || code === "ENOTDIR" || code === "ELOOP") return null;
    throw error;
  }
}
