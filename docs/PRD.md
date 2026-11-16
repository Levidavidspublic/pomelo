# Pomelo — PRD

Status: proposed specification for owner review, before implementation. All engineering mechanisms and sequencing below are our design choices unless identified as owner requirements. No behavior is accepted yet.

## Product outcome

Pomelo is a desktop Chromium browser with integrated AI chat that can understand selected browsing context, execute controlled work across tabs/apps, run parallel isolated jobs, retain useful knowledge and produce usable outputs. Amit selects his model access through OpenCode or another supported subscription/API route. A Perplexity-inspired reading and chat interface gives the product a coherent visual direction.

The product target is full documented functional coverage. The first usable preview is an integration milestone; it is not the full first generation. FEATURE-CONTRACTS.md is the exhaustive, ID-based behavioral checklist for this planning snapshot. X01-X12 record owner requirements and explicit engineering design contracts separately from reference capabilities.

## Users and work

Primary user: an individual who browses, researches and delegates repeated work while keeping approval, account and provider control. Later shared-workspace users require actual tenancy and sharing boundaries rather than a local UI pretending to synchronize.

Core journeys:

1. Launch, choose an app-owned profile, open a site, organize tabs/groups/split views and restore that state after restart.
2. Open chat beside a page, inspect included context and selected provider, attach a file, ask a question, inspect sources, then continue in the same conversation.
3. Approve a plan, watch a bounded task and its helpers, answer questions, inspect real progress, stop or resume without duplicating completed external effects.
4. Reach a consequential action, inspect its exact target and proposed change, edit supported fields, then approve or deny. A pending or denied action has no prohibited dispatch/effect.
5. Register a secret reference using the approved private setup path. A deterministic broker fills an authorized target while the engine receives status only.
6. Save a useful process as a skill or timed/event automation; review trigger, account, grants, notification criteria and future runs.
7. Record an authorized meeting or dictate into chat, then inspect playback/transcript, speaker labels, summary, decisions and draft follow-ups.
8. Find outputs, share an explicitly selected file/assistant/workspace and revoke access with clear scope. Shared context must never imply shared private chat history.

## Product surfaces

| Surface | Required responsibility |
|---|---|
| Browser shell | Real navigation, tabs/windows, groups, split panes, profiles, bookmarks/history, downloads, print, extensions, site identity and device permissions. |
| New tab | One main question/search entry, recent work and optional assistant personalization/play mode; normal URL navigation remains unambiguous. |
| Assistant panel / full chat | Context chips, attachments, provider/model/effort, stream/stop, queued work, planning, results, citations and task inspection. |
| Work control | Running/waiting/blocked/finished work, helper relationships, human requests, approval queue and recovery. |
| Knowledge workspace | Personal/profile/assistant/team files, scoped search, previews, memory, skills, outputs and access controls. |
| Automations | Trigger/editor/validation, schedule preview, event conditions, account selection, history, pause/resume/replay and notification rules. |
| Meetings | Capture state, level feedback, pause/stop, transcript/recording list, playback, speakers, summaries and retry. |
| Settings | Appearance, profiles/import, extensions, privacy/site permissions, AI permissions, providers, integrations, usage, accounts/teams, diagnostics and help. |

## Functional contracts

The ID list is normative for scope. Each row has a proposed acceptance check. Related interface controls can share implementation but cannot silently remove a behavior. Source qualifications survive when converting research into implementation. F rows with proposed adaptations remain parity gaps until the owner chooses their disposition; shipping a stage does not waive them.

Browser: preserve ordinary browser behavior while adding the assistant. New windows, popups and downloads carry correct origin and profile identity. Browser profiles separate website state; app connections are separately scoped and visibly identified. Import selects source/profile/data types, reports partial results and never reads a live source profile behind the owner's back. Protected import uses an authorized OS flow and human consent. Extension installation/permissions and passkey/media/device compatibility require real tests.

Chat: conversations have independent queues and drafts. Context may include the visible page, selected text, both approved split panes, explicit tabs/apps/conversations and copied attachments. Before a send, show exactly which context and provider will be used. Onboarding requires a deliberate context-sharing policy; visible-page context can then be included automatically under that policy. This is an explicit safety adaptation, not silent behavior parity. Attachment preparation failures preserve the unsent input and allow retry/removal.

Execution: plan, answer and act are distinct states. A planning-only mode holds execution; starting work is a separate transition. Context inspection that can expose data is still governed by access policy. Tools operate on scoped handles, not arbitrary shell strings. Helpers receive limited goals and capabilities. A cancelled or crashed task reconciles already completed effects before any retry. Publish only useful explanations/tool summaries; never require hidden model reasoning as evidence.

Permissions: separate website/device grants, extension grants, app/tool grants, local-folder grants and owner decisions. Explain grant lifetime and account destination. Default safe read operations can be configurable; consequential actions remain under explicit owner controls. No page, tool result or model can approve its own action. No timeout or silence is consent. Human-only actions and off policies stay unavailable through driver tools.

Knowledge: memory is inspectable and correctable, with provenance and separate scopes. Skills contain reusable instructions; automations contain triggers and run state. Sharing discloses exactly which files/settings/memory/skills travel and keeps unrelated conversations private. Do not infer permission from a search result alone. Downloads/imports and external outputs retain provenance.

Outputs/meetings: use provider-compatible generation adapters for images, charts, documents, slides and video, with explicit capabilities, cost/entitlement state and actual export checks. Meeting capture is visibly on/off, requires human consent, supports pause/stop and excludes unrelated audio when unsupported. The application must not interfere with the user's read-aloud or dictation software. Optional whole-screen activity capture stays off unless a separately reviewed design can protect sensitive content and the user explicitly enables it.

Usage/teams: display the selected payer/provider, allowance, limits and actual measured usage where available. Unknown costs/quotas are labelled UNKNOWN. No automatic top-up or paid fallback. Personal-provider usage and budget controls are proposed adaptations to commercial reference behavior. Team roles/files/sync and any commercial account/seat flows remain full-scope records; they are not accepted by showing a static settings page.

## First preview and full first generation

First preview: real Windows browser shell; usable tab/profile/navigation/download basics; the agreed visual layout; one real supported engine through OpenCode; chat/context/stream/cancel; a harmless controlled browser job; approval denial; explicit provider state and recoverable errors. This preview must honestly list unimplemented contracts.

Full first generation: all required F contracts plus X requirements, verified compatibility matrix, knowledge/automations/meetings, cross-client/team behavior where required, security/privacy enforcement, packaged update/recovery and independent review. Adapted contracts and conditional features have explicit decisions. No full-parity claim while required, blocked or UNKNOWN rows remain.

## Quality and acceptance

- A feature is accepted only with its named build/version, real tested environment, input fixture, observed expected result and retained receipt. Mocks can check module logic but do not prove provider/browser/vault integration.
- Five-job objective: independent fresh browser identities, same-origin cookie/storage separation, actual overlapping work, complete correct per-job plan/log/result and bounded cleanup. Status labels alone are insufficient.
- Real-vault objective: deterministic Executor/dev-vault path; no engine relay; exact origin/frame/document bindings before fetch and fill; complete model-send and persistence guards; observed negative cases and scoped leak checks. TEST-provider evidence does not close it.
- Approval objective: owner decision before actual dispatch/arrival/effect; denied, off, silent, expired and cancelled cases have no prohibited effect; denying one job does not block an independent sibling.
- Accessibility: keyboard and screen-reader operation, zoom/reflow, English/Hebrew content and RTL, visible focus, reduced motion and computed contrast in both themes. Target WCAG 2.2 AA for Pomelo-owned UI; do not certify third-party pages.
- Reliability/security: provider disconnect, app/worker crash, restarts, malformed IPC, popup/redirect, stale context, revoked grant and failed update are named test cases. Preserve test artifacts.

## Scope limits and open decisions

No target code/assets/branding are reused. Google Chrome account sync, DRM redistribution, complete extension compatibility, every connector action, provider entitlement and account-dependent feature availability are not assumed. Human sign-in, legal consent, payment and live deployment remain owner actions. Exact route/version/resource confirmation and commercial/retention adaptations are decisions in BUILD-PLAN.md; this document does not authorize implementation or spending.
