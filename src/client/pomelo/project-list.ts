export interface ProjectListTag {
  slug: string;
  name: string;
  colour?: string;
  archived?: boolean;
}

export interface ProjectListThread {
  projectTags: readonly string[];
  archived?: boolean;
}

export interface ProjectListAction {
  id: "rename" | "merge" | "put-away" | "bring-back";
  label: string;
  enabled: boolean;
  reason?: string;
}

export interface ProjectListRow extends ProjectListTag {
  dir: "rtl" | "ltr";
  threadCount: number;
  liveThreadCount: number;
  archived: boolean;
  actions: ProjectListAction[];
}

export interface ProjectListResult {
  rows: ProjectListRow[];
  emptyText?: string;
}

type CountedProject = ProjectListTag & Pick<ProjectListRow, "threadCount" | "liveThreadCount">;

export function buildProjectList(
  tags: readonly ProjectListTag[],
  threads: readonly ProjectListThread[],
  query = "",
): ProjectListResult {
  const projects = new Map<string, CountedProject>();
  for (const { slug, name, colour, archived } of tags) {
    const project: CountedProject = { slug, name, archived, threadCount: 0, liveThreadCount: 0 };
    if (colour !== undefined) project.colour = colour;
    projects.set(slug, project);
  }
  for (const thread of threads) {
    for (const slug of new Set(thread.projectTags)) {
      let project = projects.get(slug);
      if (!project) {
        project = { slug, name: slug, threadCount: 0, liveThreadCount: 0 };
        projects.set(slug, project);
      }
      project.threadCount++;
      if (!thread.archived) project.liveThreadCount++;
    }
  }

  const rows: ProjectListRow[] = [];
  if (projects.size === 0) return { rows, emptyText: "No projects yet" };

  let liveProjects = 0;
  for (const project of projects.values()) {
    if (!project.archived) liveProjects++;
  }

  const search = query.trim().toLowerCase();
  for (const project of projects.values()) {
    const { slug, name, archived = false } = project;
    if (!name.toLowerCase().includes(search) && !slug.toLowerCase().includes(search)) continue;

    const firstLetter = name.match(/\p{L}/u)?.[0] ?? "";
    const dir = /\p{Script=Hebrew}/u.test(firstLetter) ? "rtl" : "ltr";
    // A live project cannot merge into itself.
    const canMerge = liveProjects > (archived ? 0 : 1);
    const actions: ProjectListAction[] = [
      { id: "rename", label: "Rename", enabled: true },
      canMerge
        ? { id: "merge", label: "Merge into…", enabled: true }
        : { id: "merge", label: "Merge into…", enabled: false, reason: "There is no other project to merge into" },
      archived
        ? { id: "bring-back", label: "Bring back", enabled: true }
        : { id: "put-away", label: "Put away", enabled: true },
    ];
    rows.push({ ...project, archived, dir, actions });
  }

  rows.sort((a, b) =>
    Number(a.archived) - Number(b.archived)
    || a.name.localeCompare(b.name, "en", { sensitivity: "accent" })
    || (a.slug < b.slug ? -1 : Number(a.slug > b.slug)),
  );
  return rows.length ? { rows } : { rows, emptyText: "No project matches" };
}
