export interface ProjectPickerTag {
  slug: string;
  name: string;
  colour?: string;
}

/** UTF-16 offsets into the original name, with an exclusive end. */
export interface ProjectPickerMatch {
  start: number;
  end: number;
}

export interface ProjectPickerRow extends ProjectPickerTag {
  ticked: boolean;
  match: ProjectPickerMatch | null;
}

export interface ProjectPickerResult {
  rows: ProjectPickerRow[];
  canCreate: boolean;
  emptyNote?: string;
}

function fold(text: string): string {
  return text.normalize("NFC").toLowerCase().normalize("NFC");
}

function matchInName(name: string, key: string, start: number, end: number): ProjectPickerMatch {
  const trimmed = name.trim();
  const leading = name.length - name.trimStart().length;
  const lowercase = trimmed.toLowerCase();
  if (key === lowercase && trimmed.length === lowercase.length) {
    return { start: leading + start, end: leading + end };
  }

  let originalStart = 0;
  let originalEnd = 0;
  // A prefix can change when a combining character is added. Only use boundaries that survive folding.
  for (const character of trimmed) {
    originalEnd += character.length;
    const prefix = fold(trimmed.slice(0, originalEnd));
    if (!key.startsWith(prefix)) continue;
    if (prefix.length <= start) originalStart = originalEnd;
    if (prefix.length >= end) break;
  }
  return { start: leading + originalStart, end: leading + originalEnd };
}

export function projectPicker(
  tags: readonly Readonly<ProjectPickerTag>[],
  threadTagSlugs: readonly string[],
  query: string,
): ProjectPickerResult {
  const search = fold(query.trim());
  const selected = new Set(threadTagSlugs);
  const rows: ProjectPickerRow[] = [];
  let canCreate = search.length > 0;

  for (const { slug, name, colour } of tags) {
    const key = fold(name.trim());
    if (key === search) canCreate = false;
    const start = key.indexOf(search);
    if (start === -1) continue;

    const ticked = selected.has(slug);
    const match = search ? matchInName(name, key, start, start + search.length) : null;
    const row: ProjectPickerRow = { slug, name, ticked, match };
    if (colour !== undefined) row.colour = colour;
    rows.push(row);
  }

  rows.sort((a, b) => Number(b.ticked) - Number(a.ticked)
    || a.name.trim().localeCompare(b.name.trim(), "en", { sensitivity: "accent" }));

  if (rows.length > 0) return { rows, canCreate };
  return { rows, canCreate, emptyNote: search ? "No projects match." : "No projects yet." };
}

export function toggleProject(threadTagSlugs: readonly string[], slug: string): string[] {
  const slugs = new Set(threadTagSlugs);
  if (!slugs.delete(slug)) slugs.add(slug);
  return [...slugs];
}
