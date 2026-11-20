# Friday patch ledger

This ledger records Pomelo's hooks into Friday so each change can be reviewed when rebasing onto a new Friday release.

## Rebase rules

1. New code lives in `src/pomelo/**` and `src/client/pomelo/**`.
2. Edits to Friday files are small hooks, each listed in `PATCHES.md` with the reason.
3. A weekly job rebases onto upstream's newest tag in a branch and opens a PR. It never pushes to main.

| File | Hook | Reason | Ticket |
| --- | --- | --- | --- |
| `src/agent-mesh.ts` | Added the nullable `pomelo` field and hooks in `listingFor` and `callOne` (7 lines). | Pomelo thread tools reach the mesh without forking Friday's dispatch switch. | #17 |
| `src/app.ts` | Enrich `GET /api/sessions/mine` rows with Pomelo thread metadata. Attach the Pomelo mesh and session activity hooks at startup. | The rail and Home need project tags and latest activity in the session list they already fetch. Agents can open threads, add sub-agent lanes and tag projects through the live mesh. Published messages and replies advance thread activity for rail ordering. | #113, #301, #637 |
| `src/client/App.tsx` | Pass session-list replies to the Pomelo thread metadata store (2 lines). | The rail can read thread metadata from the session list App already fetches. | #263 |
| `src/client/Sidebar.tsx` | Subscribe to thread metadata and mount PomeloRail above the session list when a listed session has a project tag. | Show project groups in the app and open their rows through Friday's session handler. | #712 |
| `src/client/SessionView.tsx` | Subscribe to thread metadata and mount the project chips and thread origin beside the title for tagged or agent-opened sessions. | Show the open thread's projects and origin, and open its parent through Friday's session handler. | #854 |
| `src/local/start.ts` | Apply Pomelo defaults at the start of `startLocal`, before it resolves the data folder and port. | Pomelo defaults to `~/.pomelo` and port `4322` so its local server can run beside Friday. | #674 |
| `src/runner/tool-limits.ts` | Resolve `tool-limits.json` under `FRIDAY_HOME`, falling back to `~/.friday` when unset or empty. | Pomelo keeps its cached tool limits in its own data folder when installed beside Friday. | #802 |
