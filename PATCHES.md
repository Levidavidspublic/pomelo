# Friday patch ledger

This ledger records Pomelo's hooks into Friday so each change can be reviewed when rebasing onto a new Friday release.

## Rebase rules

1. New code lives in `src/pomelo/**` and `src/client/pomelo/**`.
2. Edits to Friday files are small hooks, each listed in `PATCHES.md` with the reason.
3. A weekly job rebases onto upstream's newest tag in a branch and opens a PR. It never pushes to main.

| File | Hook | Reason | Ticket |
| --- | --- | --- | --- |
| `src/agent-mesh.ts` | Added the nullable `pomelo` field and hooks in `listingFor` and `callOne` (7 lines). | Pomelo thread tools reach the mesh without forking Friday's dispatch switch. | #17 |
