type Widget = { label: string } & (
  | { type: "text" | "number" | "toggle" }
  | { type: "select"; options: string[] }
);

type WidgetAnswer =
  | { ok: true; value: string | number | boolean; message: string }
  | { ok: false; error: string };

export function widgetAnswer(widget: Widget, raw: unknown): WidgetAnswer {
  let value: string | number | boolean;

  switch (widget.type) {
    case "text": {
      const text = typeof raw === "string" ? raw.trim() : "";
      if (!text) return { ok: false, error: "Enter some text." };
      value = text.slice(0, 2000).trimEnd();
      break;
    }
    case "number": {
      const number = typeof raw === "string" && raw.trim() ? Number(raw) : raw;
      if (typeof number !== "number" || !Number.isFinite(number)) {
        return { ok: false, error: "Enter a finite number." };
      }
      value = number;
      break;
    }
    case "toggle":
      if (typeof raw !== "boolean") return { ok: false, error: "Choose yes or no." };
      value = raw;
      break;
    case "select":
      if (typeof raw !== "string" || !widget.options.includes(raw)) {
        return { ok: false, error: "Choose one of the listed options." };
      }
      value = raw;
      break;
  }

  const displayed = typeof value === "boolean" ? (value ? "yes" : "no") : value;
  const message = `${widget.label}: ${displayed}`.replace(/[\r\n\u2028\u2029]+/g, " ");
  return { ok: true, value, message };
}

export function widgetState({ sent, acknowledged, error }: {
  sent: boolean;
  acknowledged: boolean;
  error?: string;
}): "idle" | "sending" | "sent" | "error" {
  if (error !== undefined) return "error";
  if (acknowledged) return "sent";
  return sent ? "sending" : "idle";
}
