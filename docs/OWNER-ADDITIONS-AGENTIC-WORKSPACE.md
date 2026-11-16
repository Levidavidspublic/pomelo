# Pomelo - agentic workspace requirements

Required owner additions, 16 November 2026. Extend F001-F284 and X01-X17. No existing requirement is removed or accepted. Builder-facing behavioral requirements only; source research is kept outside this project. The product remains an independent AI-native Chromium desktop browser.

| ID | Required behavior | Acceptance boundary |
| --- | --- | --- |
| X18 | Original Pomelo app identity, distinct agent avatars, native Windows icon/resource/installer/taskbar identity, corresponding macOS packaging identity. | Inspect installed native app, shortcuts, window/taskbar/Dock and small/large icon rendering. A web favicon alone is insufficient. |
| X19 | Multiple specialized agents, each with scoped workspace, memory, tools, queue, harness/model/effort defaults and resource limits. | Real independent jobs; cross-agent data and authority remain isolated; unsupported capabilities stay unavailable. |
| X20 | Supervised local execution with explicit state/scratch separation, bounded recovery, cancellation and optional owner-hosted remote runner. | Real process lifecycle and restart/crash tests; no VM/isolation or always-on claim without actual platform proof. |
| X21 | Permissioned inter-agent delegation and message bus with task ownership, scoped handoffs, provenance and receipts. | Unauthorized recipient/scope rejected; retries deduplicate; credentials never become messages. |
| X22 | Inspectable versioned skills with tool/scope declarations, preview, change history, import/export and revocation. Built-ins cover codebase mapping, design alternatives, independent review, routine creation, research/parity, rendering and session handoff/archive. | Exercise skills through real capability checks; importing text grants no authority; untrusted instructions cannot override owner policy. |
| X23 | Owner-described loops, timer/event/watch triggers and templates with a reviewable deterministic plan, timezone, run-now/edit/pause/off and visible recovery. | Real durable scheduling, scoped effects, deduplication and restart proof; no automatic publishing/spending. |
| X24 | Opt-in analysis of selected work history to suggest routines, with source evidence, correction and owner acceptance. | Unselected/private/foreign history excluded; suggestion does not start a job without permission. |
| X25 | Built-in Product Explorer: authorized signed-in native browser journeys, assigned research agents, redacted screen/control/route/state evidence, safe action classification. | Actual controlled product exploration with exact profile/frame/document binding; owner login and consequential-action policy honored. No personal-session extraction merely for development. |
| X26 | Feature-parity workbench generates a sourced matrix, behavioral PRD/TRD/design contract and tests. Clearly distinguish observed, reported, inferred, unknown and implementation-verified states. | Independent evidence tracing and gap detection; generated UI or target self-description cannot pass a capability. |
| X27 | Simulation means reconstructing and replaying the explored product's interaction states and journeys in an isolated preview. | Deterministic replay, failure-state tests, external effects disabled in simulation, explicit fixture labels, and real-product comparison where authorized. No physics/world simulator implied. |
| X28 | Build-and-review workspace assigns isolated implementation tasks, tracks changes, integrates and runs checks with independent review. | Branch/workspace ownership, collision prevention and actual runnable checks; posting/merge/live deployment stay owner-controlled. |
| X29 | Creative Studio: image/video/audio jobs, canvas, storyboards, shot parameters, presets and asset library through available local/direct provider adapters. | Real representative jobs, output/provenance, cancellation and permissioned asset use; model availability and entitlement truthful. |
| X30 | Rendering/export: local composition previews, render queue, stitching and supported image/document/media export formats. | Actual files inspected and metadata/contents verified; missing encoder/GPU/provider stays unavailable; output stub is not acceptance. |
| X31 | Per-job observable steps, state, queue, selected harness/model, reported tokens and resource/cost diagnostics. | Source-backed metrics only; missing usage/cost is UNKNOWN; secret/session values excluded from every observer. |
| X32 | Optional authenticated remote channels, connector registry and self-hosted execution with owner-provided configuration. | Real adapter/host authentication and revocation; no assumed account access, default public listener or live send. |

## Required design integration

Retain the approved calm neutral/teal design, readable type, keyboard access, focus, RTL and reduced motion. Browse and chat remain immediately accessible. Agents, Research, Studio and Workflows are task workspaces within the browser, with progressive disclosure of setup and diagnostic details. Do not turn the main flow into a grid of decorative cards or expose implementation plumbing unnecessarily.

## Required credential and session boundary

Native 1Password authentication follows X13-X17. Engines, skills, research captures, simulations and scheduling receive references/status only. Model-independent secret fill and owner-selected Chrome transfer are trusted native operations; never bake credentials or cookies into reusable machine images. A simulated/imported UI is not a working native browser or a successful authenticated session.
