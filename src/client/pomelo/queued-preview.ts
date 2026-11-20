export interface QueuedMessage<Attachment = unknown> {
  /** The caller supplies an id unique within the thread. */
  readonly id: string;
  readonly text: string;
  readonly attachments?: readonly Attachment[];
}

export interface QueuedPreviewState<Attachment = unknown> {
  readonly queues: Readonly<Partial<Record<string, readonly QueuedMessage<Attachment>[]>>>;
}

interface PreviewRow {
  id: string;
  text: string;
  direction: "rtl" | "ltr";
  attachmentCount: number;
  label: string;
}

type AddResult<Attachment> =
  | { state: QueuedPreviewState<Attachment>; ok: true }
  | { state: QueuedPreviewState<Attachment>; ok: false; reason: string };

const MAX_QUEUE_LENGTH = 5;
const MAX_PREVIEW_LENGTH = 80;
const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : undefined;

function queueFor<Attachment>(state: QueuedPreviewState<Attachment>, threadId: string): readonly QueuedMessage<Attachment>[] {
  return (Object.hasOwn(state.queues, threadId) ? state.queues[threadId] : undefined) ?? [];
}

function withQueue<Attachment>(
  state: QueuedPreviewState<Attachment>,
  threadId: string,
  queue: readonly QueuedMessage<Attachment>[],
): QueuedPreviewState<Attachment> {
  const queues = { ...state.queues, [threadId]: queue };
  if (queue.length === 0) delete queues[threadId];
  return { queues };
}

export function addQueued<Attachment>(
  state: QueuedPreviewState<Attachment>,
  threadId: string,
  message: QueuedMessage<Attachment>,
): AddResult<Attachment> {
  const text = message.text.trim();
  if (!text) return { state: { ...state }, ok: false, reason: "Enter a message before adding it to the queue." };

  const queue = queueFor(state, threadId);
  if (queue.length >= MAX_QUEUE_LENGTH) {
    return { state: { ...state }, ok: false, reason: `This thread already has ${MAX_QUEUE_LENGTH} queued messages.` };
  }

  const queued = { ...message, text };
  if (message.attachments) queued.attachments = [...message.attachments];
  return { state: withQueue(state, threadId, [...queue, queued]), ok: true };
}

export function removeQueued<Attachment>(
  state: QueuedPreviewState<Attachment>,
  threadId: string,
  id: string,
): QueuedPreviewState<Attachment> {
  const queue = queueFor(state, threadId);
  const remaining = queue.filter((message) => message.id !== id);
  return remaining.length === queue.length ? { ...state } : withQueue(state, threadId, remaining);
}

export function replaceQueued<Attachment>(
  state: QueuedPreviewState<Attachment>,
  threadId: string,
  id: string,
  text: string,
): QueuedPreviewState<Attachment> {
  const trimmed = text.trim();
  if (!trimmed) return { ...state };

  const queue = queueFor(state, threadId);
  const index = queue.findIndex((message) => message.id === id);
  if (index === -1) return { ...state };
  return withQueue(state, threadId, queue.map((message, at) => at === index ? { ...message, text: trimmed } : message));
}

export function takeNext<Attachment>(
  state: QueuedPreviewState<Attachment>,
  threadId: string,
): { state: QueuedPreviewState<Attachment>; message: QueuedMessage<Attachment> | undefined } {
  const queue = queueFor(state, threadId);
  const message = queue[0];
  return { state: message ? withQueue(state, threadId, queue.slice(1)) : { ...state }, message };
}

function clipPreview(line: string): string {
  if (line.length <= MAX_PREVIEW_LENGTH) return line;

  let count = 0;
  let end = 0;
  for (const part of segmenter?.segment(line) ?? line) {
    if (count === MAX_PREVIEW_LENGTH) return `${line.slice(0, end)}…`;
    count++;
    if (count < MAX_PREVIEW_LENGTH) end += (typeof part === "string" ? part : part.segment).length;
  }
  return line;
}

export function previewRows(state: QueuedPreviewState, threadId: string): PreviewRow[] {
  const queue = queueFor(state, threadId);
  return queue.map((message, index) => {
    const line = message.text.replace(/\s+/g, " ").trim();
    const firstLetter = line.match(/\p{Letter}/u)?.[0] ?? "";
    return {
      id: message.id,
      text: clipPreview(line),
      direction: /\p{Script=Hebrew}/u.test(firstLetter) ? "rtl" : "ltr",
      attachmentCount: message.attachments?.length ?? 0,
      label: `Queued message ${index + 1} of ${queue.length}`,
    };
  });
}
