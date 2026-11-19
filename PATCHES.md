# Friday patch ledger

This ledger records Pomelo's hooks into Friday so each change can be reviewed when rebasing onto a new Friday release.

## Rebase rules

1. New code lives in `src/pomelo/**` and `src/client/pomelo/**`.
2. Edits to Friday files are small hooks, each listed in `PATCHES.md` with the reason.
3. A weekly job rebases onto upstream's newest tag in a branch and opens a PR. It never pushes to main.

| File | Hook | Reason | Ticket |
| --- | --- | --- | --- |
| `src/agent-mesh.ts` | Added the nullable `pomelo` field and hooks in `listingFor` and `callOne` (7 lines). | Pomelo thread tools reach the mesh without forking Friday's dispatch switch. | #17 |
| `src/app.ts` | Enrich `GET /api/sessions/mine` rows with Pomelo thread metadata and attach the Pomelo mesh hook at startup. | The rail and Home need project tags and latest activity in the session list they already fetch. Agents can open threads, add sub-agent lanes and tag projects through the live mesh. | #113, #301 |
| `src/client/App.tsx` | Pass session-list replies to the Pomelo thread metadata store (2 lines). | The rail can read thread metadata from the session list App already fetches. | #263 |
