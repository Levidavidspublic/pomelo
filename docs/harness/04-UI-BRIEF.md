# Pomelo — 04 UI/UX brief

> **Verdict**
> - Look: sleek, minimal, with liquid glass, in matte black, white and grey with a touch of greyish blue. Components feel like Perplexity, Manus and Base44. (A-19, carrying the 12 Oct Agentwright direction)
> - Built on Friday's existing kit (Tailwind, radix-ui, lucide icons, motion), so the design system is a theme, not a rewrite.
> - Readability wins over effect: glass sits on chrome only, never behind body text.

Version: 19 Nov 2026. The mockup and design-system tokens come next, in the design layer, after these docs.

## 1. Direction

| Quality | Means |
|---|---|
| Sleek | Few borders, generous spacing, one accent colour |
| Minimal | The chat and its result come first. Settings and plumbing stay behind progressive disclosure. |
| Liquid glass | Translucent, blurred panels on the rail, top bar, composer and side-panel header, with a soft edge highlight. Content surfaces stay solid. |
| References | Perplexity (answer + sources), Manus (agent work shown beside the chat), Base44 (calm builder panels) — interaction ideas only, no copied assets, fonts or wording |

Supersedes the teal palette and the "no glass layers" line in `docs/design.md` on the spec branch. Its accessibility, state-coverage and Impeccable anti-slop rules still apply. (A-19, newest wins)

## 2. Starting tokens (EXTRAPOLATED, to be tuned in the design layer)

| Token | Dark (default) | Light |
|---|---|---|
| Canvas | #0E0F11 matte black | #F6F7F8 |
| Surface (solid) | #16181C | #FFFFFF |
| Glass | rgba(28,31,36,0.62) + 20px blur | rgba(255,255,255,0.66) + 20px blur |
| Text primary | #ECEEF1 | #15171A |
| Text secondary | #A3A9B3 | #555C66 |
| Accent (greyish blue) | #8FA3BF | #4E6584 |
| Divider | #2A2E35 | #DDE1E6 |
| Danger / warn / ok | Separate semantic colours that pass contrast | same |

- Type: OS-native sans stack with a Hebrew fallback. Chat body 16–17px / 1.6.
- Radius: 10px controls, 16px composer and cards.
- Motion: 120–180ms, off when the system asks for reduced motion. No loops and no pulsing. A steady rhythm was a trigger for Amit in an earlier design.

## 3. Components

| Component | Notes |
|---|---|
| Thread rail | Glass panel. Project groups fold. Each row shows title, latest-activity time, a sub-agent badge and an unread dot. |
| Composer | Glass. Context chips, attach, model pill, 🎙 voice, send and stop. Queued messages show as compact previews. |
| Message | Solid. Markdown via streamdown, code via shiki, maths via KaTeX. |
| Rich reply card | Chart, diagram, image or widget inline, with tap-to-expand into the side panel. Friday's `show_ui` cards inherit the theme. |
| Artifact viewer | Sandboxed frame with a toolbar: copy, download, open in window, version picker. |
| Sub-agent row | One line: name, status (running, waiting, done, stuck), last step. Opens the Work tab. |
| Approval card | Exact action, origin, account and change, with Approve, Deny and Edit. Never a toast. Expired and denied states never look done. |
| Browser panel | Live page, job chips, "masked" and "VPS" badges, a profile switcher. |
| Voice mode | Full-screen. A calm waveform reacts to speech only and stays still otherwise. Large stop button. Interrupt by talking. |
| Settings | Plain lists. Driver accounts show the signed-in name, never tokens. Secrets show only SET or UNSET. |

## 3b. Agent personas: the noir cast (A-19)

- Each agent persona (Researcher, Tutor, Companion…) has a black-and-white oil portrait with canvas grain, borrowed from OmniAgent's Noir Edition pack, with an italic serif name (Instrument Serif, EXTRAPOLATED font).
- Where it shows: a portrait card when you pick a persona, a round avatar on sub-agent rows and the model pill, the voice-mode orb, and about 6% behind the thread as a backdrop.
- Paintings are original adult characters with no readable text (OmniAgent rules PA1–PA4). OmniAgent's mascot, Liberty Leary, stays OmniAgent's and is not used in Pomelo.

## 4. Accessibility (carried, required)

- WCAG 2.2 AA. Text contrast at least 4.5:1, also measured over glass with the worst-case background.
- Everything works by keyboard: rail, composer, cards, approvals and panel resize.
- RTL and mixed Hebrew/English in messages and artifacts.
- Read-aloud and dictation tools (Speechify, Wispr Flow) must keep working over the app. Never steal their focus or block them.
- Amit has ADHD and severe dyslexia, and often listens instead of reading. Messages lead with the verdict, and every reply has a "read aloud" control. (EXTRAPOLATED control)

## 5. Anti-slop checks (carried from Impeccable rules)

- No decorative gradients, neon, grid backgrounds or card-in-card stacks.
- Glass is used only where it signals layering; at most two glass layers deep.
- Copy states real status only. Nothing says "done" before an observed result.
- One icon family (lucide). Unclear icons get labels.

## 6. Design-layer deliverables (next step)

1. A mockup of the chat window: rail, chat with a chart card, an HTML artifact, a Mermaid diagram, an image, a sub-agent row and an approval card; the side panel on the Browser tab with the masked badge; the composer with voice.
2. The voice-mode screen, on phone and desktop.
3. Design-system tokens as a Tailwind theme plus a short component sheet.

## Open questions for Amit

1. Dark only, or dark and light from day one? (EXTRAPOLATED: dark default, light supported.)
2. Should Pomelo have a mascot or avatar? Friday has `Mascot.tsx`. UNKNOWN.

## Sources

- Amit, 19 Nov: "sleek, minimalistic, with liquid gloss"; 12 Oct Agentwright design direction (memory).
- Spec branch `docs/design.md` (accessibility, states, anti-slop).
- Friday `package.json` UI dependencies.
- WCAG 2.2: https://www.w3.org/TR/WCAG22/
