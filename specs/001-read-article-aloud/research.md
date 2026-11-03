# Research: Page Speaker — Read Article Aloud

**Date**: 2026-11-02
**Scope**: Technical planning only; no application files, dependencies, or tests created.
**State**: Complete. The user resolved FR-001 and FR-014 on 2026-11-02; the
[specification](spec.md#clarifications) records the decisions. No clarification gates remain.

## 1. Selection mapping and article identification

**Decision**: Use original DOM nodes and Range endpoints; identify a coherent main-article
container conservatively, then traverse eligible text in document order. Keep source spans
until the starting boundary has been resolved, clip there, and normalize the remaining text.

**Rationale**: Node identity distinguishes repeated phrases. Normalizing before locating the
selection or extracting from a reparsed clone can lose its exact position. Inline formatting
must not create artificial spaces within words; block boundaries need explicit separators.
Offscreen text is eligible even when it is outside the viewport.

**Alternatives considered**: Searching the extracted string for the selected words is
ambiguous. A Readability dependency adds clone-to-source mapping work and is unnecessary
for this deliberately bounded MVP. Reading all of body risks unrelated content.

**Source and inference**: Range boundary ordering and TreeWalker provide the primitives;
the article candidate policy and source-span design are project choices.
[Range boundary comparison](https://developer.mozilla.org/en-US/docs/Web/API/Range/compareBoundaryPoints),
[DOM traversal](https://developer.mozilla.org/en-US/docs/Web/API/Document/createTreeWalker).

## 2. Speech segmentation and native controls

**Decision**: Submit one sentence at a time, with word-boundary splitting of unusually long
sentences. Retain contiguous UTF-16 offsets and a 500-code-unit application segment cap.
Use native pause/resume; update the rate for the next segment; never cancel/restart merely
to change speed.

**Rationale**: This keeps rate changes timely without skipping text or replaying the current
sentence. Advance only when the engine finishes an utterance, not when the speak request
is accepted. Require start/end events and manually verify pause/resume for the chosen voice.
Handle API errors and asynchronous speech errors separately.

**Alternatives considered**: A single article utterance delays rate changes and risks API
length limits. Queueing all sentences fixes future utterance rates too early. Emulating
pause by stopping loses the exact native position.

**Source**: [Chrome TTS API](https://developer.chrome.com/docs/extensions/reference/api/tts).
Its documented utterance maximum is 32,768 characters; the smaller cap is our design choice.

## 3. Local voice eligibility

**Decision**: On-device voices only, as explicitly selected by the user. Require remote === false,
a non-empty voiceName, a compatible language, and start/end event support. Pin the selected
voiceName and extensionId when provided; recheck that identity before each utterance.
Reject ambiguous name/provider selectors that could also select a remote or unclassified
voice. This conservative selector rule is a project design choice.

**Rationale**: Article text must not be sent to a remote voice. Exclude both remote true and
unclassified locality. If no eligible voice exists, reject the request with a clear local-voice
message and preserve any existing session. A voice that disappears during accepted playback
ends that session with Error; it must not trigger a less restrictive fallback.

**Alternatives considered**: Automatic voice selection or permitting remote voices would
contradict the user's decision. Requiring word events is unnecessary without highlighting;
native pause/resume behavior is verified manually for the chosen local engine.

**Source**: [Chrome voice metadata](https://developer.chrome.com/docs/extensions/reference/api/tts#type-TtsVoice).
Locality is browser-reported metadata, not an independent audit of third-party engines.

## 4. MV3 worker lifetime and interruption handling

**Decision**: Keep the session in memory and own it through one document-bound runtime Port.
Tag all callbacks with worker/session/utterance identity. Unexpected worker loss ends the
session with a clear error; never persist content to recreate it or pretend callback state
survives a worker restart.

**Rationale**: A worker can be terminated after inactivity, losing its globals. Opening a
port is insufficient by itself, and chrome.tts documentation does not guarantee a live
consumer worker throughout an utterance.
[Worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle),
[Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging).

**Decision**: Extend lifetime only while an explicit user reading session
is Starting/Playing/Paused, using a worker-local trivial extension API call about every
20 seconds. Clear the interval on every terminal path. This adapts Chrome's documented
exceptional long-operation technique; it is a design inference, not a survival guarantee.
[Service worker migration guidance](https://developer.chrome.com/docs/extensions/develop/migrate/to-service-workers#keep_the_service_worker_alive).

**Alternatives considered**: Hidden-tab heartbeats may be throttled. An idle open Port is
insufficient. Persisting session text violates scope. Offscreen documents add an unnecessary
runtime. An always-on keepalive is outside this design.

**Recovery**: Cancel orphaned speech on worker bootstrap, before accepting new requests.
A disconnected live content script requests cleanup to wake the worker, drops its transient
session text, and shows interruption. Fresh reading requires a new request.

**Manual gate**: Play and pause beyond five minutes with DevTools closed, background the
source tab, force-stop the worker, and verify predictable cleanup and no automatic replay.

## 5. Source document lifecycle and navigation

**Decision**: Bind a session to browser-supplied tab/frame/document identity. Stop on source
port loss, pagehide, tab closure/replacement, main-frame navigation/reload, and changed article
path/query reported through History API navigation. Ignore fragment-only jumps, unrelated
tabs, and subframes. Watch source article-root removal as additional invalidation.

**Rationale**: Document unload alone misses same-document article navigation. A frame ID can
be reused across documents; documentId distinguishes them. A tab switch is not navigation.
[WebNavigation lifecycle](https://developer.chrome.com/docs/extensions/reference/api/webNavigation).

**Permission decision**: Use webNavigation specifically for reliable full and History API
navigation signals. It requires its named permission; filter immediately to the active source
and retain no navigation history.
[WebNavigation permission](https://developer.chrome.com/docs/extensions/reference/api/webNavigation#permissions).

**Alternatives considered**: tabs.onUpdated plus unload/disconnect covers much of the flow
but is insufficient as the sole authoritative SPA signal. Polling the webpage or patching its
History API is more fragile. Basic tab lifecycle events need no tabs permission.
[Tabs API permissions](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions).

## 6. Toolbar activation and minimum permissions

**Decision**: The user enables a tab through the toolbar button. Inject one content.js into
frame 0 of that document; only subsequent selections offer "Read from here." Use activeTab,
scripting, tts, and webNavigation. No persistent host access or static content-script matches.

**Rationale**: This is the user's selected interaction and limits webpage access. Repeated
activation is idempotent. New/reloaded documents need activation again; a same-document route
change stops the old session but keeps that document's already-injected selection listener.
Restricted pages need an action-level failure indication rather than inaccessible page UI.

**Alternatives considered**: Automatic activation with broad host permissions was rejected
by the user. A default action popup adds UI without serving this flow.

**Sources**: [activeTab](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab),
[Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

## 7. Typed communication and separation

**Decision**: Use one small versioned JSON protocol over runtime.Port. Share discriminated
TypeScript types and narrow unknown payloads with explicit runtime guards. Trust source identity
from the browser sender, not from payload fields. No external messaging or page-level bridge.

**Rationale**: Commands, state updates, and rejection errors need source/session ownership.
Obsolete commands and callbacks must not control a replacement session. State events carry
no article text; start requests contain only the extracted suffix and language hint.

**Alternative**: A messaging framework/schema library adds dependencies without solving a
current need beyond this small protocol.

**Sources**: [Chrome messaging](https://developer.chrome.com/docs/extensions/develop/concepts/messaging),
[MessageSender](https://developer.chrome.com/docs/extensions/reference/api/runtime#type-MessageSender).

## 8. Shadow DOM, shadcn/ui, and Tailwind

**Decision**: Mount React and an inline compiled stylesheet inside one Shadow DOM root.
Copy only Button and Native Select; keep required helpers, explicit labels and focus styles.
Use :host theme variables and local sizing defaults. No portals are needed for these controls.

**Rationale**: Page styles must not override extension controls, and extension styles must not
reset the article. A native speed select avoids extra focus/portal behavior. CSS rem units
still refer to the document root, so verify hostile root font sizes and use scoped sizing.
[Native Select](https://ui.shadcn.com/docs/components/base/native-select),
[CSS length semantics](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length).

**Compatibility work**: Verify the used Tailwind ring, border, and shadow custom properties
inside Shadow DOM; explicitly initialize needed values or avoid those effects.
[Tailwind's tracked Shadow DOM issue](https://github.com/tailwindlabs/tailwindcss/issues/15005).

**Alternatives considered**: Injecting styles into document.head leaks resets. A custom
portaled Select adds work; any future portal must have a container inside the shadow root.
[Radix Select portal](https://www.radix-ui.com/primitives/docs/components/select#portal).

## 9. Vite production packaging

**Decision**: Use two sequential builds from a mode-aware config: one IIFE content.js with
React and CSS bundled, then one ES-module background.js. Copy public/manifest.json on the
first build; only that build empties dist. No HTML entry or extension packaging plugin.

**Rationale**: Fixed packaged filenames work for script injection and the manifest. Vite's
inline CSS import produces processed CSS text for inserting inside the shadow root.
[Inline CSS](https://vite.dev/guide/features#disabling-css-injection-into-the-page),
[Public directory](https://vite.dev/config/shared-options#publicdir).

**Current configuration finding**: Current Vite exposes rolldownOptions and library output
formats; rollupOptions is a deprecated alias. Disable output code splitting for each entry
and avoid external runtime imports.
[Vite build options](https://vite.dev/config/build-options),
[Rolldown code splitting](https://rolldown.rs/reference/OutputOptions.codeSplitting).

**Alternatives considered**: One multi-entry IIFE build is unsuitable; extension bundler
plugins and a Vite development-server runtime add unnecessary moving parts for this MVP.

## 10. Strict checking and local verification

**Decision**: Separate strict TypeScript environments for DOM content/UI, the worker, and
Node configuration. Plan npm ci, npm run typecheck, npm run build, then unpacked loading and
manual Chrome checks. Lock compatible dependency versions during implementation.

**Rationale**: Vite transpiles TypeScript without type checking. Tailwind has an official Vite
plugin. Use a maintained Node release meeting Vite requirements; Node 22.12+ is the documented
minimum release line for this plan.
[Vite TypeScript behavior](https://vite.dev/guide/features#typescript),
[Vite prerequisites](https://vite.dev/guide/),
[Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite).

**Alternatives considered**: Automated tests and test frameworks are explicitly excluded by
the user. No npm dependencies are installed and no production build or Chrome runtime checks
are claimed during this documentation-only planning task.

## Resolved decisions and design gate

| Requirement | User decision | Design consequence |
| --- | --- | --- |
| FR-001 | Enable the current tab through its toolbar button | Programmatic top-frame injection; no automatic activation or persistent host access |
| FR-014 | On-device voices only; clear message if none qualifies | Explicitly local voice filter, pinned identity, no remote fallback |

The specification and all 16 checklist items are resolved. Phase 1 artifacts are
[data-model.md](data-model.md), [contracts/messages.md](contracts/messages.md), and
[quickstart.md](quickstart.md). The post-design constitution check passes with the user's
explicit automated-testing exception. Runtime validation remains future implementation work.
