# Pomelo — TRD

Status: proposed architecture, before implementation. EXTRAPOLATED engineering design; framework documentation establishes available primitives, not a working or secure Pomelo build. FEATURE-CONTRACTS.md supplies granular required behavior.

## Architecture decision

Recommend a minimal upstream Chromium fork with an isolated Node/TypeScript sidecar. Keep native Chromium browsing, profile, extension, permission and rendering infrastructure. Add a narrow owned shell/sidebar surface and a typed broker bridge. Keep chat/workspace/control UI in packaged trusted assets. A maintained small patch queue and a security rebase/update process are part of the product, not optional release polish.

Electron WebContentsView is a useful reduced-compatibility experiment but is not the full-parity route: arbitrary Chrome-extension compatibility is not its goal. CEF is another embedding option but still needs substantial browser UI, profile/update and compatibility work. Neither alternative is silently substituted for the approved scope. Google service sign-in/sync and proprietary media components require separate documented rights and compatibility evidence even with a Chromium fork.

Primary route references: [Chromium source](https://www.chromium.org/developers/how-tos/get-the-code/), [Windows build](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md), [restricted Google APIs](https://www.chromium.org/developers/how-tos/api-keys/), [Electron extension limits](https://www.electronjs.org/docs/latest/api/extensions). Pin a tested stable revision and its actual toolchain; live upstream-main requirements are not a version lock.

## Processes and boundaries

| Component | Duties | Boundary |
|---|---|---|
| Native browser host | Windows, profiles, native tab/renderer lifecycle, permissions, extensions, downloads, navigation and browser actions. | Retain browser sandbox/site isolation/TLS checks. No remote page gets general host IPC. |
| Trusted Pomelo UI | Navigation rail, chat/workspace/work controls, settings and approval presentation. | Packaged owned origin; strict CSP; no arbitrary remote UI code. Render model text as untrusted content. |
| Local typed bridge | Correlated requests/events, schema/version validation, owner decisions, browser-scoped handles. | Validate sender, capability, profile, tab/frame/document and current grant at dispatch. No renderer shell execution. |
| Sidecar supervisor | Starts/stops only app-owned components, health/version checks, crash reporting and safe recovery. | Own unique data root; authenticated local channel; no effect on unrelated services or browsers. |
| Engine adapters | Discover capabilities, start/stream/cancel/resume, tool proposals and usage. | Models receive sanitized allowed context and capability-filtered tools; never vault values. |
| Job/automation scheduler | Task state, isolated pool, helper delegation, trigger/replay/dedup, retries and budgets. | Resource-aware caps and single-owner leases for shared surfaces; no blind effect retries. |
| Deterministic secret broker | Resolve dev-vault references through Executor and fill verified targets. | No model in secret-return path, no general vault tool exported to engines. |
| Policy/approval engine | Grants, action classes, owner decisions, expiry and revocation. | Separate from models and page content; binds immutable action digest and target. |
| Store/search/workspace | Typed records, encrypted sensitive payloads, files, indexes and change history. | Scope checks on every read/write; no secret values in general persistence or indexes. |
| Optional sync service | Cross-client chats/files/team collaboration. | Explicit tenancy, key lifecycle and conflict protocol; no cloud deployment implied by planning. |

An internal loopback API is an implementation transport; the product remains native desktop software. Prefer local named pipes where supported or loopback-only authenticated endpoints with short-lived authority. Do not leak local bearer values into URLs, logs, environment dumps or model-visible tool schemas. Do not open remote-debugging ports broadly.

## Identity, profiles and browser state

Persistent browser profiles own website sessions, bookmarks, history and extensions. Private windows use separate ephemeral browser storage and must also avoid Pomelo transcript/index/thumbnail persistence. Isolated job workers use app-owned fresh profile/context identities. A storage partition alone is not an OS exploit sandbox. Verify same-origin state separation and actual worker identities independently.

Account-wide app connectors and profile-local custom MCP are distinct scopes. Display chosen account on every app action. Never assume a profile switch changes connected-app identity. Do not point a job at the user's live Chrome profile. Migration uses explicit source/profile/data selection, safe snapshots or supported export/import paths, partial-result accounting and approved OS prompts. Do not decrypt/import passwords or cookies as an unreviewed convenience. Human-controlled import of protected material requires explicit consent; default first preview uses synthetic or user-selected non-secret bookmark exports.

## OpenCode and provider adapters

OpenCode is the first planned engine route. Before integration, inspect non-secret installed version metadata and the actual supported server/OpenAPI contract. Current V2 migration recommends `@opencode/client`; the HTTP API is experimental and older server/SDK URLs refer to V1. Pin the chosen contract and reject incompatible majors instead of upgrading the user's setup implicitly.

Use a dedicated project/service with least authority or an explicitly approved attachment to an existing service. Do not inherit a broad shell/filesystem/MCP environment merely because login already works. Effective tool grants and sandbox behavior must be checked. Do not edit the live OpenCode configuration during product tests. Filter model/provider inventories to non-secret fields. Start one real entitled provider, then a second approved route to prove switching. Test stream, cancellation, reconnect, unavailable model and timeout without duplicated submissions or a paid fallback.

Adapter contract: discover non-secret capabilities; create scoped session; submit message/context/tool schema; emit text/tool/status/usage events; request approval; cancel with acknowledgement; reconcile/resume. Required capabilities include text, tools, vision where used, context limits, supported attachments, reasoning-control availability and spend classification. Unsupported options are disabled with an explanation. Model IDs belong to runtime settings, never rules/prompts/tickets.

Supported subscriptions are accessed only through their documented official routes and entitlements. Keep Codex on ChatGPT OAuth; no API key is wired into Codex. A real vendor CLI handoff is different from exposing its subscription as a generic Pomelo model endpoint. Do not extract cookies/OAuth tokens or call private chat endpoints. Official SDK availability is not, by itself, permission to offer subscription login in a third-party product. Approved metered APIs use dev-vault references and an explicit spending ceiling before real calls; no top-ups or default paid fallback. Provider-compatible API syntax does not prove identical tool/vision/streaming support.

References: [OpenCode V2 migration](https://opencode.ai/docs/migrate-v1/), [OpenCode API](https://opencode.ai/docs/api), [providers](https://opencode.ai/docs/providers/), [permissions](https://opencode.ai/docs/permissions/), [Codex auth](https://developers.openai.com/codex/auth/), [Agent SDK overview](https://code.claude.com/docs/en/agent-sdk/overview). Provider terms/version compatibility are checked again before enabling an adapter.

## Tool, context and action protocol

Every proposal carries request ID, session/job ID, capability ID, action type, target profile/tab/frame/document handle, normalized origin, proposed payload digest and deadline. Validate schema and grant at the host boundary. Revalidate live target identity at dispatch. An action approval is bound to that action/target/digest and expires when edited or stale. Renderer assertions about sender/origin are not authority.

Context preparation enumerates attached pages/files/selection and redacts secret-bearing content before it enters engine context. Explicitly account for split panes, embedded frames, redirects, new windows, stale documents and nested model/tool retries. No cookies, authentication headers, password databases or raw credentials become page context. A selected-context policy may allow automatic visible-page inclusion after informed opt-in. Persist only the sanitized content and scope metadata. Record unavailable context honestly.

The action path is proposal -> policy -> optional owner decision -> target revalidation -> dispatch -> observed result -> sanitized receipt. A denial stops that action; siblings with independent permission can proceed. Silence, expired approvals, cancelled work, an off class or untrusted-page requests cause zero prohibited dispatch/effects. An observer records actual boundaries; it cannot implement the policy being tested. Payment, sending and destructive owner actions are human-controlled; no agent auto-approval.

Secrets use a separate reference-only operation. Deterministic code validates allowed effective origins (scheme/host/port), both top-level and fill-target frame/document, before actual vault lookup and again immediately before fill. Bind the result to the verified live target; refuse unsupported/opaque/replaced/race-unsafe targets. If a legitimate lookup occurred before a later origin change, count it honestly and prevent the forbidden fill. Release transient references after use without asserting unproved RAM erasure. The model receives only status/reference/site/time. Exact origin checks are not replaced by file-name allowlists.

Real secret acceptance requires the actual code-only Executor/dev-vault chain and complete raw pre-redaction model-send and pre-persistence observations, including retries/restarts. The existing TEST provider cannot satisfy it. Avoid screenshots when a filled/masked secret field is visible. If complete safe observation cannot be demonstrated, block that claim rather than claiming a global zero-leak guarantee.

## State, storage and events

Use a local transactional store (proposed SQLite) plus scoped workspace files. Tables/entities: profiles; windows/tabs; conversations; messages/attachments; assistant profiles; jobs/steps/worker leases; plans/todos; grants/approvals; secret references (never values); providers/model capabilities; connector references; skills/memory entries with provenance; automations/triggers/delivery IDs/runs; meetings/transcript segments; artifacts/shares; teams/members/roles; usage reservations/receipts; recovery/update records.

Proposed states: draft, queued, opening, running, waiting-owner, blocked, stopping, cancelled, failed, completed. A job marked running must not imply browser readiness; expose readiness separately. Monotonic per-run sequence numbers correlate records. Terminal status follows effect reconciliation and a bounded drain observation. Retried external calls use idempotency keys where supported; otherwise ask for recovery instead of repeating a possibly completed action.

Store sensitive chat payloads encrypted with a reviewed key lifecycle; separate metadata/indexes and disclose what remains searchable. Local encryption does not automatically establish E2EE. Sync requires explicit key custody, transport, tenancy, offline queue and conflict tests. Personal/profile/assistant/team scopes are enforced at the store, index and file-service boundaries. Public shares are explicit bearer capabilities with revocation and live-versus-snapshot semantics. No real sharing service is deployed by this plan.

Archive-first agent cleanup preserves test/runtime evidence. Human data-erasure and retention workflows are separate decisions; archiving is not falsely described as permanent account deletion. Never use a cache cleanup as proof that account/cloud data was erased.

## Automation, files and audio

Scheduler: timezone-aware daily/interval/cron/one-off triggers, explicit next-run preview, app-event filters, durable delivery dedup, run history, pause/resume/replay and missed-run policy. Browser-closed execution is not claimed without a separately implemented service. Automation grants cannot silently widen on restart. Quiet runs archive rather than destroy evidence under owner policy.

File/artifact pipeline: type/size validation, safe filenames and destination scopes, collision handling, provenance and actual export checks. Treat documents and generated HTML as untrusted. Preview isolation does not grant file/script authority. Image/video/document generation adapters show entitlement and cost state, fail safely and verify resulting playable/openable artifacts. Placeholders or canned output are not accepted provider integration.

Audio: microphone/system capture is platform-specific, visibly active and consent-controlled. Keep pause/stop responsive and avoid capturing unrelated sources when exclusion cannot be verified. Segment transcription with timestamps/speaker labels; preserve recording state and safe recovery; do not fabricate speech or speaker certainty. Recording and external transcription have distinct permissions and spending classification. Preserve read-aloud/dictation applications.

## Security, delivery and verification

Keep upstream sandbox, site isolation, certificate validation and safe navigation. Test remote content cannot invoke privileged APIs, spoof approval UI, reach secret/provider configuration, run arbitrary local commands or cross profile/team boundaries. Restrict external protocols, downloads, popups, extensions and clipboard/device grants. Extensions are an independent trust boundary and can invalidate privacy assumptions; isolate test profiles and document unsupported combinations.

Package preview builds separately from everyday browsing. Verify update provenance/signatures and rollback/data-migration behavior before advertising regular-use safety. Maintain source revision, dependency licences/SBOM, patch list, build reproduction and security-update ownership. Only the owner deploys live.

Evidence per contract: ID, build/revision, environment, real-versus-simulated boundary, fixture, observed result, expected result, PASS/FAIL/UNKNOWN, sanitized artifact hashes and reviewer. Unit tests and mocks cover module logic; real browser/provider/vault/audio/sync acceptance remains distinct. A critical security failure stops the affected boundary immediately; three rounds with no progress triggers a bounded stop/report, not hidden retries or weaker assertions.

Open technical questions: chosen stable Chromium/toolchain; build-host memory/disk/CPU budget; actual extension/site/DRM/passkey compatibility; provider entitlements and OpenCode version; safe five-worker capacity; complete secret/action observer feasibility; sync hosting/key model; signing/update route; exact commercial and retention adaptations. BUILD-PLAN.md resolves these in explicit stages before claiming the relevant capability.
