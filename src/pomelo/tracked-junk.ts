export function junkPaths(paths: readonly string[]): string[] {
  return paths.filter((path) => {
    const segments = path.split("/");
    const [root, filename] = segments;

    if (root.startsWith(".pomelo-test.")) return true;
    if (segments.includes("node-compile-cache") || segments.includes("node_modules")) return true;
    if (segments.length === 1) {
      return root === ".env" || root.startsWith(".env.") || root === "data.json";
    }
    return segments.length === 2 && root === "logs" && filename.endsWith(".jsonl");
  });
}
