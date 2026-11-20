import { createHash } from "node:crypto";

export const CARD_KINDS = Object.freeze(["diagram", "artifact", "image", "chart", "widget"] as const);
export type CardKind = (typeof CARD_KINDS)[number];
export type CardIdInput = { readonly kind: string; readonly id?: string };
type AssignedCard = { kind: CardKind; id: string };
export type AssignCardIdsResult = { ok: true; cards: readonly AssignedCard[] } | { ok: false; reason: string };

const SAFE_ID = /^[a-z0-9_-]{1,40}$/;

/** Assign IDs in reply order so appending cards preserves the IDs already assigned. */
export function assignCardIds(threadId: string, messageId: string, cards: readonly CardIdInput[]): AssignCardIdsResult {
  if (typeof threadId !== "string" || !threadId.trim()) return { ok: false, reason: "Give the reply a thread ID." };
  if (typeof messageId !== "string" || !messageId.trim()) return { ok: false, reason: "Give the reply a message ID." };

  const assigned: AssignedCard[] = [];
  const usedIds = new Set<string>();
  const positions = new Map<CardKind, number>();
  for (const card of cards) {
    const kind = CARD_KINDS.find((entry) => entry === card?.kind);
    if (!kind) return { ok: false, reason: `Choose a card kind from ${CARD_KINDS.join(", ")}.` };

    const position = positions.get(kind) ?? 0;
    positions.set(kind, position + 1);

    let id = card.id;
    if (typeof id !== "string" || !SAFE_ID.test(id) || usedIds.has(id)) {
      const base = createHash("sha256").update(JSON.stringify([threadId, messageId, kind, position])).digest("hex").slice(0, 32);
      id = base;
      // The first card keeps its ID. A base-36 suffix fits in seven characters for any array length.
      for (let suffix = 1; usedIds.has(id); suffix++) id = `${base}-${suffix.toString(36)}`;
    }

    usedIds.add(id);
    assigned.push({ kind, id });
  }

  return { ok: true, cards: assigned };
}
