# Pomelo — feature contracts

Status: proposed acceptance checklist. All rows are pending real implementation evidence. IDs are the scope baseline; related rows may share code. Sources remain on the research side. Qualifiers and release refinements are part of each contract. Proposed checks are our design, not observed outcomes.

## Browser and account foundation

### F001 — Desktop operating-system support

Required behavior: Documentation describes installable desktop software for Windows and macOS.

Qualification: Documented availability; no runtime or version support verified.

Proposed check: Install a signed preview on each approved operating-system version and open a real website.

Stage: S2 Windows preview; S7-S8 macOS/full platform proof. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F002 — Internal destination routing

Required behavior: Address-bar destinations reach account, team, library, reusable workflows, skills, meetings and automation management; generic settings opens account settings.

Qualification: Routes establish navigation entry points rather than separate underlying capabilities.

Proposed check: Resolve every planned internal destination, preserve browser back behavior, and handle an unknown route safely.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Documented routes cover browser pages, library, settings, workflows, team/billing anchors, recording filter and parameterized automation screens. Source scheme is vendor-specific; Pomelo needs its own route names rather than copied branding. Check: Maintain one deduplicated semantic destination map and test every approved deep link.

Additional qualified behavior: Route inventory includes downloads, bookmarks, extensions, profiles/import, theme/tab layout/bookmarks visibility, search, default browser, passwords, save behavior, privacy and storage. Route listing proves destinations, not every detail of underlying capabilities. Check: Map to capabilities extracted elsewhere and flag unsupported control details.

### F003 — Keyboard and toolbar access to preferences

Required behavior: Preferences can be opened from the toolbar, address bar, or primary-modifier plus comma.

Qualification: Shortcut behavior can depend on focused surface.

Proposed check: On Windows verify Ctrl+, from page, toolbar and chat focus opens the intended preferences.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F005 — Onboarding task checklist

Required behavior: A fresh-chat entry page may offer a setup checklist.

Qualification: Conditional on availability; not guaranteed for every install.

Proposed check: For an eligible fresh profile verify checklist progress; document absence otherwise.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F008 — Verified account-email change

Required behavior: Account email changes use a six-digit verification step and then sign out all devices.

Qualification: A linked Google identity remains linked; account behavior not tested.

Proposed check: Change a test account address, reject incorrect code, then verify all sessions require sign-in with updated address.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F009 — Account session exit

Required behavior: Users can end their signed-in account session from account preferences.

Qualification: No selective-device session control described.

Proposed check: Sign out a test profile and verify protected account content requires authentication.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F014 — Horizontal and vertical tab arrangement

Required behavior: Users can select horizontal tabs or a sidebar arrangement and switch layouts with primary-modifier plus Shift+S.

Qualification: Vertical layout has additional sidebar destinations.

Proposed check: Switch layouts without losing open tabs; verify Windows Ctrl+Shift+S and saved preference.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F015 — Vertical tab panel visibility

Required behavior: The vertical-tab panel can be toggled with primary-modifier plus S.

Qualification: Shortcut applies to the vertical layout.

Proposed check: Verify Ctrl+S toggles that panel in vertical mode and document interaction with ordinary page-save behavior.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F016 — Browser tab lifecycle

Required behavior: Tabs can be created, closed and reopened after closure.

Qualification: Windows shortcuts are Ctrl+T, Ctrl+W and Ctrl+Shift+T; focus can affect shortcuts.

Proposed check: Open two real sites, close and reopen one through shortcuts, and verify restored address and intended tab state.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F017 — Browser window lifecycle

Required behavior: Normal and private windows can be created and windows closed.

Qualification: Windows shortcuts use Ctrl+N, Ctrl+Shift+N and Ctrl+Shift+W; private-mode retention details are not established here.

Proposed check: Create normal/private windows, close the intended window, and verify the declared private-data retention policy separately.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F018 — Address-bar navigation and search

Required behavior: The browser exposes ordinary address-bar search and a focus shortcut.

Qualification: Search provider is configurable elsewhere; autocomplete details are limited.

Proposed check: Use Ctrl+L to enter an HTTPS address and a search phrase; verify expected destination and configured engine.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F019 — In-page text lookup

Required behavior: A standard page-find keyboard route is documented.

Qualification: Search scope and PDF support are not specified.

Proposed check: Use Ctrl+F on a page with repeated text and verify result traversal without changing tabs.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F020 — Current-tab address copying

Required behavior: A keyboard shortcut copies the current tab address.

Qualification: Windows route is Ctrl+Shift+C; focused surface may matter.

Proposed check: Copy from page and chat focus and verify the current intended tab URL is placed on clipboard.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F021 — Page print entry

Required behavior: A print shortcut is documented using primary-modifier plus Shift+P.

Qualification: This differs from some conventional browser shortcuts; print-preview options not described.

Proposed check: Verify Windows Ctrl+Shift+P reaches printing for the intended page and cancellation leaves browsing intact.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F022 — Recent-destination switching

Required behavior: Ctrl+Tab and Ctrl+Shift+Tab navigate recent activity; the vertical layout may include visited application destinations alongside tabs.

Qualification: Not documented as strictly tab-strip order.

Proposed check: Open tabs and internal destinations, verify recent ordering, reverse traversal and no unintended navigation.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Recency tab switcher and sequential shortcuts coexist; chat history supports keyboard selection; find-on-page, tab restoration and mouse back/forward are supported. Historical cross-platform claims with platform-specific shortcuts. Check: EXTRAPOLATED: alternate three tabs, test recency versus sequential order and restore a closed tab to its original window.

### F026 — Bookmark creation shortcut

Required behavior: The primary-modifier plus D route adds or removes a bookmark.

Qualification: Bookmark folder selection behavior not specified by the shortcut page.

Proposed check: Use Ctrl+D on a test page, verify bookmark creation, then remove only the synthetic bookmark.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F027 — Bookmark organization and lookup

Required behavior: A manager supports folders and search; tab context menus can place tabs in bookmark folders.

Qualification: Windows manager shortcut is Ctrl+Shift+O.

Proposed check: Create a synthetic folder, bookmark a tab into it, search it and reopen the intended page.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Passwords are grouped by site, searchable and editable, with autofill/save/strong-password options; bookmarks support search by title/URL, folders, rename, drag ordering and direct opening. October 8 states password viewing/editing on Windows and Linux too; actual app distribution support elsewhere differs. Research never reveals credentials. Check: EXTRAPOLATED: use disposable test logins and bookmarks to verify grouping, search, folder organization and settings without exposing real credentials.

### F028 — Bookmark bar display policy

Required behavior: The bookmarks bar can remain visible, appear only on the new-page screen, or stay hidden.

Qualification: Per-profile/sync behavior of this particular preference is not specified.

Proposed check: Verify all three visibility policies across ordinary and new-page tabs.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F031 — Light, dark and system appearance

Required behavior: Users can choose explicit light/dark appearance or follow the system setting.

Qualification: Operating-system theme support is not runtime-verified.

Proposed check: Verify all appearance modes and system transition with readable contrast.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F032 — Default search-provider selection

Required behavior: Search preferences let users choose the default search engine.

Qualification: Available engine catalog is unspecified.

Proposed check: Select an approved test engine and confirm a new omnibox search uses it.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F033 — System default-browser opt-in

Required behavior: Preferences offer making the application the destination for links opened by other apps.

Qualification: OS-level confirmation and implementation details unspecified.

Proposed check: After explicit opt-in, open HTTP and HTTPS links from another application on cold and warm launch.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F034 — Saved-password management

Required behavior: Browser preferences include management of saved website passwords.

Qualification: Protected password access can require computer authentication; this extraction does not authorize reading passwords.

Proposed check: Use disposable credentials to test save/fill and OS-auth protection without revealing real secrets.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Passwords are grouped by site, searchable and editable, with autofill/save/strong-password options; bookmarks support search by title/URL, folders, rename, drag ordering and direct opening. October 8 states password viewing/editing on Windows and Linux too; actual app distribution support elsewhere differs. Research never reveals credentials. Check: EXTRAPOLATED: use disposable test logins and bookmarks to verify grouping, search, folder organization and settings without exposing real credentials.

### F035 — Automatic video floating playback

Required behavior: Playing YouTube video can enter a floating player when switching tabs; the preference is documented as enabled initially and synced across devices.

Qualification: Changing windows alone does not trigger it; source does not promise every video/provider.

Proposed check: Switch tabs and windows with test video; verify trigger difference, disable behavior and preference sync.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F037 — Bookmark migration

Required behavior: Bookmarks can be imported from supported browser profiles.

Qualification: Source/platform dependent.

Proposed check: Import a synthetic hierarchy and compare bookmark URLs, names and folder nesting.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F038 — Browsing-history migration

Required behavior: History import can preserve prior browsing recall and assist address-bar suggestions.

Qualification: Source/platform dependent; suggestion quality is not guaranteed.

Proposed check: Import known test visits and verify intended history records and search behavior.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F039 — Password migration

Required behavior: Saved credential import may access OS secure storage and can skip unavailable protected records while importing other categories.

Qualification: Requires permission; Firefox primary-password protection blocks this import route; Safari requires a user-exported CSV.

Proposed check: With disposable credentials test authorized success, protected-source denial and accurate skipped-data reporting.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F040 — Cookie migration

Required behavior: Import may copy cookies to help continue signed-in sessions.

Qualification: Encryption and session compatibility vary; reauthentication can still be required.

Proposed check: Migrate synthetic site cookies and confirm both supported preservation and clear reporting of unsupported cases.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F041 — Open-tab migration

Required behavior: Supported sources can provide current open tabs.

Qualification: Local browser data availability and source implementation determine support.

Proposed check: Import a known local tab set, compare URLs/order where promised and identify skipped entries.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F042 — Source-browser migration coverage

Required behavior: Sources include Chromium-family browsers, Safari, Firefox, Zen and Arc.

Qualification: Catalog is platform/local-data dependent, not universal compatibility.

Proposed check: Build a matrix of supported operating system, source version and category; mark unsupported combinations explicitly.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F044 — Protected-import consent and waiting

Required behavior: On macOS, protected-source access is explained before an OS secure-storage prompt and progress waits for its completion.

Qualification: Mac-only flow for named Chromium-family sources; source credentials never need to appear in application output.

Proposed check: Using disposable source data, verify explained consent, waiting state and no credential logging.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F045 — Protected-import retry and partial completion

Required behavior: A stalled, denied, timed-out or unavailable protected import can be retried, cancelled or continued without protected data.

Qualification: Protected cookies/passwords can be skipped; some source databases may be locked while their browser runs.

Proposed check: Simulate denial/timeout/lock and verify no freeze, intact source and truthful partial summary.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F046 — Extension store installation

Required behavior: The browser can install extensions from the Chrome Web Store.

Qualification: Compatibility is conditional; this is the target vendor's documented behavior, not a guarantee for Pomelo/Electron.

Proposed check: Install an approved test extension and exercise its essential workflow on the packaged candidate.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Migration brings bookmarks, passwords, history and extensions; releases name Safari, Edge, Firefox and Zen fixes. Most Chrome Web Store extensions are claimed to work. Current marketing/latest retrospective support extensions; most is not all. Browser/OS-specific import support needs verification. Check: EXTRAPOLATED: import a harmless test profile and install a compatible sample extension; verify counts, preserved folders and explicit unsupported cases.

### F047 — Extension compatibility warning and blocking

Required behavior: Extensions outside a curated set can show a compatibility note; known incompatible ones can be blocked.

Qualification: Curated coverage and exact blocked list unspecified.

Proposed check: Test one approved compatible extension, one unreviewed example and one deliberately blocked synthetic case.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F048 — Installed-extension search and removal

Required behavior: Extension preferences list installed extensions with search and removal controls.

Qualification: Removal is a destructive action for real user data; extraction only.

Proposed check: Find a test extension by name, remove only a disposable one and verify it no longer executes.

Stage: S2. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

### F052 — Per-download destination prompts

Required behavior: Users can request a save dialog for website downloads.

Qualification: Agent-controlled downloads may bypass these prompts; do not imply a global download-approval policy.

Proposed check: Verify ordinary-tab save prompting and separately report the agent-download exception.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F230 — Default settings redirect

Required behavior: Opening generic settings leads to account settings by default.

Qualification: Documented.

Proposed check: Resolve generic settings and verify account destination.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F232 — Configurable assistant appearance

Required behavior: Users choose a assistant color and face or randomize its appearance.

Qualification: New in 1.0; latest retained release claim.

Proposed check: EXTRAPOLATED: change color and face, randomize, reload and verify the selected appearance persists without changing assistant knowledge.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F234 — Optional playful assistant space

Required behavior: A New Tab mode lets idle assistants wander and converse about their day, the user and visited sites.

Qualification: New in 1.0; requires selecting the playful mode; ordinary task operation is separate.

Proposed check: EXTRAPOLATED: enable and exit an optional idle space; verify multiple assistants animate and produce contextual interactions without starting work.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F235 — Direct avatar interactions and task selection

Required behavior: Clicking an idle assistant selects it for work; assistants can be picked up, tossed and given pointer-triggered headpats.

Qualification: New in 1.0 playful mode.

Proposed check: EXTRAPOLATED: click, drag/release and hover-interact with a assistant; verify work selection changes only on the documented selection gesture.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F241 — Floating browser task controller and handover

Required behavior: Users monitor controlled tabs and pause, stop or take over; previewed pages can be handed to the user and returned to the assistant.

Qualification: Marketing and historical release claims; older Desktop/Activity/Compact view names may be obsolete.

Proposed check: EXTRAPOLATED: take over an agent-controlled page, interact, hand it back, then stop and verify browser input is released.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F242 — Sensitive action cancellation countdown

Required behavior: When always-ask is disabled for an app, sensitive actions show an eight-second countdown with cancellation.

Qualification: Historical March 5 release claim; conditional on disabled always-ask policy.

Proposed check: After an actual owner decision for the exact action, exercise the optional eight-second cancellable delay on a harmless fixture. Countdown expiry alone must never approve or dispatch a consequential action.

Stage: S4. Disposition: SAFETY_ADAPTATION. Our proposed context-sharing consent or stricter consequential-action approval is deliberately stronger than the documented default. Review the adaptation; it is not credited as exact behavior parity.

### F244 — Automatic task retry and resumable parallel work

Required behavior: Interrupted chats recover after restart; failed work can auto-retry or rerun individual tool calls. Running helpers reappear in a Resume All banner.

Qualification: Historical release claims; no universal guarantee that all actions are safe to repeat.

Proposed check: EXTRAPOLATED: interrupt a read-only parallel job, restart and resume it; rerun one failed step without duplicating completed side effects.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F247 — Rich links and inline content previews

Required behavior: Links preview destination URLs and rich title/description/image/favicon data; page, file, skill, image and video cards open quick previews dismissed by Escape or outside click.

Qualification: Historical release claims; previews need not expose private content before authorization.

Proposed check: EXTRAPOLATED: preview each supported content class, dismiss it and verify the original chat/page position is preserved.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F248 — Named collapsible tab groups

Required behavior: Tab groups have names/colors, drag/drop membership, collapse, icon previews and hover lists with individual close actions; groups and pinned tabs survive restarts.

Qualification: Historical release claims; not just appearance metadata.

Proposed check: EXTRAPOLATED: group tabs, collapse, inspect hover list, move one tab out and restart to verify retained grouping and pinned state.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F249 — Split browsing and movable live tabs

Required behavior: Two live pages share a window; a picker or drag/drop creates the pair. Controls swap sides, reset equal widths or separate tabs; tabs can pop into windows without reloading.

Qualification: Latest retrospective reaffirms split tabs. U04 Mac-only side-drop was historical; U09 describes later controls without that qualifier.

Proposed check: EXTRAPOLATED: pair two live pages, resize, swap, reset and detach one; verify forms/scroll positions survive without a forced reload.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F250 — Tab actions and isolated dialogs

Required behavior: Hover actions pin, bookmark, open in chat or copy URL; mute is available in context menus. Confirmation/alert dialogs are anchored to the originating tab.

Qualification: Historical release claims.

Proposed check: EXTRAPOLATED: use hover/context actions, then trigger a safe tab dialog and verify another tab remains usable.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F252 — Intelligent address suggestions and open-tab switching

Required behavior: Address input offers history/autocomplete, learns selected suggestions, offers existing-tab switches, preserves edits, recognizes localhost and searches phrases containing spaces.

Qualification: Historical release claims; no requirement to reproduce target ranking logic.

Proposed check: EXTRAPOLATED: type a visited URL, an open page title, localhost and a phrase with spaces; verify correct navigation and editable suggestions.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F253 — Native passkeys and multistep autofill

Required behavior: Windows passkeys and Mac WebAuthn/Touch ID/iCloud Keychain are supported; autofill handles username-then-password flows and popup windows.

Qualification: Historical platform-specific release claims; iCloud integration is specifically Mac.

Proposed check: EXTRAPOLATED: use a nonproduction WebAuthn test site on each supported OS and verify native authentication plus a two-step autofill flow.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F255 — Browser safety compatibility and resource management

Required behavior: Popup blocking, visible URL bars for popup credentials, certificate block updates, current engine compatibility and background-tab resource pausing are described.

Qualification: Historical release claims; vendor performance percentages are not independent measurements or builder thresholds.

Proposed check: EXTRAPOLATED: verify popup origin visibility and blocked unsafe test content, then measure background tab resource use without reproducing vendor comparative percentages.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F283 — Live previews in screen-sharing selection

Required behavior: The screen-share picker presents live tab previews to help the user choose the intended surface.

Qualification: Historical release claim; permission and sensitive-content exclusions still require explicit design and platform tests.

Proposed check: With harmless fixture tabs, open the authorized share picker and verify the previews match the live candidate tabs; cancel selection without starting capture or sharing.

Stage: S2. Disposition: REQUIRED. Required product capability; staged, not accepted.

## Chat and agent work

### F004 — Product-aware assistant help

Required behavior: An assistant can consult an integrated product-help knowledge source.

Qualification: The integrated help is maintained separately from the public website and may differ in wording or freshness.

Proposed check: Ask a product question and confirm a cited current help result; surface conflicting documentation.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: assistants have a separately maintained internal app-help source. May differ from public docs; current controls/support resolve discrepancies. Check: Ask product-help question and inspect cited help provenance instead of claiming identical documentation.

### F006 — Persistent onboarding persona choice

Required behavior: A randomly chosen assistant persists through sign-in and naming and can be replaced or customized; interrupted setup restores the choice.

Qualification: Received assistants are added rather than replacing the personal assistant.

Proposed check: Interrupt and reopen setup; verify chosen assistant remains and an added shared assistant does not replace it.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F023 — Unified tab and chat lookup

Required behavior: A search surface finds open/recent tabs, conversations and sidebar history, with togglable type filters.

Qualification: Windows entry is Ctrl+Shift+A; result completeness is not guaranteed.

Proposed check: Search known tab and chat titles, apply/release type filters, and open correct results.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F024 — Integrated chat panel

Required behavior: A browser-adjacent panel starts chats, revisits conversations and opens assistant work.

Qualification: Windows visibility shortcut is Ctrl+E.

Proposed check: Toggle with Ctrl+E while browsing, reopen a prior chat and verify the website remains available.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F063 — Cross-client conversation restoration

Required behavior: Conversation history is associated with the account and restored on signed-in clients.

Qualification: Titles/light metadata are stored separately from encrypted detailed session data.

Proposed check: Create a test conversation, sign in a second approved client and verify restoration and account isolation.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Chats/content sync to the product account, encrypted before storage, and can be continued on another computer. Latest retrospective reaffirms; mobile and continued work with a closed computer remain future ambitions in U02. Check: EXTRAPOLATED: continue the same test chat from two devices and verify stored content confidentiality and conflict behavior against a documented design.

### F065 — Local-index conversation search

Required behavior: Search finds conversation titles and text indexed on the current device.

Qualification: Older conversations can be delayed until local indexing completes.

Proposed check: Search a recent and restored old conversation, observe indexing state and avoid false empty-history conclusions.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: History supports content search with highlights, partial words, renamed/edited messages, assistant filters and unread/needs-user/automation filters; layouts provide overlay previews or a dedicated sidebar page. Historical releases through October 21; layout-specific presentation. Check: EXTRAPOLATED: find an edited conversation by partial text, filter by assistant and unread state, and preview it without losing the active page.

### F066 — Assistant persona customization

Required behavior: Assistants can have distinct instructions, personality and visual identity.

Qualification: This does not isolate built-in connected-app accounts.

Proposed check: Create two synthetic personas and verify their distinct instructions and appearance while showing account-level integration scope.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F072 — Queued conversation follow-ups

Required behavior: Messages sent during a response form a per-chat FIFO queue with short previews and item-specific attachments and context.

Qualification: The active item leaves the visible queue; other chats retain independent queues.

Proposed check: Queue three distinct messages in two chats and verify order, context ownership and preview removal on start.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Users can comment while work runs, edit a queued message without moving its queue position and answer grouped questions one at a time. Historical release claims; mid-task feedback should not silently terminate the run. Check: EXTRAPOLATED: edit the second queued instruction and send feedback during work; verify order is preserved and the active run continues.

### F073 — Prioritized queued interruption

Required behavior: A queued item can be promoted to run next, stopping the current response while retaining other queued messages.

Qualification: Interruption is documented; rollback of prior external effects is not.

Proposed check: Promote the final queued item and verify interruption, new order and truthful partial-work state.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F074 — Immediate send during generation

Required behavior: Primary-modifier plus Enter stops the response and immediately sends typed input; empty input with queued work can use Enter to run the next item.

Qualification: Windows/Linux route is Ctrl+Enter; existing external actions are not described as reversible.

Proposed check: Verify typed immediate send and empty-input queue advance, retaining untouched queued items.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F075 — Attachment ingestion methods

Required behavior: Chat accepts pasted images/files, dropped files/folders and picker-selected files.

Qualification: Attachments are copied into chat storage before sending; folder support is expressly described.

Proposed check: Send synthetic files through each supported route and verify stored copies are accessible to the intended conversation only.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F076 — Attachment preparation recovery

Required behavior: A fresh chat waits for attachment copying; failed preparation preserves draft and attachments for retry or removal.

Qualification: Failure behavior is documented, not a guarantee of every file format.

Proposed check: Force a copy failure and verify draft retention, clear error, retry and removal without duplicate submission.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F077 — Automatic visible-page context

Required behavior: Sending with chat next to a webpage includes that visible page's context; split view includes both visible pages.

Qualification: This is automatic in the documented target, differing from a proposed explicit-sharing design.

Proposed check: After informed context-policy opt-in, verify the allowed visible page and both allowed split panes are included, blocked context is excluded, provider/context are visible before send and opt-out stops inclusion.

Stage: S3. Disposition: SAFETY_ADAPTATION. Our proposed context-sharing consent or stricter consequential-action approval is deliberately stronger than the documented default. Review the adaptation; it is not credited as exact behavior parity.

### F078 — Focused-pane selected-text context

Required behavior: Selected text from the focused split pane enters the chat draft; page-context indicators appear after send.

Qualification: Timing differs between selected text and current-page indicators.

Proposed check: Select different text in each pane and verify focused selection and post-send source attribution.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F079 — Mentioned app, tab and conversation context

Required behavior: An at-sign picker references apps, top-level website tabs and whole chats by current title.

Qualification: Pages opened inside a chat remain within that chat rather than appearing as independent top-level choices.

Proposed check: Mention renamed chats and top-level tabs; verify nested-page exclusion and resolved source identity.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F080 — Assistant choice and cycling

Required behavior: A picker selects the responding assistant; primary-modifier plus period cycles forward and Shift reverses.

Qualification: Applies from chat input; shortcut focus matters.

Proposed check: Verify Windows Ctrl+. and Ctrl+Shift+. choose the intended assistant before sending.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F081 — Experimental planning-only discussion mode

Required behavior: A feature-gated mode discusses context/options and creates or revises the chat plan while execution is held.

Qualification: Experimental and initially off; the assistant may enable it for difficult work. It may inspect context while execution is held.

Proposed check: Enable in a test profile, confirm planning/context inspection while consequential execution remains blocked, and verify off-by-default new chats.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F083 — Browser-reading agent work

Required behavior: Agents can search, open/navigate tabs and read/compare pages.

Qualification: Depends on tools and permission availability.

Proposed check: Run a controlled multi-page comparison, verify visited sources and distinguish unsupported sites.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F085 — Agent code execution

Required behavior: The run overview includes code execution among possible actions.

Qualification: Tool availability and permission restrictions unspecified in this page.

Proposed check: Use a harmless deterministic task in the approved sandbox and verify result, denial paths and trace visibility.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F086 — Visible execution audit trail

Required behavior: A trace can display searches, tools, file operations, browser actions, delegated activity, feedback and plan progress.

Qualification: Source does not promise complete immutable logs or rollback.

Proposed check: Run controlled actions and compare actual actions with visible trace entries and source links.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Agent steps, tools and results form a readable vertical trail; related work is grouped, expandable details and collapsible reasoning are shown. Historical release claims; does not establish disclosure of private model chain-of-thought. Check: EXTRAPOLATED: complete a multi-tool task and inspect grouped progress, outcomes and expandable explanations without relying on hidden reasoning.

### F087 — External-result deep links

Required behavior: Completed app actions may include a link to the created or updated external item.

Qualification: Conditional on action/integration; not every tool result has a link.

Proposed check: Create a synthetic approved item and verify its result link opens the exact item.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F088 — Scoped helper-agent delegation

Required behavior: A main assistant can spawn helpers for scoped investigations with separate session workspaces and plans.

Qualification: Research examples do not establish automatic decomposition or a fixed concurrency limit.

Proposed check: Delegate two isolated synthetic subtasks and verify independent plans/results and parent attribution.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: assistants plan before acting, distribute independent work to helpers and collect several URLs together; latest release reaffirms this capability. Latest retrospective reaffirmation; speed/credit improvement claims are comparative marketing, not acceptance thresholds. Check: EXTRAPOLATED: perform independent read-only subtasks in parallel and show one integrated result with source provenance and per-helper progress.

### F089 — Human feedback requests

Required behavior: Main agents/helpers can request decisions, missing data or approval in chat and related panels.

Qualification: UI placement varies; no guarantee every action prompts.

Proposed check: Trigger a deliberate missing-input request and verify work waits at the required boundary and resumes from supplied input.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Questions, action approvals and requests for website help appear together; users can switch/collapse requests, edit app actions before approval and answer grouped questions. October release claims; website checks require user assistance rather than automatic CAPTCHA solving. Check: EXTRAPOLATED: create simultaneous approval and question requests; switch between them and edit a harmless action before approving it.

### F090 — Interrupted-helper recovery

Required behavior: An interrupted helper can show a notice to reopen or resume its thread.

Qualification: Conditional recovery notice; browser/app state must be reviewed before continuation.

Proposed check: Interrupt a controlled helper, reopen it and verify retained context and no silent repeated external action.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F091 — Durable session plan source

Required behavior: One canonical markdown plan belongs to each chat workspace; helpers can have their own plans.

Qualification: A plan-first prompt is guidance, not an independent execution guarantee.

Proposed check: Write/update a synthetic plan and verify one canonical source per session and separate helper plans.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F092 — Structured task-state rendering

Required behavior: The application parses structured tasks from the plan, streams progress and reparses successful writes/edits.

Qualification: Common states are waiting, active and finished; exact parser format is an implementation detail, not a separate feature.

Proposed check: Update synthetic task states and verify timely UI changes, invalid-format handling and no duplicate tasks.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F093 — Plan and tool-progress inspection

Required behavior: The chat can show plan summary, task state, helper progress, related tool activity and a link to the full plan.

Qualification: Display is conditional; source does not mandate every element always visible.

Proposed check: Run a multi-step synthetic plan and verify summary, full-file link and relevant progress agree.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F101 — Model and reasoning configuration

Required behavior: Assistant model settings affect runtime choice; planning preserves model/effort and adaptive thinking can be used when supported.

Qualification: These documents do not establish arbitrary provider selection or own-key/subscription support.

Proposed check: Change an eligible runtime model/effort and verify actual selected backend/capability; reject unavailable choices.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Each chat retains separate mode/effort settings; paid plans can configure each assistant's model and thinking effort per mode; earlier releases describe model grouping and provider failover. Paid-plan customization in U09; per-chat setting isolation and automatic failover are historical claims. Check: EXTRAPOLATED: change one chat's effort without affecting another; configure a paid assistant's modes; simulate an unavailable provider and surface the fallback.

### F224 — Deferred empty-chat persistence

Required behavior: An empty conversation is not saved to disk before its first message.

Qualification: Documented.

Proposed check: Create empty chat and compare persistence before/after first message.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F233 — Prepared role templates and introductory personalization

Required behavior: A catalog of nine prepared assistants includes job knowledge, skills and automations; the first conversation learns the user's workflow. Custom assistants are also advertised.

Qualification: Latest release/catalog claim; exact catalog contents may change.

Proposed check: EXTRAPOLATED: create a custom assistant and one from a generic template; verify template skills and automations are included and initial personalization is editable.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F236 — Current three-level chat effort modes

Required behavior: Efficient minimizes time/credits, Default provides a middle ground and Expert tackles harder tasks. New chats and automations start in Default.

Qualification: October 21 claim supersedes historical Plan/Smart/Fast naming. Efficient and Default are on every plan; Expert entitlement is not fully specified here.

Proposed check: EXTRAPOLATED: new chats/automations default to the middle mode, expose three effort levels and correctly enforce entitlements.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F238 — Chat duplication and rename

Required behavior: History actions rename chats or duplicate an existing conversation to try another approach without losing original context.

Qualification: Historical release claims.

Proposed check: EXTRAPOLATED: duplicate a conversation, change the duplicate and verify original content and name remain unchanged.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F239 — Draft restoration and attachment preservation

Required behavior: Unsent drafts restore with attachments; mixed image/link pastes, large files, PDFs and SVGs are handled, and long pasted text folds into expandable chips.

Qualification: Historical release/fix claims; exact size limits UNKNOWN.

Proposed check: EXTRAPOLATED: switch away from an unsent text-plus-file draft, restart, return and inspect intact text and attachments including a folded long paste.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F240 — Global task control center

Required behavior: A global overview lists running tasks and marks new replies or tasks waiting for the user; questions or blocked website checks can be handled inline.

Qualification: Historical release claims; exact colors and UI placement are not functional requirements.

Proposed check: EXTRAPOLATED: run two tasks, block one on a user question and verify overview status and inline response route to the correct task.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F243 — Reliable stop and visible failure explanations

Required behavior: Stop/cancel ends generation and tool execution; stopped state is shown correctly. Failures retain explanations and service problems offer reporting.

Qualification: Historical release/fix claims; no runtime proof.

Proposed check: EXTRAPOLATED: cancel a long test task, verify no tools continue, then trigger a recoverable error and inspect its durable explanation.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F245 — Browser session task execution

Required behavior: An outcome request can span open or logged-in sites, tab navigation, page reading and form interaction, using a connected app when suitable, then returning reports or structured work.

Qualification: Current unconditional marketing claim; does not prove every website works or authorize bypassing controls.

Proposed check: EXTRAPOLATED: execute a permissioned two-site research task in a signed-in test session and return a cited table plus an approval-gated draft.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F246 — assistant-owned pages attached to conversations

Required behavior: assistant-opened pages live inside their chat instead of the normal tab bar; links open beside the conversation and retain context. Agent-used tabs show an ownership indicator.

Qualification: August/October release claims; ordinary user tabs remain separately managed.

Proposed check: EXTRAPOLATED: open pages from two task chats and verify ownership, context and takeover return to the corresponding conversation.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F256 — Chat zoom, table reading and scroll controls

Required behavior: Chat supports persistent zoom, readable wide tables and returning to the latest output without disrupting reading.

Qualification: Historical release claims; no formal accessibility certification asserted.

Proposed check: EXTRAPOLATED: toggle themes, zoom chat, read a wide table and receive messages while scrolled up; verify focus and reading position remain stable.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F279 — Keep-awake assistance and restart progress

Required behavior: Mac Stay Awake prevents sleep during long tasks; app updates show restart progress on macOS/Windows, and sandbox recovery after sleep is described.

Qualification: Historical release claims; Stay Awake is specifically Mac and does not establish closed-device execution.

Proposed check: EXTRAPOLATED: verify a supported keep-awake setting during a test run and clear progress/restoration through a controlled app restart.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F282 — Inactive chat-tab cleanup with retained history

Required behavior: Inactive chat tabs can close automatically after 48 hours while their conversations remain available in chat history.

Qualification: Historical October release behavior; closing a tab is distinct from erasing a conversation.

Proposed check: Use a controlled clock and synthetic chat tabs to cross the 48-hour inactivity condition; verify tabs close while complete history remains recoverable and unrelated active tabs remain open.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F284 — Long-conversation capacity warning

Required behavior: Long conversations warn the user before practical context or quality/performance limits become problematic.

Qualification: Historical release claim; exact trigger, context limit and quality impact depend on the active engine and are not a universal accuracy guarantee.

Proposed check: Use a bounded synthetic conversation and configured provider limits to trigger a clear warning, preserve the draft/history and offer an explicit new-chat or summarization path without silent data loss.

Stage: S3. Disposition: REQUIRED. Required product capability; staged, not accepted.

## Sharing and teams

### F007 — Recoverable shared-assistant onboarding

Required behavior: A failed received-assistant load can be retried or bypassed without discarding its invitation; changed profiles can be reviewed again.

Qualification: Only applies to received assistants and changed profiles.

Proposed check: Simulate an unavailable received assistant, retry later, and confirm invitation and personal assistant survive.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F068 — Assistant sharing recipients

Required behavior: Assistants can be shared with an individual user, selected team members or an entire team.

Qualification: Direct same-team email shares auto-accept; external shares can require recipient acceptance.

Proposed check: Share synthetic assistants to test recipient scopes and verify automatic versus pending acceptance correctly.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Teams share synced folders; assistants can be shared with the team or specific members, including instructions, memories, observations and skills, while personal chat history stays private. Latest release reaffirms sharing; granular contents/privacy semantics are from U03. Check: EXTRAPOLATED: share a test assistant and folder with one colleague, verify knowledge sync and prove private chat history remains inaccessible.

### F069 — Shared assistant content boundary

Required behavior: Sharing includes synced instructions, memories, observations, files and assistant skills but excludes chat history.

Qualification: Recipients start their own conversations.

Proposed check: Share synthetic assistant and verify included content plus absence of owner's private chat history.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F070 — Shared assistant edit grants

Required behavior: Current sharing gives recipients edit access until sharing ends.

Qualification: No read-only sharing tier is documented here.

Proposed check: Verify recipient can edit allowed assistant configuration and loses future access when sharing is stopped.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Shared assistants permit recipients to change configuration, memories and skills until sharing stops. Current sharing grants edit access; no viewer-only assistant mode documented. Check: Verify recipient edit ability and removal of sharing access.

### F111 — Pending file-share inbox

Required behavior: Recipients can inspect unaccepted file invitations.

Qualification: Non-team shares can require acceptance.

Proposed check: Show pending invitations and accept or decline one.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F119 — Memory sharing disclosure

Required behavior: Sharing a assistant exposes its synchronized folder, including memories.

Qualification: Recipients can edit shared assistant state.

Proposed check: Show scope before sharing and verify a recipient can access only that shared folder.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F172 — Live public file and folder sharing

Required behavior: Synchronized files, folders, reports and HTML outputs can receive a copied public link.

Qualification: Anyone holding link can view; later edits/new folder files propagate with delay.

Proposed check: Share harmless test data and verify a later update becomes visible.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Workspace files can have viewable share links for recipients without product login. Historical release claim; permission expiry/revocation details UNKNOWN. Check: EXTRAPOLATED: create a share link for a harmless file and open it signed out; verify only the intentionally shared item is accessible.

### F173 — Public link revocation

Required behavior: A public link can be revoked for future access.

Qualification: Does not retract downloaded copies.

Proposed check: Revoke a test link and verify new access is denied.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F174 — Email-address file invitations

Required behavior: Files can be shared with named recipients by email.

Qualification: Sending remains outside current authorization.

Proposed check: In preview, prepare a recipient invitation without sending externally.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F175 — Team recipient suggestions

Required behavior: An invitation field can suggest team members by name/address.

Qualification: Team membership required.

Proposed check: Find a matching teammate suggestion and verify correct recipient selection.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F176 — Share acceptance policy

Required behavior: Team-to-team direct shares are accepted automatically; others may be accepted or declined, with a remembered always-accept preference.

Qualification: Prior preference may bypass non-team acceptance.

Proposed check: Test pending, declined, remembered, and same-team cases in controlled accounts.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F177 — File access roles and removal

Required behavior: Each recipient can be granted view or edit access and later removed.

Qualification: Documented.

Proposed check: Verify view cannot edit, editor can edit, and revoked recipient loses access.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F179 — Connected report delivery dialogs

Required behavior: Connected Slack and Gmail actions open a delivery dialog with the report attached.

Qualification: Requires connected app; opening dialog is distinct from sending.

Proposed check: Prepare both dialogs using test data and verify attachment without sending.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Reports export as styled PDFs, data tables export, document content exports to Google Docs, and final reports can be shared to Slack, Gmail or Outlook. Historical release claims; app sharing is capability evidence, not authorization to send during this task. Check: EXTRAPOLATED: export a sample report/table, inspect headings/lists/formatting and produce a reviewable draft for a supported sharing destination.

### F209 — Team creation

Required behavior: A user can name a team and optionally add members with roles during creation.

Qualification: Account and plan prerequisites unspecified.

Proposed check: Create a preview team and inspect resulting membership.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Team plans include invitations, user management, unified billing and distinguish personal top-ups from shared team credits; account/team pages show reset times, spending sources and seat upgrade requests. Historical/current account-page claims; no plan change or purchase performed. Check: EXTRAPOLATED: in a test tenant inspect member roles, seat requests and separate personal/team usage ledgers without making a payment.

### F210 — Member invitations and pending list

Required behavior: Team management sends email invitations and lists pending invitations with copyable join links.

Qualification: Recipient needs matching email identity; no external sending authorized here.

Proposed check: Prepare a preview invite and inspect pending/redeemable state.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F211 — Team role administration

Required behavior: Owner, administrator and member have differentiated management authority.

Qualification: Administrators cannot change their own role; owner alone handles portal/subscription and deletion.

Proposed check: Run role matrix checks for membership, billing and self-role changes.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F212 — Team renaming

Required behavior: Administrators and owners can change the team name.

Qualification: Role restricted.

Proposed check: Rename a preview team and verify member-visible update.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F217 — Team ownership transfer assistance

Required behavior: Billing ownership transfer is arranged through support.

Qualification: Not a documented self-serve transfer control.

Proposed check: Provide truthful support handoff rather than invent transfer button.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F218 — Team departure

Required behavior: A non-owner can leave a team.

Qualification: Owner departure requires other handling.

Proposed check: Verify non-owner departure and resulting workspace/credit access.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F219 — Owner-only team destruction

Required behavior: Owner can permanently remove a team after confirmation.

Qualification: Irreversible in source product; adaptation requires explicit decision and Amit approval.

Proposed check: Plan confirmation/authorization tests without deleting live data.

Stage: S7. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

### F220 — Cloud-synchronized shared workspace

Required behavior: Joining/creating a team provisions a separate workspace with read/write access for members and cloud sync.

Qualification: Personal files are not automatically included.

Proposed check: Verify member edits sync while private workspace remains private.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Teams share synced folders; assistants can be shared with the team or specific members, including instructions, memories, observations and skills, while personal chat history stays private. Latest release reaffirms sharing; granular contents/privacy semantics are from U03. Check: EXTRAPOLATED: share a test assistant and folder with one colleague, verify knowledge sync and prove private chat history remains inaccessible.

### F221 — Explicit team file use in conversation

Required behavior: assistants can use a named team's folders as task context and save outputs there.

Qualification: Multiple teams require disambiguation; quality remains task-dependent.

Proposed check: Name team/folder, inspect cited input and output destination.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

## Privacy, permissions and support

### F010 — Account deletion request

Required behavior: Account deletion is available through support; another page mentions an optional in-app deletion entry.

Qualification: Conditional in-app control; public pages differ in how they describe the route. Deletion is irreversible.

Proposed check: Document actual available route and confirmation safeguards using a disposable test account only.

Stage: S1-S4. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

### F011 — Device-local reset

Required behavior: A conditional reset removes local application data without deleting the remote account; unsynced files can be lost.

Qualification: Local reset control may be absent, requiring support.

Proposed check: With synthetic local data verify reset scope and retain remote account; show unsynced-data impact before confirmation.

Stage: S1-S4. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

### F049 — Extension permission inspection

Required behavior: Required extension permissions can be reviewed but not individually revoked.

Qualification: Distinct from assistant integration permissions.

Proposed check: Inspect a synthetic extension's required permissions and ensure the UI does not falsely offer revocation.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F050 — Optional extension permission revocation

Required behavior: Optional permissions and optional website origins can be revoked or cleared.

Qualification: Applies only to optional grants.

Proposed check: Grant then revoke a synthetic optional origin; verify its access actually stops while unrelated grants remain.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F051 — Download-directory selection and reset

Required behavior: Download preferences allow choosing a destination and restoring the standard downloads folder.

Qualification: Agent-generated files may also reside in session/workspace locations.

Proposed check: Save a synthetic download to a chosen folder, reset, and verify subsequent destination.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F054 — Ad and tracker blocking preference

Required behavior: Privacy preferences include an ad/tracker blocking toggle.

Qualification: Block-list coverage, accuracy and effectiveness unspecified.

Proposed check: Use a controlled test page to measure enabled/disabled behavior without claiming universal blocking.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F055 — Global cache-only cleanup

Required behavior: Cache cleanup removes cached content and service workers while retaining cookies and local site databases.

Qualification: It usually preserves sign-in but can disrupt offline content; preservation is not guaranteed.

Proposed check: Seed test cookie/database/cache/service worker, clear cache and inspect each expected retained/removed category.

Stage: S1-S4. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

Additional qualified behavior: Cache clearing also removes service workers while preserving cookies/local site databases. Pages may reload or lose cached offline resources. Check: Verify cookies survive cache cleanup using local fixtures.

### F056 — Global website-data cleanup

Required behavior: Broader cleanup removes cookies, local storage, IndexedDB, service workers and site caches.

Qualification: Can sign out websites and erase preferences; distinct from account deletion or local reset.

Proposed check: Seed synthetic storage categories, clear them, and verify remote account still exists.

Stage: S1-S4. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

Additional qualified behavior: Broader data clearing signs users out and can remove local preferences; per-site clear includes local databases and worker/cache storage. Destructive capability; do not execute on real user sites. Check: Verify documented categories on isolated preview origin.

### F057 — Per-site website-data cleanup

Required behavior: Site controls can clear one site's cookies, web storage, databases, workers and caches.

Qualification: Documentation additionally names WebSQL for site-specific clearing; do not assume current support solely from that listing.

Proposed check: Clear one synthetic origin and verify another origin's data remains intact.

Stage: S1-S4. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

### F058 — Per-site cache cleanup

Required behavior: One site's cache cleanup also removes its service workers.

Qualification: Offline content may require rebuilding.

Proposed check: Clear a synthetic site's cache and worker, preserving categories outside the declared cache scope.

Stage: S1-S4. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

### F059 — Website popup and device grants

Required behavior: Privacy/site preferences control popup/new-tab behavior and camera, microphone and other device permissions.

Qualification: Exact grant list and defaults are unspecified.

Proposed check: Verify per-origin allow/deny/revoke for a controlled popup, camera and microphone request.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F060 — Assistant action grant separation

Required behavior: Assistant app-tool permissions are separate from website and extension permissions.

Qualification: Not all reads/actions expose individual approval controls.

Proposed check: Demonstrate changing one permission family does not silently change another.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F061 — Generated-link safety handling

Required behavior: Chat navigation and rendered links have safety controls.

Qualification: No detection mechanism or guarantee against malicious links described.

Proposed check: Exercise controlled misleading, external and non-HTTPS chat links and verify declared handling.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F064 — Encrypted detailed chat persistence

Required behavior: Messages, drafts and detailed chat payloads are encrypted before being saved to vendor servers.

Qualification: Source does not establish end-to-end encryption, key custody, algorithm or encrypted metadata.

Proposed check: Define threat model and verify payload encryption independently; do not label it end-to-end without evidence.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Chats/content sync to the product account, encrypted before storage, and can be continued on another computer. Latest retrospective reaffirms; mobile and continued work with a closed computer remain future ambitions in U02. Check: EXTRAPOLATED: continue the same test chat from two devices and verify stored content confidentiality and conflict behavior against a documented design.

### F082 — Planning approval and exit paths

Required behavior: Users can approve execution from planning, leave planning without starting work, or choose an execution mode; planning preserves selected model and thinking effort.

Qualification: State stays with the chat draft; ordinary plan-first instructions are also documented.

Proposed check: Verify approve starts work, exit-without-start does not, and model/effort remain unchanged.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F094 — Permission prompting mode

Required behavior: A configurable mode requests approval for actions covered by approval controls unless a permission is already saved.

Qualification: Its name does not mean every action prompts; saved grants and some uncontrolled reads remain effective; folders are separate.

Proposed check: In the agreed strict mode verify supported consequential actions request fresh owner approval even when a weaker saved grant exists; off remains refused, and exact unsupported controls/grant scopes are disclosed.

Stage: S1-S4. Disposition: SAFETY_ADAPTATION. Our proposed context-sharing consent or stricter consequential-action approval is deliberately stronger than the documented default. Review the adaptation; it is not credited as exact behavior parity.

### F096 — Persistent and conversation-specific grants

Required behavior: Permanent integration permissions span conversations; chat approvals persist for that conversation after a response ends or its tab closes.

Qualification: Closing a tab or finishing a response does not revoke chat approvals.

Proposed check: Grant in test chat, close/reopen it, compare a new chat, then revoke permanent permission and verify scope.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Permanent action policy spans sessions; a conversation-specific allowance can survive returning to that conversation. Closing a tab or ending a response does not reset chat grants. Check: Resume a test chat and verify grant lifetime is accurately disclosed.

### F097 — Editable outbound-action review

Required behavior: Some action approval cards allow editing recipients, subject and body before execution.

Qualification: Gmail sends can include the account signature inside the editable body; not all actions have editable cards.

Proposed check: Using a non-sending test transport, edit all fields/signature and verify only the final approved payload would execute.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F098 — Local-folder grant requests

Required behavior: Agents can request access to task-relevant local folders; Windows grants are important for sandboxed file access.

Qualification: No sandbox architecture or precise enforcement guarantee established here.

Proposed check: Grant a disposable folder, deny a neighboring one and verify actual filesystem access boundaries.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Users approve a real local folder where assistants read, edit and create actual files; other paths remain outside access. Later release says folder access defaults to the current chat. Latest retrospective reaffirms local folder work; permission scope details from October 8. Check: EXTRAPOLATED: grant a temporary test folder, edit one file and verify access to a sibling folder and a different chat is denied.

### F223 — Large local-content cleanup

Required behavior: Storage settings can clear large local categories such as chat images or large conversations.

Qualification: Controls explicitly conditional on availability; Amit adaptation favors archive.

Proposed check: Inspect exposed categories and test only disposable preview data.

Stage: S1-S4. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

### F227 — Standalone diagnostics collector

Required behavior: Separate Windows/macOS utility saves a local report without automatically uploading.

Qualification: Not installed or executed here; capabilities are documented.

Proposed check: Plan disposable preview crash/startup capture and inspect saved local report.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F228 — Diagnostics crash/startup observation

Required behavior: Collector saves prior crash reports, observes or starts installed app, captures startup failures and ends without closing app.

Qualification: Windows guidance starts collector before reopening after unexpected exit.

Proposed check: Verify running, startup-failure and unexpected-exit cases in isolated environment.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F229 — Diagnostics local reveal and handoff

Required behavior: Completed collection can be revealed in file manager or manually attached to a private support exchange.

Qualification: Report may contain sensitive page/memory data and requires review.

Proposed check: Inspect output before any handoff; never automatically send.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F254 — Permissioned web hardware APIs

Required behavior: Web Serial, Bluetooth, HID and USB requests use site/OS permissions; video floating playback is covered separately.

Qualification: Historical release claims; site/OS permission requirements still apply.

Proposed check: EXTRAPOLATED: float a test video and verify a permissioned hardware API request is correctly granted or denied in a test environment.

Stage: S1-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F281 — Activity capture pause, export and entry controls

Required behavior: Where enabled, users pause/disable capture and view/export/remove entries or all activity memory. Private/incognito capture requires explicit confirmation for that session; disabling stops new entries but does not itself erase old ones.

Qualification: CONDITIONAL PRIVACY-ONLY; inherits all enablement and opt-in conditions. Ordinary chat/assistant memory is separate.

Proposed check: EXTRAPOLATED: only for an opted-in synthetic test, pause/disable, verify no new entries, export selected entries and verify private sessions remain excluded absent explicit confirmation.

Stage: S7. Disposition: CONDITIONAL_SCOPE. Described only conditionally in legal/privacy material. Availability, owner scope and safe implementation remain unresolved; do not enable or count as generally available parity.

## Usage and commercial controls

### F012 — Referral redemption

Required behavior: Account preferences can redeem invitation or referral codes.

Qualification: Bonus eligibility and credit amounts depend on the current program.

Proposed check: Test valid, invalid, expired and previously used codes without promising a bonus.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

Additional qualified behavior: Account/new-tab invite links or codes reward inviter and invitee with credits. Historical release claims; early invite limits differ and are not current requirements. Open-beta U13 no longer requires an invite code for access. Check: EXTRAPOLATED: in a test-only referral ledger verify one qualifying invitation produces each reward once without making signup gating depend on referrals.

### F013 — Referral link sharing preparation

Required behavior: An account can copy its own invitation link when the invitation section is available.

Qualification: Conditional program availability; copying is not sending.

Proposed check: Copy an eligible test invitation link and verify ownership and absence of automatic sending.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F099 — Usage-free ordinary browsing

Required behavior: Browsing websites without assistant help does not consume the vendor's AI credits.

Qualification: This is vendor accounting documentation, not a Pomelo pricing obligation.

Proposed check: Record balance around ordinary synthetic browsing and separate AI activity from browser traffic.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F100 — AI-operation usage accounting

Required behavior: Ordinary replies as well as research, app actions, automation and agent work can consume credits; model choice and request length influence use.

Qualification: Absence of a distinct agent block does not imply free chat; adaptive thinking depends on selected model.

Proposed check: Record per-chat usage for a simple response and multi-step test; do not infer exact cost solely from UI blocks.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F102 — Paying-account selection

Required behavior: Personal pays without team membership; one team pays first for members, and multi-team users can select the team for future account-wide work.

Qualification: Viewing a different team's preferences does not change the payer; balances retain ownership.

Proposed check: Using test accounting balances, switch payer and verify future usage attribution without moving credits.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

Additional qualified behavior: Multi-team users select the account that funds future work. Viewing a team does not switch payment; switching does not transfer balances. Check: Change paying selection and confirm subsequent ledger scope only.

### F103 — Eligible personal-credit fallback

Required behavior: When the selected team cannot cover work, eligible paid personal, top-up or bonus balances can be used automatically.

Qualification: Free personal allowance is excluded; another team's balance is not automatically spent.

Proposed check: Exhaust a simulated selected team balance, verify eligible fallback and exclusion of free/other-team funds.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

Additional qualified behavior: Selected team pays first; eligible personal paid credits may cover the remainder. Free personal allowance excluded; other teams never automatically fund it. Check: Exercise precedence with test balances and verify no unauthorized team fallback.

### F104 — Account and per-chat usage inspection

Required behavior: Account and web billing pages expose balances/refill information; chat content panels expose conversation usage and active short-term limit windows.

Qualification: Device/account entitlements not verified; labels should not imply one undifferentiated balance.

Proposed check: Compare synthetic account, payer and chat totals and display separate refill/limit information.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Account displays current plan, period/refill state, credit breakdown and currently spendable allowance. Allowance is not guaranteed work time; browsing without AI uses no credits. Check: Inspect balances and distinguish monthly allowance from currently usable credits.

### F105 — Spendable-versus-monthly balance distinction

Required behavior: Immediately usable credits can be below remaining monthly allowance during a short-term limit; recurring and extra balances have distinct ownership/expiry.

Qualification: Displayed payment order and refill times determine what can pay next.

Proposed check: Simulate remaining allowance under a temporary limit and verify no misleading fully-spendable total.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F106 — Prepaid credit persistence and ordering

Required behavior: Purchased extra credits survive month end and can pay during temporary limits; available included credits normally pay first.

Qualification: Bonuses and other extra balances can have different expiry; not all extras inherit purchased-credit rules.

Proposed check: Test a synthetic month boundary and limit window with different credit types; verify ordering and expiry independently.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

Additional qualified behavior: Available included credits normally precede top-ups; top-ups survive month end and can cover short-term rate-limited allowance. Top-ups do not reset or enlarge plan rate windows. Check: Validate ledger source selection using controlled synthetic accounting.

### F107 — Usage-limit exhaustion pause

Required behavior: When no eligible credits remain, work pauses until credits become available; team usage has no automatic metered overage.

Qualification: Future workflows and partial external actions may still require reconciliation; pause is not rollback.

Proposed check: Exhaust test credits mid-task, verify pause/no unauthorized overage and clean resumption.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Teams use prepaid sources; work pauses when no eligible credits remain. No automatic pay-as-you-go overage or overage-cap setting exists. Check: Exhaust test balances and verify pause rather than unapproved usage billing.

### F200 — Plan discovery and comparison

Required behavior: Account controls expose available plans, price, allowance, billing period and renewal information.

Qualification: No fixed prices guaranteed; preserve commercial scope in Pomelo plan even if BYOK adaptation.

Proposed check: Display plan terms and review before any purchase action.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F201 — Personal plan changes

Required behavior: Users can upgrade, downgrade or change billing interval after reviewing timing and payment.

Qualification: Unavailable while team membership exists; upgrades prorate immediately, some downgrades defer.

Proposed check: Model each transition and verify effective date and amount before confirmation.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F202 — Subscription cancellation flow

Required behavior: Cancellation records a reason, may present retention choices, and schedules free-plan downgrade.

Qualification: Existing paid access continues through current period; offers conditional.

Proposed check: Follow preview cancellation to review screen and verify deferred effective date.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F203 — Pending cancellation reversal

Required behavior: Users can retain the current plan before pending cancellation takes effect.

Qualification: Only pending cancellation.

Proposed check: Reverse test cancellation and verify subscription remains active.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F204 — Personal billing portal

Required behavior: A portal exposes payment methods, subscription management and past invoices.

Qualification: Earlier personal receipts remain accessible when applicable after joining a team.

Proposed check: Open mock/preview portal integration and verify correct account scope.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F205 — Manual prepaid credit purchase

Required behavior: Personal or authorized team buyers select preset or custom monetary amounts and review checkout.

Qualification: No purchases in this research; personal purchase unavailable while on team.

Proposed check: Validate amount/review flow without performing payment.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F206 — Automatic credit refill setup

Required behavior: Users choose refill amount and monthly spending ceiling; system derives the low-credit trigger.

Qualification: No independent threshold control is documented; team admins/owners manage team refills.

Proposed check: Inspect amount and cap; explicitly omit invented threshold setting.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F207 — Automatic refill activation and stop states

Required behavior: Refills activate after necessary payment succeeds, pause at monthly cap, and turn off on missing/declined payment with explanation.

Qualification: Personal refills do not trigger during team membership.

Proposed check: Simulate success, cap, declined payment and missing method without paid calls.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F208 — Short-term rate-limit visibility

Required behavior: A window can temporarily restrict otherwise remaining monthly allowance; account/chat surfaces availability and refill timing.

Qualification: Exact window mechanics UNKNOWN.

Proposed check: Show active restriction, usable extra credits and correct retry/refill information.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F213 — Per-member seat changes

Required behavior: Authorized users edit a member's role or plan allocation.

Qualification: Paid upgrades require card; prorated immediately; downgrades deferred.

Proposed check: Verify seat transition timing, role restrictions and missing-card state.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F214 — Team payment setup and portal

Required behavior: Owner configures payment method and accesses team receipt/subscription portal.

Qualification: Administrators cannot use owner-only subscription portal.

Proposed check: Verify owner access and denial for administrator/member.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F215 — Enterprise contract presentation

Required behavior: Contract-billed teams display agreement/shared-credit state instead of self-serve card prompts.

Qualification: Enterprise arrangements are contract-dependent; no generic service level promised.

Proposed check: Represent a contract test account without presenting inappropriate card setup.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F216 — Shared team credit administration

Required behavior: Administrators/owners buy or configure shared prepaid refills; members inspect balance.

Qualification: Monthly automatic purchase cap applies; no team PAYG overage.

Proposed check: Verify balance read access and restricted purchase/configuration.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

Additional qualified behavior: Team plans include invitations, user management, unified billing and distinguish personal top-ups from shared team credits; account/team pages show reset times, spending sources and seat upgrade requests. Historical/current account-page claims; no plan change or purchase performed. Check: EXTRAPOLATED: in a test tenant inspect member roles, seat requests and separate personal/team usage ledgers without making a payment.

### F222 — Storage usage inspection

Required behavior: Settings show total local usage and a category breakdown.

Qualification: Category detail accessed through expanded control.

Proposed check: Measure fixture storage and inspect aggregate/category display.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F277 — Credit estimates, live usage and overruns

Required behavior: Tasks show estimates before start, usage during progress and warnings as cost rises; balances/reset times appear in account, team and browser surfaces and free-plan behavior adapts to balance.

Qualification: Historical/current UI claims; numerical pricing is intentionally not copied as a builder requirement.

Proposed check: EXTRAPOLATED: run a metered test task against a fake billing ledger, reconcile estimate/live/final totals and verify overrun warnings and reset display.

Stage: S7. Disposition: ADAPTATION_PROPOSED. Own-subscription/API usage and budget management is proposed; reproducing a vendor credit shop/checkout is not silently included or dropped. Exact commercial equivalence remains an owner decision and parity gap.

### F278 — assistant usage limits with hard or soft stop

Required behavior: Users can set a assistant credit limit that stops immediately or allows an in-progress task to finish.

Qualification: Historical December 2025 claim; exact interaction with newer plans requires verification.

Proposed check: EXTRAPOLATED: cross a small test budget in each mode and verify immediate halt versus permitted completion is distinct and visible.

Stage: S7. Disposition: REQUIRED. Required product capability; staged, not accepted.

## Automations

### F025 — Automation status in sidebar

Required behavior: Scheduled, running, event-listening or attention-needed automation can appear in the activity sidebar.

Qualification: Conditional on automation state.

Proposed check: Drive a test automation through each status and confirm the corresponding sidebar state.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F128 — automation catalog across assistants

Required behavior: A single list spans assistants with assistant filters and search.

Qualification: Documented.

Proposed check: Create two scoped automations and filter/search them.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F129 — automation creation dialog

Required behavior: Users can create an automation with a name, instructions, trigger and any required connected account.

Qualification: Name and instructions are minimum fields; trigger-specific fields may also apply.

Proposed check: Submit valid data and verify a persisted automation.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F130 — automation validation feedback

Required behavior: An incomplete submission remains actionable and then highlights missing required fields.

Qualification: Documented behavior, not generic disabled-button validation.

Proposed check: Submit incomplete input and inspect field-level errors.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F131 — Daily scheduling

Required behavior: A daily trigger is offered.

Qualification: Timezone and missed-run policy UNKNOWN.

Proposed check: Create a daily schedule and observe a correctly timed run in preview.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F132 — Interval scheduling

Required behavior: A periodic interval trigger is offered.

Qualification: Minimum interval UNKNOWN.

Proposed check: Configure an interval and verify run timestamps.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F133 — Cron scheduling

Required behavior: Advanced schedule expressions are supported.

Qualification: Supported cron dialect and timezone behavior UNKNOWN.

Proposed check: Accept a valid expression and reject an invalid one; verify next run.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F135 — automation creation from conversation

Required behavior: A successful chat can become a repeating automation with follow-up clarification.

Qualification: Documented conversational capability.

Proposed check: Ask to schedule a completed workflow and inspect resulting configuration.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F136 — Guided automation creation

Required behavior: The automations page can open a assistant conversation to develop an automation.

Qualification: Documented.

Proposed check: Launch guided creation from the list and return to the saved automation.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F137 — automation detail and editor

Required behavior: Dedicated detail and editing screens expose each automation.

Qualification: Documented.

Proposed check: Open, edit, persist, and reopen one automation.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F138 — automation removal

Required behavior: An automation can be removed.

Qualification: Parity requires capability; Amit's operating rules favor archiving for personal adaptation.

Proposed check: Remove or archive a test automation according to approved product policy and ensure it stops firing.

Stage: S5. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

### F139 — automation suspension and resumption

Required behavior: Users can suspend and later reactivate automations.

Qualification: Documented.

Proposed check: Suspend across a trigger window, then resume and observe future execution.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F140 — Immediate scheduled execution

Required behavior: Scheduled automations can be run on demand.

Qualification: Limited to scheduled automations.

Proposed check: Trigger an immediate run without altering its saved schedule.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F141 — Webhook replay

Required behavior: Some webhook automations can repeat their latest execution.

Qualification: Explicitly conditional on availability.

Proposed check: Where exposed, replay and record that it is distinct from a new incoming event.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F142 — Per-automation and aggregate history

Required behavior: Execution history exists for each automation and across assistants; list includes a small history visualization.

Qualification: Retention and error schema UNKNOWN.

Proposed check: Find a known run in detail and aggregate history.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F143 — automation-generated conversations

Required behavior: Triggered work opens an actual conversation rather than an unrelated log-only execution.

Qualification: Documented.

Proposed check: Follow a run to its resulting conversation.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F144 — Quiet-run cleanup and notification

Required behavior: A automation can discard an insignificant automatic conversation or notify and retain meaningful work.

Qualification: Policy depends on instructions; removal conflicts with Amit's archive preference.

Proposed check: Test both meaningful and quiet events using approved retention behavior.

Stage: S5. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

### F145 — Trigger-specific run notices

Required behavior: Scheduled and webhook executions display different notices; webhook notices can include an app identity graphic.

Qualification: Graphic availability conditional; do not copy assets.

Proposed check: Distinguish both trigger classes in execution UI using original assets.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F192 — automation permission scope

Required behavior: Scheduled work uses app access and permissions even when the user is absent.

Qualification: Guidance recommends drafting and approval; not a separate guaranteed policy engine.

Proposed check: Exercise a automation under denied and confirmation-required action policy.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F237 — Batch chat management and unread automation inbox

Required behavior: Users can select multiple chats to mark read, archive or delete; unviewed automation runs collect together with unread and waiting indicators.

Qualification: October 21 release claim; destructive actions here describe target capability, not authorization to perform them.

Proposed check: EXTRAPOLATED: batch-archive test chats, mark them read and verify automation runs remain discoverable under their correct status.

Stage: S5. Disposition: POLICY_ADAPTATION. Agents archive rather than permanently delete. Human-controlled erasure/retention semantics need an explicit product decision; exact destructive-behavior parity is not claimed.

### F260 — Missed schedule catch-up after reopening

Required behavior: Desktop automations depend on the app running; pending due work starts when the app reopens, without implying cloud execution.

Qualification: Current marketing/latest retrospective; desktop app must be open. Missed runs wait until reopening rather than proving cloud execution.

Proposed check: EXTRAPOLATED: run a timed and test-app-event automation, close the app across a due time and verify the missed run starts after reopening.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F261 — Conditional event filters and existing-chat output

Required behavior: Only-if conditions filter incoming app events; runs can post into an existing chat, whose input area lists attached automations.

Qualification: October 21 release claim; filter operators and payload schema UNKNOWN.

Proposed check: EXTRAPOLATED: send matching/nonmatching test events and verify only matching events start runs in the chosen existing conversation.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F262 — One-off timed or next-event tasks

Required behavior: Tasks run once on a selected date/time or next matching app event, optionally stop waiting at a deadline, and can be edited, paused or cancelled before start.

Qualification: Current marketing and October 8 release; completed tasks appear under Past with their conversation.

Proposed check: EXTRAPOLATED: complete one timed task, expire one event-wait task and verify neither runs twice; inspect the completed conversation link.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F263 — Upcoming schedule preview and concurrent due runs

Required behavior: Upcoming trigger times are inspectable and one waiting run need not block the next due run; history/replay/pause are covered separately.

Qualification: Historical release claims; concurrency behavior specifically October 21.

Proposed check: EXTRAPOLATED: inspect upcoming dates, leave one run awaiting a question and confirm the next starts; replay safely and verify historical outputs remain traceable.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

## Knowledge and outputs

### F029 — Profile creation and switching

Required behavior: Multiple profiles separate website sign-ins, browsing data and many preferences.

Qualification: Built-in app connections are account-wide across profiles using the same account, not profile-isolated.

Proposed check: Create two test profiles, verify website-cookie separation and explicitly test shared integration visibility.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Separate profiles support multiple product accounts and distinct website logins; same-product-account profiles share assistants/apps. Profile colors and quick switching distinguish contexts. October 1 release gives sharing versus login-isolation semantics; earlier profile details are historical. Check: EXTRAPOLATED: sign test profiles into different website accounts, verify cookie isolation, and verify assistant/app sharing only where product-account identity matches.

### F030 — Profile naming and coloring

Required behavior: A profile can be renamed and colored, including optional colored tab backgrounds.

Qualification: Some appearance settings are profile-specific.

Proposed check: Rename/recolor a test profile, switch away/back and verify persisted appearance and correct profile identity.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F036 — Selectable migration source and profile

Required behavior: Import lets users choose a browser, its local profile and data categories, then inspect a result summary.

Qualification: Available sources vary by platform and local data presence; original source browser is documented as unchanged.

Proposed check: Import a synthetic profile with known counts, verify source unchanged and per-category result summary.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Migration brings bookmarks, passwords, history and extensions; releases name Safari, Edge, Firefox and Zen fixes. Most Chrome Web Store extensions are claimed to work. Current marketing/latest retrospective support extensions; most is not all. Browser/OS-specific import support needs verification. Check: EXTRAPOLATED: import a harmless test profile and install a compatible sample extension; verify counts, preserved folders and explicit unsupported cases.

### F043 — Source-specific workspace migration

Required behavior: Arc has special handling for its organization; Zen essentials become pinned tabs and pins become bookmark folders grouped by space.

Qualification: Specific to those source browsers; not a general round-trip fidelity guarantee.

Proposed check: Import synthetic source workspaces and verify the stated pin/folder mapping without inventing other mappings.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F053 — Download history and file discovery

Required behavior: A downloads page provides history and file management; chat artifacts may instead be available through file previews.

Qualification: Windows history shortcut is Ctrl+J; exact download actions unspecified.

Proposed check: Download a known file, find it through Ctrl+J, and locate generated artifacts through their chat context.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F062 — Diagnostic issue report attachments

Required behavior: Issue reporting attaches logs/diagnostics; optional chat and tab screenshot attachments can be initially selected.

Qualification: Report data can include open-page and file details; availability varies by release.

Proposed check: Inspect report preview with synthetic data, deselect optional attachments and verify actual payload exclusions.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F067 — Persona configuration workspace

Required behavior: Assistant preferences manage general details, skills, automations, files and models; the file section opens its folder in the library.

Qualification: Additional communication-channel controls only appear when available.

Proposed check: Open each documented section and verify correct assistant-specific data; mark unavailable optional sections.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F084 — Workspace file and artifact work

Required behavior: Agents can read/write workspace files and produce documents, reports, spreadsheets and other artifacts.

Qualification: Depends on granted folder/tool access; file format breadth not guaranteed.

Proposed check: Create a synthetic artifact in an approved workspace and open it with a suitable independent viewer.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F108 — Workspace content browser

Required behavior: A signed-in user browses personal, team, and specifically shared work through a workspace selector.

Qualification: Sign-in required.

Proposed check: Switch scopes and verify only authorized files appear.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Library gathers artifacts, projects, assistant files, skills, transcripts and shared work with search, filtering and previews; artifacts link back to their presenting chat. Latest release reaffirms Library; U02 Workspace name is historical. Check: EXTRAPOLATED: locate files across assistant/project/team scopes, preview them and return from an artifact to its source conversation.

### F109 — Workspace content categories

Required behavior: Separate views expose task outputs, project folders, assistant-owned files, and the full selected file tree.

Qualification: Documented.

Proposed check: Each category displays the corresponding files without changing workspace.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F110 — Scoped file search

Required behavior: Search narrows the current library view.

Qualification: Documented.

Proposed check: Search within one scope does not unexpectedly reveal another scope.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Memory, reports and skills appear in a searchable hub; memories and skills can be browsed as files with folder paths, nested folders and topic organization. Historical release claims; Workspace/Knowledge terminology later evolves into Library. Check: EXTRAPOLATED: find a memory, report and skill by search and folder navigation; inspect a nested file and its ownership.

### F112 — Persistent assistant context

Required behavior: Durable facts can inform later assistant work.

Qualification: Exact settings vary by account and application release.

Proposed check: Save a stable fact and confirm later retrieval within its intended scope.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: assistants retain preferences and working patterns across sessions. Current marketing and latest release retrospective reaffirm ordinary memory; distinct from conditional screen-capture memory. Check: EXTRAPOLATED: explicitly save a harmless preference, begin another session and confirm the assistant can retrieve and apply it.

### F113 — Cross-assistant and scoped context

Required behavior: Some memories apply across assistants while others belong to one assistant.

Qualification: Documented; exact precedence unspecified.

Proposed check: A scoped fact is available to its assistant and a shared fact to relevant assistants.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F114 — Memory settings destination

Required behavior: A dedicated settings destination exposes the memory controls available for the account.

Qualification: Control inventory explicitly variable.

Proposed check: Resolve the destination and enumerate actual controls without inventing absent toggles.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F115 — Conversational memory inspection

Required behavior: Users can ask a assistant to describe retained facts and correct stale information.

Qualification: Documented.

Proposed check: Inspect then correct a fact and verify a later answer uses the correction.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F116 — Conversational memory updates

Required behavior: A assistant can save or update reusable facts on request.

Qualification: Documented.

Proposed check: Request a durable update and inspect persisted context.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F117 — Editable memory documents

Required behavior: Some setups expose memory documents within assistant files or the full library.

Qualification: Conditional on exposed editable files.

Proposed check: When enabled, edit a document through the library and verify later retrieval.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F118 — Memory maintenance skill

Required behavior: A bundled memory-maintenance instruction set helps review, reorganize or migrate durable context.

Qualification: Guided workflow; outcome quality not guaranteed.

Proposed check: Invoke the maintenance guidance and review proposed changes before saving.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F120 — Profile skill catalog

Required behavior: Reusable instructions are installed at profile level and accessible in a dedicated catalog.

Qualification: Documented.

Proposed check: Open the catalog and inspect a saved instruction set.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F121 — Skill document editing

Required behavior: Skill cards open instructions in a document viewer for reading and editing.

Qualification: Documented.

Proposed check: Edit and reopen a saved instruction set.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F122 — Start conversation using skill

Required behavior: A catalog card can initiate a conversation using its instruction set.

Qualification: Documented.

Proposed check: Launch and verify the conversation is associated with the selected skill.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F123 — assistant-owned skills

Required behavior: Adding a skill in assistant configuration places it in that assistant's own folder.

Qualification: Documented.

Proposed check: Create a scoped skill and verify storage and ownership.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F124 — Scoped skill menu ordering

Required behavior: assistant-specific instructions precede global instructions in the slash selector.

Qualification: Documented.

Proposed check: Open the selector with both kinds installed and verify ordering.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F125 — Portable assistant skills

Required behavior: A assistant's scoped skills accompany it when shared with a user or team.

Qualification: Sharing dependent.

Proposed check: Recipient receives the scoped skill with the shared assistant.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F126 — Skill creation from conversation

Required behavior: A assistant can distill a successful conversation into reusable steps, inputs, approvals and output instructions.

Qualification: Conversational capability; document recommends reviewing draft.

Proposed check: Generate from a completed sample workflow and inspect the proposed instructions.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F127 — Conversational skill revision

Required behavior: Users can request revisions to an existing reusable process.

Qualification: Documented.

Proposed check: Revise a process requirement and verify the saved skill reflects it.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Skills are assistant-scoped, can be used by automations, expose files for previews and drag/drop additions, and are said to improve from concrete run evidence. Historical releases and current automation marketing; automatic improvement is a vendor claim, not independently demonstrated. Check: EXTRAPOLATED: attach a file to a skill, preview it, scope it to one assistant and verify a automation uses the updated skill; record provenance for any improvement.

### F166 — Generated artifact browsing

Required behavior: assistant outputs appear in the library artifact collection.

Qualification: Documented.

Proposed check: Produce a sample output and locate it in the collection.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F167 — Artifact-to-origin conversation

Required behavior: Opening a report reveals its full contents and lets users continue its producing conversation.

Qualification: Documented.

Proposed check: Follow a report back to its original conversation.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F168 — assistant folder browser

Required behavior: assistant configuration exposes files and can hand off to the library browser.

Qualification: Documented.

Proposed check: Open a assistant file through configuration and library.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F169 — Local file import to folder

Required behavior: Dropping local files into an open folder copies them there.

Qualification: Documented.

Proposed check: Drop a harmless local file and compare saved content.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F170 — Import name-collision handling

Required behavior: A dropped file with an existing name receives a distinct numbered filename.

Qualification: Documented.

Proposed check: Import two same-name files and verify neither is overwritten.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F171 — Account file access across profiles

Required behavior: Profiles signed into one account can access its files despite historical profile names on folders.

Qualification: Not isolated by browser profile.

Proposed check: Verify authorized same-account profile access and separate-account isolation.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F178 — Report download formats

Required behavior: Reports export in Markdown and PDF.

Qualification: Documented.

Proposed check: Download both and compare essential report content.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Reports export as styled PDFs, data tables export, document content exports to Google Docs, and final reports can be shared to Slack, Gmail or Outlook. Historical release claims; app sharing is capability evidence, not authorization to send during this task. Check: EXTRAPOLATED: export a sample report/table, inspect headings/lists/formatting and produce a reviewable draft for a supported sharing destination.

### F180 — Spreadsheet artifact preview

Required behavior: Workbook and delimited-text formats preview as tables.

Qualification: Formats documented: xlsx, xls, csv, tsv.

Proposed check: Preview representative harmless samples in all four formats.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F181 — Unsupported binary handoff

Required behavior: Unsupported binary files offer opening in an external application.

Qualification: External handler availability dependent.

Proposed check: Preview unsupported test file and invoke safe external handoff.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F182 — HEIC/HEIF chat preparation

Required behavior: These image types convert to JPEG before AI upload.

Qualification: Applies to chat image preparation, not promised original-file conversion.

Proposed check: Attach harmless sample and verify prepared upload format.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F183 — Curated workflow catalog

Required behavior: Role-oriented official instruction sets and starter journeys appear in a browsable use-case area.

Qualification: Catalog content can change.

Proposed check: Browse, search and filter a representative workflow.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F184 — Role/context onboarding recommendations

Required behavior: Optional role description, workplace context and work categories influence workflow recommendations.

Qualification: Organization type is separate from role; recommendation quality not guaranteed.

Proposed check: Compare visible recommendations after changing test onboarding inputs.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Guided questions and role/connected-app context suggest useful tasks; permission-based public-web lookup can help build an onboarding profile. Historical release claims; web lookup is explicitly permission-based. Check: EXTRAPOLATED: decline web lookup and still complete onboarding; with consent, produce an editable profile and relevant task suggestions.

### F185 — Workflow description and launch

Required behavior: A selected workflow can be read and launched into a conversation immediately.

Qualification: Starting from catalog begins work; constraints can instead be supplied in a fresh chat.

Proposed check: Launch a harmless example and verify selected workflow context.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F186 — Public guide and technical skill links

Required behavior: Public articles and technical GitHub instructions correspond; a canonical skill is shown when no authored article exists.

Qualification: Getting-started guides are stated to have authored articles.

Proposed check: Check a sample guide-to-skill link and absent-article fallback.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F225 — Issue-report submission interface

Required behavior: Application menu opens a report with optional message, logs/diagnostics and file attachments.

Qualification: Submission sends information to support; current task authorizes no send.

Proposed check: Prepare report and inspect contents without transmitting.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F226 — Report privacy selection

Required behavior: Available chat and current-tab screenshot attachments start selected and can be excluded.

Qualification: Controls conditional on availability; diagnostics may include page/device/performance/sync data.

Proposed check: Verify exclusions remove corresponding payload data before submission.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F231 — AI-readable public help index

Required behavior: A public text index lists documentation pages and short descriptions for assistant lookup.

Qualification: Public website content, not an in-product feature by itself.

Proposed check: Find relevant guide through index and return source link.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F251 — Customizable activity sidebar and profile tab orientation

Required behavior: Tabs, chats, automations and shortcuts can share a customizable sidebar with sorting; profiles can have different horizontal/vertical tab orientation; Classic and Modern layouts differ.

Qualification: Historical release claims; exact UI shells may evolve.

Proposed check: EXTRAPOLATED: change visible sidebar sections and sort order, switch profiles with different orientations and verify each preference persists.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F257 — Deleted-file recovery and conflict resolution

Required behavior: Recently deleted files can be bulk-restored; conflicts expose edits for recovering the desired version. assistant requests can restore files deleted within 30 days.

Qualification: Latest release reaffirms easy recovery; 30-day window specifically claimed October 21.

Proposed check: EXTRAPOLATED: in a test workspace, recover a removed file and resolve concurrent version edits while preserving the selected content and history.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F258 — Per-chat downloads and cloud-file interoperability

Required behavior: assistant downloads belong to the chat that created them; cloud Drive/OneDrive files become usable local attachments across tools and Office files can be parsed.

Qualification: Historical release claims; does not imply automatic access to every cloud file.

Proposed check: EXTRAPOLATED: download an authorized test file in one chat and attach a connected-drive document to a safe draft in another tool, retaining source provenance.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F272 — Inline charts with exact table values

Required behavior: Replies can show comparative cards, metrics, charts and editable/exportable tables. Charts switch to tables for exact values; five named spreadsheet chart types include column, bar, line, pie and scatter.

Qualification: Current marketing plus historical specifics; table export formats not fully listed in these sources.

Proposed check: EXTRAPOLATED: render each supported chart type from fixed data, switch to exact values and verify copied/exported data preserves numeric values.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F273 — Spreadsheet analysis, formulas and native chart publishing

Required behavior: assistants analyze and update Excel/Google Sheets using generated computations, fill formulas, build pivots and push charts natively. Selected ranges and locale formula separators are respected; literal text should avoid date conversion.

Qualification: Historical release claims; supported pivot operations and Excel formats UNKNOWN.

Proposed check: EXTRAPOLATED: update a bounded test range with locale-correct formulas, chart and pivot; verify literal 1-2 stays text and untouched cells remain intact.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F274 — Branded visual document generation and export

Required behavior: Generate/refine decks, posters, one-pagers, diagrams, mockups and social graphics from supplied or web material; website branding informs colors/fonts/assets; output previews and PNG/PDF exports are described.

Qualification: Current marketing/latest retrospective. Reuse of any third-party brand assets is not permission for this clean-room study to retain them.

Proposed check: EXTRAPOLATED: use original test branding and content, generate/refine a deck and one-page visual, then inspect PNG/PDF outputs for complete content.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F275 — Image creation, editing and transparent cutouts

Required behavior: Create/edit images and transparent-background cutouts; later release describes automatic model choice for create versus edit.

Qualification: Current marketing and October releases; model/provider selection is implementation-independent.

Proposed check: EXTRAPOLATED: create an original test image, request an edit and export a transparent cutout; verify alpha data and preservation of requested content.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F276 — Short video generation with sound

Required behavior: Text descriptions can produce short videos; generated videos can include audio.

Qualification: Current marketing/October 21 claim; duration, codec and limits UNKNOWN.

Proposed check: EXTRAPOLATED: generate a bounded original clip with requested sound and inspect both playable video and audio tracks.

Stage: S5. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F280 — Optional activity capture memory

Required behavior: Legal text describes periodic screenshots and on-screen analysis, potentially across other apps, to build a persistent activity log; it excludes keystroke capture and biometric identification.

Qualification: CONDITIONAL PRIVACY-ONLY: may be unavailable by version/region; disabled by default; requires provider enablement and explicit user opt-in. No unconditional product availability proof in marketing/releases.

Proposed check: EXTRAPOLATED: only if separately adopted, show unavailable/off states and collect nothing before explicit informed opt-in; use harmless synthetic screen content to verify bounded capture.

Stage: S7. Disposition: CONDITIONAL_SCOPE. Described only conditionally in legal/privacy material. Availability, owner scope and safe implementation remain unresolved; do not enable or count as generally available parity.

## Apps and MCP

### F071 — Connected-app workflow context

Required behavior: Email, calendar, documents, team messaging and domain systems can supply context and tool actions.

Qualification: Named apps in setup are examples, not proof every app/action is implemented or entitled.

Proposed check: Validate one authorized app read and one separately approved action; inventory actual supported actions.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F095 — Per-integration action decisions

Required behavior: Listed integration actions can be configured to ask, always allow or disable.

Qualification: Available controls vary by app; not all actions/reads are individually controllable.

Proposed check: For a synthetic action verify ask/allow/deny each affect actual execution and disabled actions cannot be invoked.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Listed app actions can require confirmation, be preauthorized, or be blocked. Not every read or action has a separate control. Check: Verify all three policies on a configurable harmless action.

Additional qualified behavior: Users choose per-app/action permissions, app guidelines and browsing consent scope such as always, this chat or ask each time. Approved choices persist; grouped steps can share an approval. Current marketing plus historical claims; avoid inferring all action categories are always gated. Check: EXTRAPOLATED: configure chat-only permission for one app action, verify another app remains gated and a new chat does not inherit the temporary grant.

### F134 — Connected-app event triggers

Required behavior: An application event such as incoming email can trigger work.

Qualification: Depends on app integration and eligible account.

Proposed check: Choose an account and verify a matching event triggers the automation.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F187 — Connected application management

Required behavior: An integrations destination connects, adds accounts and disconnects supported external applications.

Qualification: Specific tool inventory depends on application.

Proposed check: Connect a test account, select it, and disconnect with effects made clear.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: A catalog groups available/connected apps by category and capabilities; chat can discover/setup integrations. Multiple accounts per app can be named with a default; assistant settings manage app permissions/guidelines. Historical release claims; app catalog is not proof every connector supports every action. Check: EXTRAPOLATED: discover an app, connect two test accounts, name/select the default and verify one chat action uses the selected account only.

### F188 — OAuth and credential connection methods

Required behavior: Connections use OAuth or provider-token entry depending on integration.

Qualification: Provider support and legal consent dependent; no credential values in evidence.

Proposed check: Verify correct authentication mode and names-only credential status.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F189 — Documented built-in app families

Required behavior: Examples name Gmail, Google Calendar, Drive, Outlook, Slack, Notion, CRM and ATS tools.

Qualification: Named examples do not establish identical actions or a complete vendor list.

Proposed check: Record each actual connector's discovered actions and permissions.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F190 — Account-wide built-in connections

Required behavior: Built-in app accounts are shared across profiles signed into the same account; browser sign-ins remain profile-separated.

Qualification: Switching browser profile does not isolate these connections.

Proposed check: Check account identity prominently in tasks across two profiles.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F191 — Cross-profile disconnection

Required behavior: Removing a built-in account disconnects it across account profiles and can affect dependent work.

Qualification: automations may need reconnection.

Proposed check: Disconnect test account and verify dependent task reports missing connection.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F193 — Custom MCP connection creation

Required behavior: Users can add named custom MCP connections in integration settings.

Qualification: Configured locally per browser profile.

Proposed check: Create a harmless test connection in one profile and verify isolation.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F194 — HTTP MCP transport

Required behavior: HTTP, SSE and streamable HTTP connections can target remote or same-device servers.

Qualification: Public remote endpoints require HTTPS; transport compatibility still needs verification.

Proposed check: Discover and call a harmless tool on each supported transport.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F195 — HTTP MCP authentication

Required behavior: HTTP connections can include an optional API token and supported OAuth sign-in.

Qualification: OAuth conditional on server support.

Proposed check: Test one authenticated connector without revealing credentials.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F196 — Loopback MCP discovery and calls

Required behavior: A local HTTP endpoint can expose tools to a assistant on that device.

Qualification: Local server must remain running.

Proposed check: Discover local tool, call it, then stop server and inspect unavailable state.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F197 — Local subprocess MCP

Required behavior: A full command line launches a local server communicating through standard streams.

Qualification: Runs with user's system permissions; third-party server not vendor-verified.

Proposed check: Launch a trusted harmless test process and discover/call one tool.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F198 — Encrypted MCP environment values

Required behavior: Local command servers accept environment configuration with values encrypted at rest.

Qualification: Encryption implementation and key custody UNKNOWN.

Proposed check: Save a names-only test configuration and verify no plaintext value in diagnostic output.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F199 — MCP disable/removal lifecycle

Required behavior: Docs describe disabling or removing custom connections when no longer needed.

Qualification: Specific UI sequence unspecified.

Proposed check: Verify exposed disable/removal prevents subsequent tool use.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F264 — App authentication scope and reconnection controls

Required behavior: Google app connections share one login flow with selectable permissions; expired connections can refresh without removal/re-addition; WhatsApp links by QR.

Qualification: Historical release claims; authenticating or consenting remains a separate authorized user action.

Proposed check: EXTRAPOLATED: inspect scopes, deny an unnecessary scope and reconnect an expired test integration without losing its account identity.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F265 — Messaging channels and personal messaging integration

Required behavior: Slack supports channel/DM search and dedicated message/channel action blocks. Personal WhatsApp supports chat search, replies, photos, documents and voice notes under app permissions.

Qualification: Slack historical; WhatsApp specifically October 21. No claim of a separate cross-app group-chat product.

Proposed check: EXTRAPOLATED: search authorized test channels and a linked test messenger account, then review gated drafts with text and attachment types without sending real messages.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F266 — Email drafting, send-as and signatures

Required behavior: Structured rich compose blocks support reviewing/editing drafts; email search previews show participants/attachments, verified Gmail send-as follows the chosen address and signatures can be disabled before approval.

Qualification: Historical release claims; Gmail and Outlook support varies by action and should be inventoried.

Proposed check: EXTRAPOLATED: find a test email, draft a formatted response using an alternate verified sender and inspect the exact preview/signature before approval.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F267 — Document, CRM and recruiting connectors

Required behavior: Examples include Notion page browsing/comments/updates; Google Drive including Shared Drives; OneDrive; Salesforce CRM retrieval/updates; HubSpot; Ashby, Attio and outreach tools. A later release adds over 100 apps across functions.

Qualification: Historical named integrations, not a complete action matrix. Do not convert catalog size to a guaranteed current count.

Proposed check: EXTRAPOLATED: make a capability matrix per chosen connector and verify one read and one approval-gated test mutation for each supported action.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F268 — Openable app-generated objects

Required behavior: Created emails, drafts, documents and calendar events appear in chat with an Open action.

Qualification: October 21 release claim.

Proposed check: EXTRAPOLATED: create a disposable authorized object of each implemented type and verify its chat card opens the exact resulting object.

Stage: S3-S4. Disposition: REQUIRED. Required product capability; staged, not accepted.

## Meetings and voice

### F146 — Chat dictation

Required behavior: The chat microphone converts spoken input to text.

Qualification: Requires microphone and online transcription.

Proposed check: Dictate a phrase and inspect the editable chat input.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F147 — Conversation recognition

Required behavior: A chat recording may be classified as a meeting when a conversation is detected.

Qualification: Length alone is explicitly insufficient; classifier details UNKNOWN.

Proposed check: Test a conversational sample and a monologue; record actual classification.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F148 — Explicit saved meeting recording

Required behavior: A dedicated meetings action starts recording intended to be saved as a meeting.

Qualification: Documented.

Proposed check: Start, stop and locate a deliberately saved recording.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F149 — Remote meeting recording

Required behavior: Google Meet, Zoom and Microsoft Teams meeting audio can be recorded.

Qualification: Platform permissions and compatible meeting URLs apply.

Proposed check: Capture a consented test meeting with both local and remote audio.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Meetings on video platforms and in-person microphone conversations can be recorded without a bot joining; system and microphone audio capture both sides online. Current marketing/latest retrospective; recording permissions and platform/OS support still need verification. Check: EXTRAPOLATED: record a consented test conversation using microphone/system audio and verify a transcript attachment without a meeting attendee bot.

### F150 — Detected meeting notifications

Required behavior: Recognized meeting URLs can produce recording-start notifications.

Qualification: Requires relevant notification setting.

Proposed check: Visit a compatible test URL and inspect the notification.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Opening supported Meet, Zoom or Teams links prompts recording, connected calendars remind before calls, and a recording indicator shows live state; Outlook Calendar reminders are named. Current marketing/October 21 release claims. Check: EXTRAPOLATED: open test meeting links from supported calendars and verify reminder timing, recording offer and live-state indicator.

### F151 — Calendar meeting notifications

Required behavior: Scheduled meeting reminders can launch recording.

Qualification: Google Calendar connection and notification setting required.

Proposed check: Use a consented test event and verify the scheduled reminder.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

Additional qualified behavior: Opening supported Meet, Zoom or Teams links prompts recording, connected calendars remind before calls, and a recording indicator shows live state; Outlook Calendar reminders are named. Current marketing/October 21 release claims. Check: EXTRAPOLATED: open test meeting links from supported calendars and verify reminder timing, recording offer and live-state indicator.

### F152 — In-person microphone recording

Required behavior: Meetings can be captured directly from the microphone.

Qualification: Documented.

Proposed check: Record a consented local conversation and inspect saved text.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F153 — Movable recording controller

Required behavior: A floating controller displays input levels and can be repositioned.

Qualification: Documented.

Proposed check: Move it and confirm recording continues.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F154 — Recording pause and stop

Required behavior: Recording controls expose suspension and completion.

Qualification: Controls described as appearing on hover; accessibility behavior UNKNOWN.

Proposed check: Pause/resume where supported, stop, and verify saved capture excludes pause.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F155 — Microphone selection and rediscovery

Required behavior: Settings select an input device and can rescan available devices.

Qualification: Device dependent.

Proposed check: Change microphone, refresh devices, and verify input source.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F156 — Spoken-language configuration

Required behavior: Users can specify spoken languages to improve recognition.

Qualification: Supported language inventory UNKNOWN.

Proposed check: Configure available languages and test a matching sample.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F157 — Preferred recognition vocabulary

Required behavior: Custom names or terminology can guide transcription.

Qualification: Accuracy improvement not guaranteed.

Proposed check: Save sample vocabulary and compare recognition with recorded evidence.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F158 — Recording notification toggles

Required behavior: Scheduled-calendar and URL-detected meeting notifications have distinct settings.

Qualification: Calendar reminders require connected calendar.

Proposed check: Toggle each independently and verify only its notification source changes.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F159 — Noise and input-level diagnostics

Required behavior: Advanced noise thresholds and an input-level test support audio setup.

Qualification: Threshold semantics UNKNOWN.

Proposed check: Adjust a threshold and inspect the microphone-level test.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F160 — Platform capture permissions

Required behavior: macOS requires microphone plus screen/system-audio permissions and restart; Windows has no separate app system-audio prompt.

Qualification: Platform-specific documented setup.

Proposed check: Verify actual permissions on target OS without claiming cross-platform equivalence.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F161 — Transcription setup restart

Required behavior: Transcription settings offer restart after macOS permission changes.

Qualification: macOS-specific reason.

Proposed check: Invoke restart in preview and verify newly granted access takes effect.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F162 — Meeting archive and summaries

Required behavior: A meetings destination exposes saved summaries and transcripts.

Qualification: Documented.

Proposed check: Find a completed meeting and open both summary and transcript.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F163 — Raw recording filter and retry route

Required behavior: A recording-focused view includes saved captures not yet meetings or awaiting transcription, with retries described in route reference.

Qualification: Retry mechanics unspecified.

Proposed check: Locate pending recording and exercise retry if actual control is exposed.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F164 — Meeting files in workspace

Required behavior: Meeting files are also accessible in the workspace library.

Qualification: Documented.

Proposed check: Locate a known transcript through both meetings and library.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F165 — Online transcription dependency

Required behavior: Recognition requires internet; large files need upload/processing while app remains connected.

Qualification: Offline recognition is not documented.

Proposed check: Show truthful pending/error state during a controlled network interruption.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F259 — Large multi-file analysis and uploaded media transcription

Required behavior: Historical release allows up to ten large PDFs in one analysis; audio/video file transcription, MP3/WAV handling and inline data-table editing are described.

Qualification: Ten-PDF count is a historical product limit; exact file sizes and current limits UNKNOWN.

Proposed check: EXTRAPOLATED: process ten bounded test PDFs, transcribe a short uploaded audio file and edit a resulting table; report current configured limits explicitly.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F269 — Speaker-labelled transcript playback

Required behavior: Meeting playback aligns transcript context and differentiates speakers; meeting archive navigation is covered separately.

Qualification: Latest retrospective reaffirms; speaker diarization does not imply verified real-world identity recognition.

Proposed check: EXTRAPOLATED: transcribe a two-speaker sample, inspect labels, play alongside text and ask a question grounded in a stored past transcript.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F270 — Background meeting processing and recovery

Required behavior: Recording processing continues independently of navigation, with recoverable transcription failures.

Qualification: October release claims.

Proposed check: EXTRAPOLATED: queue two consented recordings, fail/retry one transcription and verify its summary does not block transcript access or the next recording.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

### F271 — Hold-to-talk voice actions

Required behavior: A held voice command control accepts a spoken request; chat dictation and insertion are covered separately.

Qualification: October 21 all-plan claim for hold-to-talk; supported command scope and languages UNKNOWN.

Proposed check: EXTRAPOLATED: dictate into the middle of an unsent prompt, edit it and test a harmless hold-to-talk command without replacing surrounding text.

Stage: S6. Disposition: REQUIRED. Required product capability; staged, not accepted.

## Owner and explicit engineering requirements

### X01 — Chromium browser with integrated chat

Actual desktop browsing surface plus resizable assistant and full-page chat; no localhost dashboard as the product. Stage: S2.

### X02 — Owner-selected engine and model

OpenCode plus supported subscription/official CLI/API adapters; capability-aware picker and explicit auth/spend route. Stage: S3.

### X03 — Secret values outside model context

Deterministic Executor/dev-vault broker with exact-origin/frame/document checks and pre-send/pre-persistence guards; real-vault acceptance required. Stage: S4.

### X04 — Parallel isolated browser workers

Configurable resource-aware pool; initial five-job objective with independent browser identities, same-origin state isolation and actual overlap evidence. Stage: S4.

### X05 — Independent action-order evidence

Verify actual owner decisions precede dispatch/effects; denial/off/silence/cancel cause no prohibited effects; separate observer cannot supply gate behavior. Stage: S4.

### X06 — Built-in MCP server surface

Expose scoped job submit/status/snapshot/act/log/cancel interfaces to authorized harnesses without exporting owner-only powers. Stage: S4.

### X07 — Perplexity-inspired visual system

Original Pomelo tokens, quiet neutral reading surface, teal action accent, source-aware answers and restrained browser chrome. Stage: S2.

### X08 — Impeccable and anti-slop quality

Apply audit/critique/clarity/hardening review, keyboard/RTL/read-aloud testing and original static previews before coding. Stage: S2-S8.

### X09 — Approved preview and build sequence

Deliver feature brief/plan first. Fresh clean-room builders receive only the handoff specification; root remains orchestration/review. Stage: S0-S8.

### X10 — Desktop automation boundary

Optional owner-requested desktop lane serializes one physical desktop and never closes Speechify, Wispr Flow or another agent surface. Stage: S6.

### X11 — Policy-safe provider access

No generic forwarding of subscription tokens; use supported entitlement/auth route. Codex keeps subscription OAuth, provider keys come from approved dev-vault references. Stage: S3.

### X12 — Test evidence and recovery

No weakened checks, hidden retries, mock acceptance or global leak guarantee. Preserve fixtures/artifacts by archive, capture failures and useful diagnostic progress. Stage: S1-S8.
