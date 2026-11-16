# Pomelo — design.md

Status: proposed visual and interaction contract. The reference direction is Perplexity's calm question/answer/source-oriented interface, adapted to a complete browser. Exact current Perplexity production fonts/tokens and any private design.md are UNKNOWN. The values below are our original starting choices, not extracted proprietary specifications. The supplied concept image is a planning illustration, not a working app or screenshot of another product.

## Design direction

Keep reading and browsing central. Use a quiet neutral canvas, strong readable text, restrained teal actions, a clear composer and inspectable sources. Browser chrome stays familiar. The page viewport is distinct from chat; address entry does not ambiguously issue an agent command. This design reuses established interaction conventions rather than adding a new ornamental theme.

Official reference patterns: [Perplexity question/sidebar/uploads](https://www.perplexity.ai/en-GB/hub/blog/getting-started-with-perplexity), [answer/source presentation](https://www.perplexity.ai/en-GB/hub/getting-started), [page/selection context](https://www.perplexity.ai/en-GB/hub/blog/introducing-comet), [browser-aware assistant](https://www.perplexity.ai/en-GB/hub/blog/the-new-comet-assistant). These describe interaction ideas; they are not measured geometry or universal account availability.

## Desktop layout

Top: conventional window/tab controls, address field, back/forward/reload, site identity, profile and explicit assistant entry. Support classic top tabs and optional vertical tab organization. A compact left rail opens tabs, chats, work, knowledge, automations and meetings. The main viewport hosts real webpages and split panes. A resizable right panel hosts chat and action review; full-page chat is available when reading or composing needs more room.

Proposed large-window dimensions: 48px top navigation row, optional 208px expanded left rail (56px compact), approximately 400px assistant panel adjustable within 340–640px when space permits. Preserve a useful webpage viewport; collapse navigation or switch to full-page chat at constrained widths. These are preview choices to validate, not rigid limits.

Chat: title and provider state at top; normal document-flow answers; source references adjacent to claims; expandable source previews; modest task-progress rows; composer anchored at bottom with explicit context chips, attachment control, model/effort, send and stop. Queued follow-ups display compact previews with edit/reorder-to-next controls. A waiting request appears near the composer with stable focus and a clear relation to the task.

Approvals: show action, exact origin/account, destination, proposed change and scope. Use distinct Review, Approve and Deny actions. Editing invalidates the old approval digest. Do not hide a consequential approval in an ordinary toast or let page content imitate the trusted surface. Pending/expired/denied states never look like completion.

New tab: one clear composer/search entry, recent work and minimal useful shortcuts. Personal assistant appearance and optional playful mode remain available; keep them off the critical reading path. Use original faces/art and respect reduced motion. No copied characters, product names, icons, fonts or screenshots.

## Proposed tokens

| Token family | Light | Dark |
|---|---|---|
| Canvas | #F8F9F7 | #171D1B |
| Surface | #FFFFFF | #202824 |
| Primary text | #202725 | #EEF3EF |
| Secondary text | #52615B | #BAC9C0 |
| Primary action | #176B63 | #86D3C2 |
| Divider | #D6DEDA | #45564D |

Typography: readable OS-native body/control stack initially, with Hebrew fallback. Proposed chat body 17px/1.6, controls 14px/1.4, secondary labels 13px, section titles 20px/1.3; user-adjustable chat size. This restrained desktop direction takes precedence over decorative-font novelty. No proprietary font downloads. Use roughly 60–70 characters per line in full-page answers when width allows.

Spacing: 4/8/12/16/24/32px. Controls use approximately 6px radii, composer 12px; ordinary regions use spacing/dividers rather than card nesting. Reserve shadows for overlays. Motion is approximately 120–180ms for orientation, disabled/reduced when requested. Semantic warning/error/success/focus colors are separate and must pass contrast checks; an accent color is not proof of safety.

## State coverage

Specify empty/new chat, draft with context, attachment preparation/failure, queued, streaming, waiting approval, denied, stopping, interrupted, disconnected provider, unavailable model, stale/missing context, offline, recovered conversation, long answer/table and failed export. Browser states include loading, certificate error, blocked popup, crashed tab, protected import pending/partial, permission prompt, download complete/failure and restore after restart. Use plain language and preserve the user's input.

## Impeccable and anti-slop review

Use the official [Impeccable documentation](https://impeccable.style/docs/), [anti-pattern catalogue](https://impeccable.style/slop/), [typeset](https://impeccable.style/docs/typeset/), [layout](https://impeccable.style/docs/layout/) and [audit](https://impeccable.style/docs/audit/) guidance as review criteria. No installation or execution is implied by mentioning them.

- The task and next action are clear before decoration.
- No gratuitous gradient hero, neon glow, glass layers, decorative grid, oversized slogan or repeated icon tiles.
- No card-in-card stacks for ordinary text. Group by work and use a consistent rhythm.
- Use one coherent icon family and accessible names; ambiguous icons have visible labels.
- Avoid faint secondary text, tiny controls, forced narrow answers and uncontrolled wide content.
- Motion marks state changes; no endless pulsing, celebratory noise or animated confidence claims.
- Copy describes actual state. No success statement until an observed result exists.
- Apply audit/critique, then clarify/harden/polish. Verify real workflows after automated checks.

## Accessibility and language acceptance

Target WCAG 2.2 AA for Pomelo-owned UI, with separate native-shell and third-party-page evaluation. Compute normal-text contrast at least 4.5:1, qualifying large text 3:1 and required non-text contrast 3:1; test focus/hover/disabled/error states and both themes. Proposed tokens are not certified by this document.

Keyboard alone must cover omnibox, tab switching, pane/chat focus, context removal, composer, sources, stop, approvals and resizing. Provide a non-drag resize option and preserve focus after closing overlays. Support 200% text resizing and narrow effective widths; use correct screen-reader roles, restrained live announcements, reduced motion and forced colors. Test English/Hebrew mixed paragraphs, RTL layout, isolated URLs, tables and code blocks. Do not close or disable read-aloud or dictation tools. Follow [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## Review artifacts

Review POMELO-CONCEPT.png alongside this document. It illustrates a proposed page-plus-chat layout only. During implementation, keep a reviewed visual record for browser, chat, approvals, work queue, knowledge, meetings and settings at agreed window sizes. Compare functional states, reading order and usable space; never use screenshot similarity as a substitute for behavior or accessibility acceptance.
