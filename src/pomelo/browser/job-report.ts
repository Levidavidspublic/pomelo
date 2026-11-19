import { hideSecrets } from "../../secrets.js";
import type { BrowserJob, BrowserProfile } from "../browser-records.js";

type JobReport = {
  threadId: string;
  laneId: string;
  jobId: string;
  kind: "browser_job_result";
  status: "done" | "failed" | "cancelled";
  where: "VPS" | "This PC";
  headline: string;
  lastStep: string;
  body: string;
  cut: boolean;
  stepCount: number;
  at: number;
};

const JOB_REPORT_LIMIT = 2000;

export function jobReport(
  job: BrowserJob,
  profile: BrowserProfile,
  { endedAt, result }: { endedAt: number; result: string },
): { report: JobReport } | { error: string } {
  const { id: jobId, threadId, laneId, state: status, steps } = job;
  if (status !== "done" && status !== "failed" && status !== "cancelled") {
    return { error: "Browser job must be finished before it can report." };
  }
  if (!threadId?.trim() || !jobId?.trim()) return { error: "Thread id and job id are required." };
  if (profile.id !== job.profileId) return { error: "Profile does not match the browser job." };
  if (!Number.isFinite(endedAt)) return { error: "Browser job end time must be a finite number." };

  const where = profile.location === "cloud" ? "VPS" : "This PC";
  let name = hideSecrets(profile.name).text.replace(/[\r\n\u2028\u2029]+/g, " ").trim();
  if (status !== "done") name = name.replace(/\bdone\b[ \t]*/gi, "").trim();

  const lastStep = hideSecrets(steps.at(-1) ?? "").text;
  const text = hideSecrets(result).text.trim() || "No result text.";
  const characters = [...text];
  const cut = characters.length > JOB_REPORT_LIMIT;
  return {
    report: {
      threadId,
      laneId,
      jobId,
      kind: "browser_job_result",
      status,
      where,
      headline: `${name} · ${where}: ${status}`,
      lastStep,
      body: cut ? characters.slice(0, JOB_REPORT_LIMIT).join("") : text,
      cut,
      stepCount: steps.length,
      at: endedAt,
    },
  };
}
