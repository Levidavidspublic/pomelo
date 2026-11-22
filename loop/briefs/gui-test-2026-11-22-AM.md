[GUI-TEST] pomelo 2026-11-22

Preview URL: UNKNOWN

Testing stopped before Playwright and before the browser. No preview host was found. The local URL in the README (`http://127.0.0.1:4321`) is not a preview deployment, so it was not opened.

## Where a preview URL was looked for

- `README.md` on `main`: local app only. No Vercel or Railway URL. `docs/ENVIRONMENTS.md` is not on `main`.
- `.github/workflows/`: CI runs `npm run typecheck` and `npm test`. No deploy job.
- Open pull requests, 20 most recently updated: no `vercel.app` or `railway.app` link.
- `main` at `c4620d7cda2ff1f614e444321f4395dc00a01a33`: combined status has no statuses. Check runs: 0.
- Docs on `docs/harness-six-docs-2026-11-19` and `docs/pomelo-specification`: no live preview URL. The PRD names a future cloud browser on a Hostinger VPS. That is not a URL to test.

## Flows

From `docs/harness/03-APP-FLOW.md` on `docs/harness-six-docs-2026-11-19` (eight MVP click-paths). None were run.

| Flow | PASS or FAIL | What happened | Steps to reproduce | Expected |
|---|---|---|---|---|
| F1 Agent opens a thread and a sub-agent | UNKNOWN | Not run. No preview URL. | Not run. | Thread and sub-agent appear without the user creating them. |
| F2 Auto-grouping | UNKNOWN | Not run. No preview URL. | Not run. | Threads with the same tag sit together. A retag moves the thread at once. |
| F3 Chrome import | UNKNOWN | Not run. No preview URL. | Not run. | Chosen site opens signed in. No cookie value in the UI, logs, or chat. |
| F4 Secure fill | UNKNOWN | Not run. No preview URL. | Not run. | Login works. The secret is masked. |
| F5 Cloud browser job | UNKNOWN | Not run. No preview URL. | Not run. | Job finishes on the cloud browser and the result is visible. |
| F6 Skill adapter | UNKNOWN | Not run. No preview URL. | Not run. | Same skill gives the same result shape on two model families. |
| F7 Speech-to-speech | UNKNOWN | Not run. No preview URL. | Not run. | A spoken round trip works. |
| F8 Rich reply | UNKNOWN | Not run. No preview URL. | Not run. | Chart, diagram, or HTML renders. HTML cannot read cookies or the parent page. |
| Page load, navigation, forms, 375px viewport, keyboard focus | UNKNOWN | Not run. No preview URL. | Not run. | Page loads, main paths work, no console errors, no failed requests, focus is usable. |

## Console errors

UNKNOWN. No page was opened.

## Failed network requests

UNKNOWN. No page was opened.

## UNKNOWN

- Whether a preview URL exists outside this repo, the open pull requests that were read, and the checks on `main`.
- Pass or fail for every flow above.
- Console errors, failed requests, broken links, mobile layout, and keyboard focus.
- Basic Memory: the memory skill was not in this environment, so no session note was written.
- Autosana MCP (`https://mcp.autosana.ai/mcp`) is not connected. Adding it needs Amit (browser sign-in). Not done in this run.

No secret, token, or key was seen.
