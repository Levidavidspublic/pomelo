# Pomelo — 06 Roadmap and tickets

> **Verdict**
> - Four MVP PHASES, run by the VPS kitchen: fork and gates first, then threads and rich replies, then the secure and cloud browsers, then the skill adapter and voice.
> - Each phase ends on a Playwright check from 03-APP-FLOW (F1–F8). Nothing merges without it.
> - Gen 1 follows as two more phases. Full tickets are written by ticket sync after Amit approves this set.

Version: 19 Nov 2026. Per the software-factory rule, each phase lists its goal, exit check and first three ticket titles only. Tickets name a tier and trust level, never a model; `factory/SLOTS.md` maps tier to model.

## MVP vs Gen 1

| Release | Contains |
|---|---|
| MVP | Threads + auto-tags + latest-activity sort · rich replies · secure browser (Playwright, mask, 1Password, Chrome import) · cloud browser on the VPS · browser skills · skill adapter · speech-to-speech · native drivers |
| Gen 1 | Auto-RAG memory · dreaming · self-updating OpenCode adapters · Postgres/SQLite or Redis · Friday two-way sync · Expo Android app · wider spec-branch X-requirements |

## Phase 0 — Fork, gates and kitchen wiring

- **Goal:** Division6066/pomelo holds Friday v0.3.4 with history, the `upstream` remote, both licences, and the kitchen's gates live.
- **Exit check:** `npm test` passes on the fork unchanged. The Playwright smoke test opens the app. A PR with a failing test cannot auto-merge. The `PAUSE_AUTOMERGE` file stops merging.
- **First tickets:**
  1. Import Friday v0.3.4 into the pomelo repo with upstream history and licence notices.
  2. Add `PATCHES.md`, `THIRD-PARTY-NOTICES.md` and the rebase-check workflow.
  3. Wire the kitchen gates: CI, CodeRabbit (Opus fallback), Playwright E2E, auto-merge to main with the pause file.
- **Note:** Phase 0 touches `.github/**` and repo settings. That is config-lane work that needs Amit's OK. The kitchen may not do it alone. (carried rule)

## Phase 1 — Threads and rich replies

- **Goal:** Agents open threads and sub-agents themselves. Projects group by tag. The rail sorts by latest activity. Replies render charts, diagrams, artifacts and images.
- **Exit check:** Playwright F1, F2 and F8 pass against the real app, with no mocks for the agent tool calls in the final run.
- **First tickets:**
  1. Backend: add `lastActivityAt`, `projectTags` and `pomelo:tag` records, plus the `PomeloStore` interface.
  2. Mesh tools `open_thread`, `spawn_subagent` and `tag_project`, with tests.
  3. Rail: group by tag and sort by `lastActivityAt`, with the sub-agent badge.

## Phase 2 — Secure browser and cloud browser

- **Goal:** Playwright browser jobs with masking on by default, 1Password fills, Chrome import through the companion extension, saved browser skills, and the same jobs running on the VPS cloud browser.
- **Exit check:** Playwright F3, F4 and F5 pass. The canary-secret test finds zero hits in model input, logs, bus and storage. A job finishes with the PC off.
- **First tickets:**
  1. Backend: `browser_profile`, `browser_job`, `secret_ref`, `grant` and `import_run` records with resource locks.
  2. Mask layer over snapshots, accessibility trees and screenshots, plus the canary test.
  3. 1Password broker (official SDK or CLI desktop integration), fill by reference, status-only replies.

## Phase 3 — Skill adapter and speech-to-speech

- **Goal:** One skill behaves the same across model families through overlays. A spoken round trip works on desktop and the phone browser.
- **Exit check:** Playwright F6 and F7 pass. The overlay fixture shows the same output shape on two families. Voice interrupt works.
- **First tickets:**
  1. Backend: `skill_overlay` and `voice_turn` records.
  2. Overlay picker by driver family, plus generate-and-cache with a review queue.
  3. Voice path: on-device speech-to-text into the run, SSE reply, device or hosted speech (Rakazo pattern, with NOTICE kept).

## Gen 1 — Phase 4: memory and adapters

- **Goal:** Auto-RAG every 3 turns with XML-tagged prompts, dreaming, and the 2-week OpenCode adapter refresh.
- **Exit check:** Recall tests on long threads. Measures for context rot are UNKNOWN until defined.
- **First tickets:** (1) storage test ticket: Redis vs a Postgres/SQLite adapter; (2) turn-batch indexer; (3) XML prompt tagger.

## Gen 1 — Phase 5: reach and fallback

- **Goal:** Two-way sync with stock Friday, an Expo Android app on the server, and Pomelo browser parity work from the spec branch.
- **Exit check:** Amit moves a live project Pomelo → Friday → Pomelo with no loss. The Android app runs a thread and voice against the VPS.
- **First tickets:** (1) sync contract (projects, sessions, settings); (2) Expo shell pairing with the phone listener; (3) parity gap list from the spec branch.

## Kitchen rules (all phases)

- Tests first. Workers write code on the code model set in SLOTS.md (tonight: Codex GPT 6.2 Sol, high). Fable orchestrates and never writes code.
- One ticket = one branch = one PR, at most 3 files + 1 test. Three attempts, then the ticket is stuck and its dependants wait.
- Auto-merge into the fork's main only. Merging to a live branch and deploying are Amit's.
- Before the first run: list every pay-per-use tool (CodeRabbit usage, Cursor Bugbot, Vercel Agent, Copilot), and cap or switch it off.
- After Pomelo is proven, the same kitchen runs on Tempo Flow and OmniAgent.

## Open questions for Amit

1. Is the phase order right, with browser before skills and voice?
2. Who does Phase 0's config-lane work: you, or Opus with your approval?
3. Which `factory/SLOTS.md` should Pomelo use? The repo doesn't have one yet: UNKNOWN.

## Sources

- 01–05 in this folder.
- DeepTutor kitchen rules: memory notes `claude-cowork-friday-config-2026-11-19`, `claude-lane-v-vps-friday-2026-11-18`.
- Software-factory skill (batch and ticket rules).
