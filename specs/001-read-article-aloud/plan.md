# Implementation Plan: Page Speaker — Read Article Aloud

**Branch**: `main` (actual Git branch) | **Date**: 2026-11-02 | **Spec**: [spec.md](spec.md)

**Feature context**: `001-read-article-aloud` (the setup script reports this identifier as BRANCH;
it did not create or switch a Git branch).

**Input**: Feature specification from `specs/001-read-article-aloud/spec.md` and the user's
planning instructions: Vite, React, strict TypeScript, shadcn/ui, Tailwind CSS, MV3,
chrome.tts, typed messaging, Shadow DOM, and manual verification.

**Status**: Planning complete — ready for task generation. Both product decisions are
recorded in the approved [specification](spec.md#clarifications): toolbar activation per
document and on-device voices only. Phase 0 research and Phase 1 design artifacts are complete.
Implementation and runtime verification have not begun.

## Summary

Use a top-frame content script for selection detection, conservative main-article extraction,
and React controls inside a Shadow DOM root. A background service worker owns the single
extension-wide reading session and all chrome.tts calls. Share small discriminated message
types with runtime validation, and keep webpage text only in transient session memory.

Map the start by DOM node identity and Range offsets, avoiding text searches that confuse
repeated phrases. Speak one sentence-sized segment at a time so a speed change affects the
next sentence. Use native pause/resume, invalidate old callbacks on replacement, and stop
on source-document lifecycle changes. Build a bundled content script and module worker with
Vite, package all UI assets locally, and validate through type checking, production builds,
and manual Chrome checks.

## Technical Context

**Language/Version**: TypeScript with strict checking in all application and configuration
projects; current compatible React and TypeScript versions locked during implementation.

**Primary Dependencies**: React, React DOM, copied shadcn/ui Button and Native Select
components and only their required helpers; Vite and its React plugin; Tailwind CSS and
its Vite plugin; Chrome, React, and Node type packages. Use browser APIs for article traversal
and segmentation. No Readability dependency, extension bundler plugin, backend, paid API,
router, state-management library, or automated-test framework is required.

**Storage**: In-memory selection bookmarks and one active reading session. No storage
permission, database, webpage-content persistence, reading history, analytics, or saved cursor.

**Testing**: No automated tests or test frameworks. Planned gates are strict TypeScript
checks, a production build, and the manual Chrome acceptance scenarios. These checks cannot
be executed against an application during this planning-only task.

**Target Platform**: Desktop Chrome on the user's Windows environment first; MV3 and a
declared Chrome 120+ minimum baseline. Use chrome.tts rather than page speechSynthesis.
English articles and suitable installed voices form the initial acceptance baseline.

**Project Type**: One browser-extension project with two runtime entry points.

**Performance Goals**: Selection action within 1 second; audible start within 5 seconds
when a usable voice is available; Pause and Stop silence speech within 1 second; controls
remain reachable throughout scrolling.

**Constraints**: No backend, database, paid API, remote executable code, or automated tests.
One active reading session across tabs; strict content/playback/UI separation; native
keyboard controls; no automatic page scrolling or highlighting. Selection detection begins
after toolbar activation for the document. Only voices explicitly classified as local are eligible.

**Scale/Scope**: Personal use; five representative article pages for manual acceptance;
ordinary visible top-document text rather than PDFs, frames, editable fields, arbitrary
web-app layouts, or universal extraction support.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Pre-/post-design assessment | Design evidence / required review |
| --- | --- | --- |
| I. Small MVP | Pass | Two entry points, one session, native extraction and segmentation; only requested UI/build dependencies |
| II. Strict TypeScript | Pass by design | Separate DOM, worker, and Node type environments; strict shared contracts; independent typecheck command |
| III. Accessible Controls | Pass by design | Labeled buttons and native speed select, visible focus, accessible status/error announcements |
| IV. Minimum Permissions | Pass / Pass | Toolbar activation uses activeTab, scripting, tts, webNavigation; no persistent host access |
| V. No Content/History Storage | Pass / Pass | Transient session data only; explicitly local voices, no remote fallback, no content logging or storage |
| VI. Separate Responsibilities | Pass by design | DOM extraction modules, background speech controller, and React presentation connected by typed messages |
| VII. Important Behavior Tests | Explicit user override | User twice excludes automated tests/frameworks; use manual extraction and playback checks instead |
| VIII. Local Build Instructions | Pass / Pass | quickstart.md documents installation, typecheck, production build, unpacked load, and manual checks |

The test exception is authorized by the user's explicit instructions in this session and is
already recorded in the specification. It does not require another approval request.

**Product clarification gate: PASS.** FR-001 and User Story 1 scenarios 7–8 require per-tab
toolbar activation and one mount per document. FR-014 and User Story 3 scenario 7 require
local voices only, with clear rejection when none qualifies. SC-008 covers both decisions.
The requirements checklist passes all 16 items.

**Post-design assessment: PASS with the authorized testing exception.** The
[data model](data-model.md), [message contracts](contracts/messages.md), and
[quickstart](quickstart.md) preserve every applicable principle. Runtime gates remain
typecheck, production build, and manual Chrome checks during implementation; planning
review is not evidence that those checks already passed.

## Project Structure

### Documentation (this feature)

```text
specs/001-read-article-aloud/
├── spec.md
├── checklists/requirements.md
├── plan.md                    # Completed implementation design
├── research.md                # Resolved technical and product decisions
├── data-model.md              # Transient entities, state machine, invariants
├── quickstart.md              # Future build/load and manual validation guide
├── contracts/
│   └── messages.md            # Typed message protocol and error semantics
└── tasks.md                   # Later $speckit-tasks output; not created by planning
```

### Source Code (repository root)

Proposed layout only; no source or configuration files are created by this command.

```text
public/manifest.json
src/
├── background/
│   ├── index.ts               # Top-level listeners and injection entry
│   ├── playback.ts            # One session, segments, TTS lifecycle and controls
│   └── source-lifecycle.ts    # Tab/document/navigation stop rules
├── content/
│   ├── index.tsx              # Idempotent mount and cleanup
│   ├── selection.ts           # Selection bookmark and action positioning
│   ├── article.ts             # Candidate identification and original-DOM extraction
│   └── shadow-root.ts         # Isolated CSS and React mounting
├── ui/
│   ├── ReaderControls.tsx
│   ├── components/            # Only needed copied shadcn components
│   └── styles.css
└── shared/
    ├── messages.ts            # Discriminated messages and runtime guards
    └── speech-segments.ts     # Pure text segmentation and offset invariants
vite.config.ts
tsconfig.json
tsconfig.content.json
tsconfig.background.json
tsconfig.node.json
package.json
package-lock.json
components.json
README.md
dist/                         # Generated extension, ignored by Git
```

**Structure Decision**: Keep a single npm project. DOM types belong to content/UI code,
WebWorker types to the background, and Node types to build configuration. The shared layer
has no React, DOM, Chrome runtime, or storage dependencies.

## Implementation Design

### Selection and article extraction

1. Capture a non-collapsed main-document Range on completed pointer or keyboard selection.
   Reject editable fields, frames, and extension UI. Keep endpoint node identities, offsets,
   and selected source text only while the pending action needs them. A backward selection
   uses Range document order, not the selection's anchor direction.
2. Show the near-selection action without speech. Use Range rectangles for placement and
   clamp to the viewport. Preserve its saved bookmark across focus and pointer interaction
   with the extension controls; a genuine new or cleared page selection replaces it.
3. Identify the main article independently of the selected phrase. Prefer a coherent visible
   article within main/article landmarks. For unmarked simple pages, evaluate cohesive
   paragraph containers using readable text and link density, excluding body/html as a
   blanket fallback. Refuse similarly plausible unrelated candidates.
4. Traverse original DOM text nodes once, excluding script/style, navigation, sidebar,
   ad/related/comment regions where identifiable, hidden or non-rendered ancestors,
   editable areas, frames, and the extension host. Offscreen text remains eligible;
   below-the-fold content is not "hidden."
5. Validate both endpoints are connected, unchanged, wholly within the chosen article,
   and outside excluded regions. Build ordered source spans that retain Text node identity
   and raw UTF-16 offsets. Resolve element-boundary endpoints to the first eligible text
   position at or after the Range start.
6. Clip the first accepted source span at the exact starting offset before normalization;
   collapse whitespace consistently across inline nodes and insert separators at block
   boundaries. Do not insert spaces inside words split only by inline formatting. Every
   output character must originate from an eligible source span or an explicit separator.
   Never locate the start using indexOf(selectedText) or a reparsed article clone.
7. Freeze the resulting article suffix for this session; later appended text is not read.
   Invalid extraction produces a local clear message and leaves existing playback alone.
   Release DOM bookmarks after request acceptance; release remaining session text on every
   terminal path.

### Speech segmentation and playback

- Segment the extracted suffix with Intl.Segmenter in sentence mode. Each segment covers a
  contiguous interval in the normalized suffix; intervals preserve order without dropped
  or repeated words. Oversized sentences split at word boundaries with a modest 500 UTF-16
  code-unit cap; never split a surrogate pair. This cap is an application choice below the
  Chrome utterance limit, not a total-article truncation policy.
- Before accepting a request, the background validates its source and preflights a named
  language-compatible voice with remote === false and start/end event support. Exclude
  remote true and absent classifications. Pin voiceName and extensionId when present,
  reject a name/provider selector that could also match a remote or unclassified voice,
  recheck eligibility before each utterance, and fail clearly rather than dropping the
  voice restriction. Native pause/resume is a manual acceptance gate for the chosen voice;
  do not reconstruct its cursor or depend on word events.
- Preflight rejection leaves current speech unchanged. Recheck request freshness and source
  document/route after asynchronous work, then replace the old session atomically. Newer
  start requests supersede older pending starts; navigation invalidates pending starts too.
  A synthesis failure after acceptance ends the new session with Error, not a replay of
  the replaced session.
- Maintain one active session and one in-flight utterance. Call chrome.tts.speak for one
  segment, using enqueue false; advance only on its terminal end event. API acceptance
  alone is not proof of Playing or Finished. Map later errors to clear sanitized messages.
  Use the contract's start/progress watchdogs so a missing engine event ends with a clear
  timeout rather than leaving controls stuck. Unexpected interrupted/cancelled events are
  failures; callbacks invalidated by an intentional Stop or replacement are ignored.
- Pause uses chrome.tts.pause without cancelling the utterance; Resume uses
  chrome.tts.resume at the native position. Between utterances, a paused flag prevents
  scheduling the next one. Stop invalidates the generation before chrome.tts.stop,
  discards text, and disables Resume.
- Store speed as one of 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2; start each new session at 1.
  Update the pending rate for the next segment without restarting current speech.
  A paused rate change leaves the session paused and applies after the current native
  utterance finishes on resume.
- Tag callbacks with worker instance, session generation, and utterance identity. Ignore
  obsolete events after Stop, replacement, navigation, or failure. Serialize session
  transitions and recheck identity after every asynchronous preflight.
- The source port owns its session. Only that document may pause/resume/stop/set its rate;
  other tabs may request a valid new session that replaces it. Invalid new requests and
  selections alone do not stop current speech.

### Source lifecycle and service-worker lifetime

- Register listeners synchronously at worker module evaluation. Establish one runtime.Port
  per injected top-frame document; derive tab, frame, and document identity from the browser
  sender, not a payload. Disconnect, pagehide, source-tab removal/replacement, and committed
  document replacement all end the corresponding session.
- The webNavigation permission detects main-frame reload/navigation and History API
  article URL changes even when no document unload happens. Stop on main-frame beforeNavigate,
  and use committed/historyStateUpdated as additional guards. Filter immediately to the
  active source; ignore fragment-only changes and unrelated tabs/subframes. Treat path/query
  changes as a new article, conservatively. Watch for replacement/removal of the source article
  root as a further invalidation signal; do not interpret ordinary appended text as navigation.
- Use document identity plus a source URL with its fragment removed to distinguish stale
  documents from same-article fragment jumps. Browser-issued documentId is the authority.
- Memory-only lifetime strategy: during an explicit Starting/Playing/Paused session,
  call a trivial extension API from a worker-local interval about every 20 seconds; clear it
  on every terminal path. This applies the documented exceptional-long-operation mechanism
  to the user's bounded reading session, rather than relying on hidden-tab timers or an
  idle open port. It is a design inference that must pass manual Chrome validation.
- Unexpected worker termination still destroys callback state. On worker startup, cancel
  orphaned extension TTS before accepting new work. Port-disconnect recovery from a live
  source wakes the worker with a cleanup request, clears stale controls/text, and reports
  an interrupted session requiring a new selection. Do not restore text from storage or
  silently replay. No always-on keepalive, offscreen document, or indefinite idle process.
- Treat long reading, long pauses, hidden source tabs, and forced worker termination as
  essential manual validation cases with DevTools closed during lifetime measurements.

### Typed messages and UI isolation

- [contracts/messages.md](contracts/messages.md) defines JSON-safe requests and state
  envelopes, protocol version, request IDs, worker/session identity, source ownership,
  valid state transitions, and rejection/error codes. Validate unknown payloads at runtime
  with small explicit guards; TypeScript annotations alone do not validate messages.
- Send only the extracted suffix and its language hint at start. Status updates carry no
  webpage text. Do not use page postMessage, external extension messaging, or server APIs.
- Render React into one guarded Shadow DOM mount. Import compiled Tailwind/shadcn CSS as
  a Vite inline string and insert it only inside that root. Place theme variables on :host;
  set local typography, box sizing, and the used CSS custom-property defaults explicitly.
- Use copied shadcn Button and Native Select wrappers so speed needs no portal. Any future
  portaled content must target the shadow root. Verify focus/border/ring styles because
  Tailwind registered-property defaults and document-root rem units are not fully isolated
  by Shadow DOM; use explicit scoped sizing for this small panel.
- Keep the session panel fixed to the viewport with a compact responsive width. Give every
  control a text label, expose state through a polite live region and failures through an
  alert, provide visible focus, and do not trap focus or steal it when a pointer selection
  merely shows the reading action.

### Permissions and activation

Toolbar activation per document is the accepted design:

| Permission | Implemented need |
| --- | --- |
| activeTab | Temporary access when the user invokes the extension action |
| scripting | Inject the bundled content script into frame 0 of that document |
| tts | Speech generation, voice discovery, playback controls |
| webNavigation | Stop on reload/document changes and History API article navigation |

This design needs no broad host permissions, tabs permission, storage permission, or
web-accessible resources. Tab lifecycle events do not by themselves require tabs permission.
Repeated activation must be idempotent. A reloaded/new document requires activation again;
activeTab does not automatically reinject the script. Restricted pages need a clear
extension-action error indication because the content UI cannot be injected there.

The action has no default popup, so its click can inject content.js directly. Set a clear
action title and a brief per-tab error badge/title if injection is prohibited; the page UI
cannot render on restricted pages. Activation never starts speech. Same-document route
changes stop the session and clear selection bookmarks but keep selection detection enabled.
New/reloaded documents need toolbar activation again.

Only explicitly local voices qualify. If none matches the article language and required
capabilities, show "No suitable local voice is available. Install or enable a local voice
for this language, then try again." An unknown locality classification is excluded.
Do not ask the user to enable remote speech.

### Vite build and local loading

- Lock compatible dependency versions during implementation; document a maintained Node
  release satisfying Vite's published requirements, using Node 22.12+ as the minimum
  documented release line. Commit the npm lockfile.
- Use one mode-aware Vite config with sequential content and background production builds.
  The first emits a single content.js IIFE, bundles React/helpers and inline CSS, empties
  dist, and copies public/manifest.json. The second emits background.js as an ES module,
  preserves dist, and disables repeated public copying.
- Use Vite library builds with fixed filenames and the current rolldownOptions output
  configuration to disable code splitting; no dynamic runtime imports, CDN, dev-server
  dependency, or extension build plugin is needed. The manifest points to the module worker.
- Use separate strict TypeScript configurations for content/UI, background, and Node build
  tooling. Planned npm run typecheck invokes all three; npm run build performs the sequential
  production builds. Vite transpilation does not replace the TypeScript gate.
- [quickstart.md](quickstart.md) documents npm ci, npm run typecheck, npm run build; loading
  dist via chrome://extensions → Developer mode → Load unpacked; and rebuilding/reloading/
  re-enabling. The implementation must supply these scripts and the manifest. These future
  commands are not runnable against the current documentation-only repository.

## Phases and Verification Handoff

**Phase 0 — complete**: [research.md](research.md) records decisions, rationale, alternatives,
official references, and the user's resolved activation/privacy choices.

**Phase 1 — complete**: [data-model.md](data-model.md) defines transient entities and transitions;
[contracts/messages.md](contracts/messages.md) defines source ownership and message behavior;
[quickstart.md](quickstart.md) defines future build/load steps and manual checks. The
constitution was re-evaluated after design with the explicit no-automated-tests exception.

**Future implementation order** (to be expanded by $speckit-tasks):

1. Establish strict TypeScript projects, minimal UI dependencies, two Vite builds, manifest,
   and toolbar injection; verify one isolated mount and production extension loading.
2. Add original-DOM article extraction and exact Range mapping, then sentence segmentation.
3. Add typed/runtime-validated messaging, local-voice preflight, native playback controls,
   one-session replacement, and stale callback rejection.
4. Add navigation/document invalidation, memory-only worker lifetime handling, and interruption
   recovery. Complete keyboard operation, status/error presentation, and isolated styling.
5. Run typecheck and production build, then the quickstart's manual scenarios; fix observed
   problems and update README build/use instructions. Install no test runner.

The quickstart maps all FR-001–FR-017 and SC-001–SC-008 to manual or build checks. In particular,
manual acceptance covers exact occurrences, formatting/backward selections, exclusion failures,
all seven speeds, long pauses/background tabs, lifecycle races, local-only voice availability,
and terminal data cleanup. No application source, package manifest, test files, or tasks.md
is created by planning. The design is ready for $speckit-tasks when requested.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Principle VII automated tests and related merge gate omitted | Explicit user MVP scope, repeated in the planning request | Automated checks would contradict the user's instruction; strict typecheck, production build, and manual Chrome verification are the accepted substitute |

Requested React/shadcn/Tailwind dependencies are kept to the few controls in the MVP.
The temporary session-lifetime mechanism and fourth permission address concrete
speech and navigation requirements; they do not add a general background framework.
