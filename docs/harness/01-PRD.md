# Pomelo — 01 PRD (product requirements)

> **Verdict**
> - Pomelo is Amit's own agent harness: a fork of Friday (MIT) with its own secure agentic browser built in.
> - The MVP is threads that agents open themselves, a secure browser, a cloud browser that acts like a PC, a skill adapter, speech-to-speech, native drivers and rich replies in the chat.
> - This set replaces the Agentwright docs. Gen 1 adds auto-RAG memory, dreaming, self-updating model adapters, Postgres/SQLite, Friday sync and Android.

Version: 19 Nov 2026. Repo: Division6066/pomelo. Mode: KITCHEN (rapid prototype), then FACTORY.

Marks: (A-19) = Amit said it in the 19 Nov planning chat. (EXTRAPOLATED) = my fill, check it. UNKNOWN = no source says.

## 1. What it is

1. One harness Amit uses every day, for code, configuration and "everything else". (A-19)
2. It is built on a fork of Friday (splashxmoon/friday, MIT, "Copyright (c) 2026 Arun Dass"). It keeps Friday's credit and stays easy to rebase onto new Friday releases. (A-19)
3. It carries the Pomelo browser: an agentic browser that works as Amit, with his logins, and never lets a model see a secret. (A-19)
4. It is open source later, with Amit credited. (A-19; 18 Oct memory)
5. The name is Pomelo, "the fruit". It is not Pamela. (Amit, 16 Nov)

## 2. Users

| Who | Need |
|---|---|
| Amit (primary) | Run many agents in parallel, on his PC and on his VPS, without logging in twenty times |
| Later open-source users | The same harness on their own logins and keys, with no Amit-specific setup (carries X17) |
| Anti-persona | A team wanting shared tenancy. One person, one box. (carried from Agentwright) |

## 3. MVP (must work before daily use)

1. **Threads.** Agents can open new chats, threads and sub-agents themselves. Projects group themselves by tags. The chat list puts the most recent activity first, not the creation date. (A-19, with screenshots of Rakazo and Grok Bot)
2. **Secure browser.** Built on Playwright (or Browser Use) instead of a compiled Chromium fork, as long as it gets 80–90% of the result. (A-19)
   - Imports and exports everything from Chrome: cookies, sessions, logins. Amit logs in once. (A-19)
   - Works with 1Password (CLI and MCP) from the ground up. (A-19)
   - Fills, pastes and types keys without asking each time. Masking is on by default, so no model sees a key in a screen read, a Playwright snapshot or a log. (A-19)
3. **Cloud browser that acts like a PC.** A headless browser on Amit's Hostinger VPS, so his laptop can be off. Logins move there encrypted over Tailscale. Reached through a login, like his DeepTutor on Railway. (A-19)
4. **Skill adapter.** One main skill, plus model-specific versions, so every model behaves more or less the same: "Then I don't have to wonder why my Codex isn't aligning like Claude." (A-19)
5. **Speech-to-speech.** Copies Rakazo's phone voice design (Apache-2.0): the phone's own speech recognition, then a normal agent run, then a spoken reply. (A-19; Rakazo docs)
6. **Native drivers.** Claude through Claude Code, Codex through Codex, every other model through OpenCode. (A-19)
7. **Rich replies.** Artifacts, diagrams, charts, widgets and images render inside the chat. (A-19)
8. **Browser skills.** Reusable browser tasks an agent can save and run again, like Ego Lite's skills. (A-19, EXTRAPOLATED reading)

## 4. Gen 1 (next generation)

1. Auto-RAG memory. Every 3 chat turns, the conversation becomes an indexed database, and prompts are XML-tagged. The same design goes into Tempo Flow and OmniAgent, to stop context rot and hallucination. (A-19)
2. Dreaming: background insights and skill updates. (A-19)
3. A forked OpenCode with per-model-family adapters. Every 2 weeks it re-reads how each family's native CLI differs, including for uncensored and abliterated models. (A-19)
4. Storage: Postgres on a server and SQLite on one machine, or Friday's own store configured. Chosen by complexity after a test ticket. (A-19)
5. Two-way sync with stock Friday, as the fallback. (A-19)
6. An Expo Android app that connects to the self-hosted Pomelo. The agents run on the server. (A-19)
7. The full Pomelo clean-room scope (F001–F284, X01–X32 on branch `docs/pomelo-specification`). It stays a target where it doesn't conflict with this set. (EXTRAPOLATED)

Placement of items 3–6 is EXTRAPOLATED and not yet confirmed by Amit.

## 5. Never

OpenRouter (the Jev judge is the only exception) · Composio · n8n inside the product · OpenAI API rates · offering a claude.ai login to other users without Anthropic's approval · calling the product "Claude Code" · a model seeing a secret value · bypassing Chrome's App-Bound Encryption · solving a CAPTCHA · merging to a live branch or deploying live without Amit.

## 6. Claude access

- Personal use: the real Claude Code under Amit's own login. (A-19)
- Public release: each user's own installed and signed-in Claude Code, the way T3 Code does it ("T3 Code does not resell tokens. It drives the agents you are already signed in to.").
- A request to Anthropic for approval goes out in parallel, as a draft only until Amit says go.
- If Anthropic refuses: a bridge where an agent hands Claude work to a separate Claude Code run in GitHub Actions. (A-19)

## 7. Contradictions resolved tonight (newest wins)

| Older | Newer (19 Nov) |
|---|---|
| Agentwright: Next.js + Herdr, then a T3 Code fork | A Friday fork named Pomelo |
| Pomelo spec: a minimal Chromium fork (TRD, spec branch) | Playwright inside the Electron app, with a compiled fork parked |
| Pomelo `design.md`: teal palette, "no glass layers" | Sleek, minimal, liquid glass, matte black, white, grey and greyish blue |
| Pomelo X13: direct 1Password SDK, Executor not a runtime dependency | Kept. "1Password, CLI and MCP" is the same direction. |
| 14 Nov: kitchen sinks run on Opus 5.5 | 19 Nov: Fable orchestrates and checks |

## Open questions for Amit

1. Is the Gen 1 placement of storage, Friday sync, Android and the OpenCode adapters right?
2. What name should the cloud browser have? UNKNOWN.
3. Does "skills" in the MVP also mean the two-layer, model-specific skills, or only browser skills?
4. Which X-requirements from the spec branch must be in the MVP? (EXTRAPOLATED: X13–X16 only.)

## Sources

- Planning chat, 19 Nov 2026, plus memory note `main/inbox/claude-cowork-pomelo-plan-2026-11-19`.
- Friday repo and LICENSE: https://github.com/splashxmoon/friday (v0.3.4).
- Rakazo voice: https://github.com/elie222/rakazo/blob/main/docs/voice-and-calls.md
- T3 Code README: https://github.com/pingdotgg/t3code
- Claude Agent SDK overview: https://code.claude.com/docs/en/agent-sdk/overview
- Pomelo spec branch `docs/pomelo-specification`: PRD, TRD, design, OWNER-ADDITIONS files.
