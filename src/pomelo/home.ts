import path from "node:path";

export function pomeloHome(env: NodeJS.ProcessEnv, homedir: string): string {
  return env.FRIDAY_HOME ?? path.join(homedir, ".pomelo");
}

export function pomeloPort(env: NodeJS.ProcessEnv): string {
  return env.PORT ?? "4322";
}

export function applyPomeloDefaults(env: NodeJS.ProcessEnv, homedir: string): void {
  env.FRIDAY_HOME ??= pomeloHome(env, homedir);
  env.PORT ??= pomeloPort(env);
}
