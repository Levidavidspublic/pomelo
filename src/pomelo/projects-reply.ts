import type { PomeloStore } from "./store.js";
import type { TagArchiveTag } from "./tag-archive.js";
import { listTags, type ProjectTag } from "./tags.js";
import type { ThreadArchiveRecord } from "./thread-archive.js";
import { threadMetaMap } from "./thread-meta.js";
import { cleanThreadTitle } from "./thread-title.js";

export interface ProjectsReplyRow {
  slug: string;
  name: string;
  colour: string | null;
  threadCount: number;
  putAwayCount: number;
  putAway: boolean;
  lastActivityAt: number;
}

type StoredProjectTag = ProjectTag & Pick<TagArchiveTag, "archivedAt">;

function maskProjectText(text: string): string {
  const { title, reasons } = cleanThreadTitle(text);
  return reasons.includes("secret") ? title : text;
}

function projectRow(slug: string, tag?: StoredProjectTag): ProjectsReplyRow {
  const safeSlug = maskProjectText(slug);
  const name = typeof tag?.label === "string" && tag.label.trim() ? maskProjectText(tag.label) : safeSlug;
  const colour = tag?.colour;
  return {
    slug: safeSlug,
    name,
    colour: typeof colour === "string" && colour.length === 7 && /^#[0-9a-f]{6}$/i.test(colour) ? colour : null,
    threadCount: 0,
    putAwayCount: 0,
    putAway: tag?.archivedAt !== undefined,
    lastActivityAt: 0,
  };
}

/** Build the reply for the future GET /api/pomelo/projects route. */
export async function projectsReply(store: PomeloStore): Promise<{ projects: ProjectsReplyRow[] }> {
  const [tags, threads] = await Promise.all([listTags(store), threadMetaMap(store)]);
  const projects = new Map<string, ProjectsReplyRow>();
  for (const tag of tags) {
    if (typeof tag?.slug === "string" && tag.slug) projects.set(tag.slug, projectRow(tag.slug, tag));
  }

  const records: ThreadArchiveRecord[] = Object.values(threads);
  for (const { projectTags, lastActivityAt, archivedAt } of records) {
    for (const slug of new Set(projectTags)) {
      let project = projects.get(slug);
      if (!project) {
        project = projectRow(slug);
        projects.set(slug, project);
      }
      if (project.threadCount + project.putAwayCount === 0 || lastActivityAt > project.lastActivityAt) {
        project.lastActivityAt = lastActivityAt;
      }
      if (archivedAt === undefined) project.threadCount++;
      else project.putAwayCount++;
    }
  }

  return {
    projects: [...projects.values()].sort((a, b) =>
      b.lastActivityAt - a.lastActivityAt
      || a.name.localeCompare(b.name, "en", { sensitivity: "accent" })
      || (a.slug < b.slug ? -1 : Number(a.slug > b.slug)),
    ),
  };
}
