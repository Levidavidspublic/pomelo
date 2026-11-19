# Pomelo — 03 App flow

> **Verdict**
> - One main screen: thread list on the left, the chat in the centre, a side panel that switches between the Browser, an artifact, and the agent's work.
> - Every MVP feature is reachable from the chat. No separate "automation" or "browser" app.
> - Eight click-paths (F1–F8) cover the MVP. Each one has a Playwright check in 06-ROADMAP.

Version: 19 Nov 2026. Marks as in 01-PRD.

## 1. Screens

| # | Screen | What it holds | Data (see 05) |
|---|---|---|---|
| S1 | Sign-in gate (remote only) | Device pairing code or login. Not shown on 127.0.0.1. | `device` |
| S2 | Home | Composer, recent threads, project chips | `thread`, `project_tag` |
| S3 | Thread list (left rail) | Threads sorted by latest activity, grouped by project tag, sub-agent count badge | `thread`, `project_tag` |
| S4 | Chat | Messages, rich replies, approval cards, sub-agent rows, voice button | `message`, `card`, `lane` |
| S5 | Side panel: Browser | Live page (local or cloud), job list, mask indicator | `browser_job`, `browser_profile` |
| S6 | Side panel: Artifact | HTML, diagram, chart or image at full size, with copy, download and open-in-window | `artifact` |
| S7 | Side panel: Work | Lanes, sub-agents, tool calls, which driver and model is running | `lane`, `run` |
| S8 | Skills | Skills, model overlays, review queue for generated overlays | `skill`, `skill_overlay` |
| S9 | Settings | Drivers (Claude/Codex/OpenCode accounts), 1Password link, Chrome import, cloud browser, voice, devices | `driver_account`, `vault_link`, `device` |
| S10 | Voice mode | Full-screen talk view on phone or desktop: listening, thinking, speaking, interrupt | `voice_turn` |

## 2. Layout sketch

```
┌──────────┬──────────────────────────────┬──────────────────────┐
│ S3 rail  │ S4 chat                      │ S5/S6/S7 side panel  │
│ ▸ Pomelo │  agent: here's the chart ▢   │ [Browser|Artifact|   │
│ ▸ Tempo  │  [rich card / artifact]      │  Work]               │
│  · thr 1 │  ⧉ sub-agent "research" ✓    │  live page / chart   │
│  · thr 2 │                              │                      │
│ + new    │ [composer · 🎙 · model pill] │                      │
└──────────┴──────────────────────────────┴──────────────────────┘
```

## 3. Click-paths (MVP)

**F1. Agent opens a thread and a sub-agent**
1. Amit asks in S4: "Research X and draft a ticket."
2. The agent calls `spawn_subagent`. A sub-agent row appears in S4 and in S7.
3. The agent calls `open_thread` for the ticket. A new thread appears at the top of S3 with the same project tag.
4. Amit taps the new thread in S3. It opens in S4.
Done when: both appear without Amit creating them, and the S3 order follows the latest activity.

**F2. Auto-grouping**
1. A new thread starts. The agent proposes or sets tags with `tag_project`.
2. S3 shows the thread under that project. Amit can retag from the thread menu.
Done when: threads with the same tag sit together, and a retag moves the thread at once.

**F3. Chrome import (once)**
1. S9 → Chrome import → install the companion extension (Amit's click in Chrome).
2. Pick a Chrome profile and the sites. Pick the Pomelo profile (local or cloud).
3. The import runs and reports per site: imported, expired, or incompatible (device-bound).
Done when: the chosen site opens in S5 signed in. No cookie value shows in the UI, logs or chat.

**F4. Secure fill**
1. An agent reaches a login form in S5.
2. It asks the broker for a 1Password reference. The broker fills the field.
3. S5 shows a "masked" badge. The model's view shows `••••`.
Done when: the login works and the canary test finds the value nowhere a model or log can see.

**F5. Cloud browser job**
1. In S4: "Do this on the cloud browser." Or the agent picks the cloud profile itself.
2. S5 switches to the cloud view, with a "VPS" badge.
3. The job runs with the PC off.
Done when: the job finishes while the PC is asleep, and Amit sees the result on his phone.

**F6. Skill adapter**
1. Amit runs a skill written for Claude on a Codex or GLM driver.
2. If an overlay exists, it is used. If not, one is generated, cached and added to the S8 review queue.
Done when: the same skill gives the same result shape on two different model families (a fixture test).

**F7. Speech-to-speech**
1. Amit taps 🎙 in S4, or opens S10 on his phone.
2. He speaks. On-device speech-to-text turns it into text, and the text is posted as his message.
3. The reply streams back and is spoken. Talking over it stops the voice.
Done when: a full spoken round trip works on desktop and on the phone browser.

**F8. Rich reply**
1. The agent answers with a chart, a diagram or an HTML artifact.
2. It renders inline in S4. Tapping it opens S6.
Done when: each kind renders, and an HTML artifact can't read cookies or the parent page.

## 4. Error and empty states

- No driver signed in → S9 banner: "Sign in to Claude Code / Codex on this machine". Pomelo never shows a Claude login form.
- 1Password locked → the fill stops, and an approval card says "Unlock 1Password". The job waits.
- Cloud browser unreachable → the job is held. The card says "VPS not reachable", with a retry button.
- Import partial → per-site results. Nothing is silently replayed.
- Voice not available → the 🎙 button is disabled with a reason, and text still works.

## Open questions for Amit

1. Should the side panel default to Browser, Artifact or Work when a thread opens? (EXTRAPOLATED: last used.)
2. Should sub-agents ever appear in S3 as their own rows, or only inside their parent thread? (EXTRAPOLATED: only inside.)

## Sources

- 01-PRD, 02-TRD.
- Amit's screenshots of the Rakazo and Grok Bot thread lists, 19 Nov.
- Friday client components (`AgentsHub.tsx`, `GenUI.tsx`, `ComputerUse.tsx`).
