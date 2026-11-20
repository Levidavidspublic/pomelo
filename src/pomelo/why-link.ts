const planningFiles = new Set([
  "01-PRD.md",
  "02-TRD.md",
  "03-APP-FLOW.md",
  "04-UI-BRIEF.md",
  "05-BACKEND-SCHEMA.md",
  "06-ROADMAP.md",
]);

export function headingAnchors(markdown: string): string[] {
  const suffixes = new Map<string, number>();
  let fence: string | undefined;
  let paragraph: string[] = [];

  for (const line of markdown.split(/\r\n?|\n/)) {
    if (fence) {
      const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line)?.[1];
      if (closing?.startsWith(fence)) fence = undefined;
      continue;
    }

    const opening = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (opening && (opening[1].startsWith("~") || !opening[2].includes("`"))) {
      fence = opening[1];
      paragraph = [];
      continue;
    }

    const atx = /^ {0,3}#{1,6}(?:[ \t]+|$)(.*)$/.exec(line)?.[1];
    const underline = /^ {0,3}(?:=+|-+)[ \t]*$/.test(line);
    if (atx === undefined && !underline) {
      const text = line.trim();
      if (!text || /^ {0,3}\t|^ {4}/.test(line) || /^(?:[><]|[-+*](?:[ \t]|$)|\d+[.)][ \t])/.test(text)) {
        paragraph = [];
      } else {
        paragraph.push(text);
      }
      continue;
    }

    const heading = atx?.replace(/(?:^|[ \t]+)#+[ \t]*$/, "") ?? paragraph.join(" ");
    paragraph = [];
    if (!heading.trim()) continue;

    const base = heading.trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}_ -]/gu, "").replace(/ /g, "-");
    let suffix = suffixes.get(base) ?? 0;
    let anchor = base;
    while (suffixes.has(anchor)) anchor = `${base}-${++suffix}`;
    suffixes.set(base, suffix);
    suffixes.set(anchor, 0);
  }

  return [...suffixes.keys()];
}

type WhyProblem = { code: string; reason: string; near?: string[] };

export function checkWhyLink(why: string, docs: Record<string, string>): { ok: boolean; problems: WhyProblem[] } {
  const references = why.matchAll(/\[[^\]\r\n]*\]\(([^()\s]+)\)|[^\s`()\[\]<>"',;]+/g);
  const links = Array.from(references, ([token, target]) =>
    /^([^#]+\.md)(?:#(.*))?$/i.exec(target ?? token.replace(/[.!?]+$/, "")),
  )
    .filter((match) => match !== null);

  if (links.length === 0) {
    return { ok: false, problems: [{ code: "why-missing", reason: "The why line needs a planning doc link." }] };
  }
  if (links.length > 1) {
    return { ok: false, problems: [{ code: "more-than-one", reason: "The why line must contain exactly one planning doc link." }] };
  }

  const [, path, fragment] = links[0];
  const file = path.replace(/^(?:\.\/)?(?:docs\/harness\/)?/, "");
  if (!planningFiles.has(file)) {
    return { ok: false, problems: [{ code: "file-unknown", reason: `The file ${path} is outside the six planning docs.` }] };
  }
  if (!Object.hasOwn(docs, file)) {
    return { ok: false, problems: [{ code: "file-unknown", reason: `The file ${file} was not supplied.` }] };
  }
  if (fragment !== undefined) {
    const anchors = headingAnchors(docs[file]);
    let anchor = fragment;
    try {
      anchor = decodeURIComponent(fragment);
    } catch {
      // Report malformed escapes as a missing heading using the original fragment.
    }
    if (!anchors.includes(anchor)) {
      return { ok: false, problems: [{
        code: "heading-missing",
        reason: `The heading #${fragment} is not in ${file}.`,
        near: anchors.slice(0, 5),
      }] };
    }
  }

  return { ok: true, problems: [] };
}
