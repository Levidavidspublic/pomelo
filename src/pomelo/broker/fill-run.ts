import type { AuditEvent } from "../audit.js";
import { fillReply, type FillStatus } from "../fill-reply.js";
import type { Grant } from "../grant.js";
import type { SecretRef } from "../secret-ref.js";
import { fillAttemptRule, type FillAttempt } from "./fill-attempts.js";
import { planFill, type FillPart, type MaskedFillField } from "./fill-fields.js";
import { checkFillTarget, type FillTarget } from "./fill-match.js";
import { checkFormTarget } from "./form-target.js";
import { brokerFill } from "./op-read.js";

type FillCredential = Readonly<{ part: FillPart; grant: Grant; ref: SecretRef }>;

export interface FillRunInput {
  /** The first credential identifies the request in the audit entry. */
  credentials: readonly [FillCredential, ...FillCredential[]];
  target: FillTarget & { readonly frameId: string };
  form: Readonly<Pick<Parameters<typeof checkFormTarget>[0], "method" | "action">>;
  fields: readonly MaskedFillField[];
  attempts: readonly FillAttempt[];
  now: number;
  run: Parameters<typeof brokerFill>[0]["run"];
  fillField: (fieldId: string, value: string) => void | Promise<void>;
}

type FillRule = "fillAttemptRule" | "checkFillTarget" | "checkFormTarget" | "planFill" | "brokerFill";
type FillDecision = "filled" | "hold" | "refused";

interface FillRunResult {
  reply: ReturnType<typeof fillReply>;
  audit: AuditEvent;
  outcome: { decision: FillDecision; rule: FillRule; reason: string };
}

const brokerStatus = {
  filled: "filled",
  denied: "denied",
  locked: "locked",
  not_found: "no_ref",
  failed: "failed",
} satisfies Record<Awaited<ReturnType<typeof brokerFill>>["status"], FillStatus>;

export async function runFill(input: FillRunInput): Promise<FillRunResult> {
  let rule: FillRule = "fillAttemptRule";
  const auditMetadata: Pick<AuditEvent, "at" | "origin" | "refId"> = { at: 0 };
  function finish(status: FillStatus, decision: FillDecision, reason?: string): FillRunResult {
    const reply = fillReply({ status });
    return {
      reply,
      audit: {
        ...auditMetadata,
        kind: "fill",
        actor: "broker",
        outcome: status === "filled" ? "ok" : status === "failed" ? "failed" : "refused",
        note: status,
      },
      outcome: { decision, rule, reason: reason ?? reply.text },
    };
  }

  try {
    const { credentials, now } = input;
    const [primary] = credentials;
    auditMetadata.at = Number.isFinite(now) ? now : 0;
    auditMetadata.origin = primary.grant.origin;
    auditMetadata.refId = primary.ref.id;

    for (const { grant, ref } of credentials) {
      const attempt = fillAttemptRule(input.attempts, { origin: grant.origin, refId: ref.id, jobId: grant.jobId }, now);
      if (attempt.decision !== "allow") {
        return finish("denied", attempt.decision === "hold" ? "hold" : "refused", attempt.reason);
      }
    }

    rule = "checkFillTarget";
    const { target } = input;
    for (const { grant } of credentials) {
      const match = checkFillTarget({ origin: grant.origin, frame: grant.frame === "top" ? "top" : "same-origin" }, target);
      if (match.decision !== "allow" || grant.frame !== target.frameId) {
        return finish("wrong_origin", "refused", "The page or frame does not match the grant.");
      }
    }

    rule = "checkFormTarget";
    const { method, action } = input.form;
    // Relative form actions resolve against the document that contains the fields.
    const form = checkFormTarget({ pageUrl: target.frameUrl, method, action, hasSecretField: true });
    if (form.decision !== "fill") {
      return finish("denied", form.decision === "hold" ? "hold" : "refused", "The form does not allow filling.");
    }

    rule = "planFill";
    const byPart = new Map(credentials.map((credential) => [credential.part, credential] as const));
    if (byPart.size !== credentials.length) {
      return finish("denied", "hold", "More than one credential was supplied for a field.");
    }
    const fields = planFill(input.fields, [...byPart.keys()], target.frameId);
    if (fields.decision === "hold") return finish("denied", "hold", fields.reason);

    const placements: { fieldId: string; grant: Grant; ref: SecretRef }[] = [];
    for (const { part, fieldId } of fields.plan) {
      const credential = byPart.get(part);
      if (credential?.ref.field !== fieldId) {
        return finish("denied", "refused", "The planned field does not match the reference.");
      }
      placements.push({ fieldId, grant: credential.grant, ref: credential.ref });
    }

    rule = "brokerFill";
    const { run, fillField } = input;
    const context = { origin: new URL(target.frameUrl).origin, frame: target.frameId, now };
    for (const { fieldId, grant, ref } of placements) {
      const { status } = await brokerFill({ grant, ref, context, run, fill: async (value) => { await fillField(fieldId, value); } });
      if (status !== "filled") return finish(brokerStatus[status], status === "locked" ? "hold" : "refused");
    }
    return finish("filled", "filled");
  } catch {
    return finish("failed", "refused");
  }
}
