# Pomelo — 02 TRD (technical requirements)

> **Verdict**
> - Pomelo is Friday v0.3.4 (Node 22, TypeScript, React 19, Electron) plus a `pomelo/` layer, kept as a small patch set so upstream rebases stay cheap.
> - Friday already has most of the plumbing: CLI adapters (Claude Code, Codex, OpenCode, Cursor), a secret shield, in-chat UI cards, a browser panel, skills and a phone listener. Pomelo extends them; it doesn't rebuild them.
> - MVP storage is Friday's own store, unchanged. Postgres/SQLite waits for a test ticket.

Version: 19 Nov 2026. Read with 01-PRD. Marks as in 01-PRD.

## 1. Base and rebase rule

| Item | Fact or decision | Source |
|---|---|---|
| Upstream | github.com/splashxmoon/friday, MIT, v0.3.4, `engines.node >=22` | Repo, package.json |
| Stack | TypeScript, React 19, Electron (electron-updater), Tailwind, radix-ui, streamdown, shiki, KaTeX, motion, ws, node-pty, xterm | package.json |
| Fork | Division6066/pomelo, `upstream` remote = splashxmoon/friday | A-19 |
| Credit | Keep Friday's LICENSE and copyright line. Add Pomelo's MIT notice plus `THIRD-PARTY-NOTICES.md` (Friday MIT, Rakazo Apache-2.0 + NOTICE, Playwright Apache-2.0). | Licences |

Rebase rule (EXTRAPOLATED, KISS):
1. New code lives in `src/pomelo/**` and `src/client/pomelo/**`.
2. Edits to Friday files are small hooks, each listed in `PATCHES.md` with the reason.
3. A weekly job rebases onto upstream's newest tag in a branch and opens a PR. It never pushes to main.

## 2. Runtime shape

```
 Phone / laptop browser ──Tailscale──► Pomelo server (VPS or PC)
                                         ├─ Friday core: sessions, bus, routing, skills, secret shield
                                         ├─ Drivers: claude (CLI) · codex · opencode
                                         ├─ pomelo/browser: Playwright workers + secret broker
                                         ├─ pomelo/voice: STT → run → TTS
                                         └─ Store: Friday local KV (data.json + logs/*.jsonl)
 Desktop app (Electron) = same server on 127.0.0.1 + the Browser panel
```

- Friday listens on 127.0.0.1 only and has no allowed-hosts setting. The VPS currently uses a Caddy relay that rewrites Host. (19 Nov config note)
- Friday's own phone listener (`src/local/phone.ts`) pairs a device with a code over Wi-Fi or Tailscale and exposes only `PHONE_ROUTES`. Pomelo's remote login builds on it rather than opening the full app. (EXTRAPOLATED)

## 3. MVP components

### 3.1 Threads
- New agent tools on Friday's MCP mesh (`agent-mesh.ts`): `open_thread` (a new session), `spawn_subagent` (a lane that reports back) and `tag_project`. (EXTRAPOLATED names)
- Tags sit on the session record. The list sorts by `lastActivityAt`.

### 3.2 Native drivers
- Friday's `runner/adapters.ts` already runs Claude Code, Codex and Cursor "headless with machine-readable output, under the user's own login". OpenCode is present.
- Claude: the real `claude` binary or the Agent SDK. The official docs say the SDK is "a library that runs the Claude Code binary". The public build never offers a claude.ai login (see 01-PRD §6).
- Codex: ChatGPT-subscription login only. No OpenAI API key.

### 3.3 Secure browser
- Engine: Playwright (Apache-2.0), driven from TypeScript. It reuses Friday's `browser` tool and Browser panel (`browser-driver.ts`). Browser Use (MIT, Python, PostHog telemetry) is not the engine. (EXTRAPOLATED, KISS)
- **Secret broker** (`pomelo/broker`):
  - Gets values from 1Password through the official SDK or CLI desktop integration, as in carried X13.
  - Fills the bound origin, frame and field.
  - Returns status only to the model.
- **Masking by default:**
  - Every snapshot, accessibility tree, screenshot and DOM read passes through a mask before it reaches a model.
  - Filled and password fields read as `••••`.
  - Friday's `secrets.ts` shield still scrubs logs and the bus.
  - A test proves a canary value never appears in model input or logs.
- **Chrome import** (carried X15):
  - A companion Chrome extension uses `chrome.cookies` with host permissions for the chosen sites.
  - It sends cookies over authenticated local IPC.
  - Pomelo writes them with Electron `session.cookies.set` or Playwright `context.addCookies`.
  - Nothing reads Chrome's cookie database or bypasses App-Bound Encryption.
  - Export runs the same path in reverse.

### 3.4 Cloud browser (acts like a PC)
- Reuse what's already on the VPS: the `cloud-browser` container (linuxserver/chromium) with CDP on 127.0.0.1:19222, and the `cloud-browser` CLI. (19 Nov config note)
- Playwright connects over CDP. Profiles are encrypted at rest. Logins move PC → VPS only over the tailnet.
- Remote viewing for Amit uses the existing tailnet-only link. The login gate is UNKNOWN.

### 3.5 Skill adapter
- Base: Friday `skills.ts`, which stores named instructions.
- Each skill gets `SKILL.md` plus optional overlays `SKILL.<family>.md` (claude, codex, glm, deepseek, qwen, kimi…).
- At run time, the driver's model family picks the overlay. If there is no overlay, a mid-tier model writes one from the base skill once, caches it, and marks it for Amit's review. (EXTRAPOLATED)
- Gen 1 adds the 2-week auto-update loop from native CLIs.

### 3.6 Speech-to-speech
- Rakazo's design, copied with its Apache-2.0 LICENSE and NOTICE kept:
  1. Speech-to-text runs on the device where possible. Friday's voice input already does this in the browser with transformers.js.
  2. Each finished utterance enters the normal run path.
  3. The reply streams back over Server-Sent Events and is spoken by the device voice, or by a hosted voice the server renders to MP3.
- Hosted voice adapters: Fish Audio, ElevenLabs, or self-hosted Kokoro or Whisper. No WebRTC in the MVP.

### 3.7 Rich replies
- Friday's `gen-ui.ts` already draws cards in the chat (`show_ui` / `update_ui`). streamdown, shiki and KaTeX already render markdown, code and maths.
- Pomelo adds renderers for:
  - HTML artifacts, in a sandboxed iframe with no secrets or cookies
  - Mermaid diagrams
  - charts (library UNKNOWN)
  - images
  - interactive widgets

## 4. Storage

- MVP: unchanged. Friday's stores are written against Redis. The local edition uses ioredis-mock, saved to `<FRIDAY_HOME>/data.json` plus `logs/<hash>.jsonl`.
- Test ticket (Gen 1 gate): compare (a) a real Redis, (b) a Postgres/SQLite adapter under the KV interface. Pick by complexity. (A-19)

## 5. Environment names (names only)

`FRIDAY_HOME`, `PORT` (Friday) · `CLAUDE_CONFIG_DIR` (per Claude account) · `OP_SERVICE_ACCOUNT_TOKEN` or 1Password desktop integration (UNKNOWN which) · `POMELO_CDP_URL` · `POMELO_VOICE_PROVIDER`, `FISH_API_KEY`, `ELEVENLABS_API_KEY` (EXTRAPOLATED names) · `PAUSE_AUTOMERGE` (kitchen file switch).

## 6. Build line

The VPS kitchen, as in 06-ROADMAP "Kitchen rules". (A-19)

## Open questions for Amit

1. Which login gate does the cloud browser and remote Pomelo use? UNKNOWN.
2. Is the 1Password SDK desktop integration acceptable instead of Executor for the broker, as X13 says?
3. Which chart library? UNKNOWN. (EXTRAPOLATED: Recharts.)
4. Speech-to-speech on the phone needs a phone surface. Is the phone browser over the tailnet enough for the MVP, given that Android is Gen 1?

## Sources

- Friday source: `package.json`, `src/runner/adapters.ts`, `src/secrets.ts`, `src/gen-ui.ts`, `src/browser-driver.ts`, `src/skills.ts`, `src/local/kv.ts`, `src/local/phone.ts`, `src/voice-server.ts`.
- Claude Agent SDK overview: https://code.claude.com/docs/en/agent-sdk/overview
- Chrome cookies API: https://developer.chrome.com/docs/extensions/reference/api/cookies
- Electron Cookies: https://www.electronjs.org/docs/latest/api/cookies
- App-Bound Encryption: https://security.googleblog.com/2024/07/improving-security-of-chrome-cookies-on.html
- Rakazo voice: https://github.com/elie222/rakazo/blob/main/docs/voice-and-calls.md
- Memory note `main/inbox/claude-cowork-friday-config-2026-11-19`.
