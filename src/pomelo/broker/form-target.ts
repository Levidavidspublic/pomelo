export function checkFormTarget(form: {
  pageUrl: string;
  method: string;
  action: string;
  hasSecretField: boolean;
}): { decision: "fill" | "hold" | "refuse"; reason: string } {
  let page: URL;
  try {
    page = new URL(form.pageUrl);
  } catch {
    return { decision: "refuse", reason: "The page address is invalid." };
  }

  let action: URL;
  try {
    action = form.action === "" ? page : new URL(form.action, page);
  } catch {
    return { decision: "refuse", reason: "The form action address is invalid." };
  }

  const method = form.method.toLowerCase() || "get";
  if (method === "get" && form.hasSecretField) {
    return { decision: "refuse", reason: "This GET form would put secret fields in the address." };
  }
  if (["javascript:", "data:", "file:", "mailto:"].includes(action.protocol)) {
    return { decision: "refuse", reason: "The form action uses a blocked URL scheme." };
  }
  if (action.protocol === "http:" && action.hostname !== "localhost" && action.hostname !== "127.0.0.1") {
    return { decision: "refuse", reason: "The form action uses unencrypted HTTP outside localhost or 127.0.0.1." };
  }
  if (action.origin !== page.origin) {
    return {
      decision: "hold",
      reason: `The form on ${page.hostname || "a page without a host"} targets a different origin on ${action.hostname || "a URL without a host"}.`,
    };
  }
  if (method === "dialog") {
    return { decision: "hold", reason: "The form uses the dialog method and needs review." };
  }
  return { decision: "fill", reason: "The form action and method allow filling." };
}
