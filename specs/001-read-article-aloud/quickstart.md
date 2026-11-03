# Quickstart and Manual Validation: Page Speaker

**Date**: 2026-11-02
**Status**: Implemented and built; manual Chrome verification is pending.
**Related**: [plan](plan.md), [data model](data-model.md),
[message contracts](contracts/messages.md)

The extension is implemented and packaged in dist/. Dependency installation, strict type
checking, and production builds have passed. Browser acceptance checks below have not been
exercised; the user will check the extension in Chrome. See Validation Results at the end.
Do not add automated tests, test runners, or test frameworks.

## Prerequisites

- Desktop Chrome 120+; validate the user's Windows environment first.
- A maintained Node release meeting Vite's requirements, with Node 22.12+ as the minimum
  documented release line, and npm.
- A suitable installed on-device English voice. Remote or unclassified voices are excluded.
- The implemented project with package.json, committed package-lock.json, strict TypeScript
  projects, Vite configuration, source files, and public/manifest.json.

## Build locally

From the repository root:

```powershell
npm ci
npm run typecheck
npm run build
```

Expected results: dependency installation follows the lockfile; all strict content/UI,
background, and Node configuration checks pass; both production builds succeed. The build
first emits a bundled IIFE content script with inline styles, then an ES-module worker while
preserving the first output. Verify these packaged files exist:

```text
dist/
├── manifest.json
├── content.js
└── background.js
```

The manifest must be MV3, name background.js as its module service worker, expose the toolbar
action without a default popup, and request exactly activeTab, scripting, tts, webNavigation.
There must be no persistent host permissions, automatic content-script matches, storage
permission, remote script URLs, or dev-server runtime. Other generated metadata is acceptable
only when it has a documented build purpose.

## Load and use in Chrome

1. Open chrome://extensions and enable Developer mode.
2. Choose Load unpacked and select the repository's dist directory.
3. Open an ordinary text article in its own top-level tab. Pin Page Speaker if needed.
4. Click the Page Speaker toolbar button to enable that document. This does not start speech.
5. Select a word or phrase in the article. Choose the nearby "Read from here" button.
6. Expect Starting then Playing; listen from the exact selection through the remaining article.
7. Use Pause, Resume, Stop, and the labeled speed select. The panel stays visible while scrolling.
8. A new/reloaded document requires toolbar activation again. Selecting text alone never enables
   another document. A same-document article route change stops speech but retains that
   document's already-enabled selection detection.

After source changes, rebuild, click Reload on the extension card, reload the article tab,
and enable it again. Extension reload invalidates old content-script connections; do not
attempt to keep using a stale panel.

## Manual acceptance checks

Use five representative loaded articles: a simple article, headings/lists, inline formatting
with repeated words, surrounding navigation/ads/sidebar, and a long article. Choose a clear
expected starting occurrence and article ending for each. Report pass/fail and the environment;
do not add article text, selected passages, or reading history to diagnostic logs.

### M1 — Activation and unsupported documents

Before toolbar activation, select text: no reading action appears. Enable the tab, then select:
one action appears and no speech starts until chosen. Click the toolbar button repeatedly:
one UI mount and listener set remain. Verify another tab stays unactivated.

Reload or navigate to a new document: speech stops and the new document needs activation.
Attempt activation on a browser-internal page or PDF: show an action-level limitation, with
no unrelated speech. Select text inside an editable field or embedded frame: no action.

### M2 — Exact starting point and extraction

On all five pages, select in the middle of a paragraph and confirm speech starts at that
exact occurrence within 5 seconds of activation of the reading button. The action should
appear within 1 second of a completed valid selection.

Also select a later repeated phrase, part of a word, backwards text, text across inline
markup, and multiple paragraphs. Confirm no jump to an earlier phrase, missing initial
characters, or spaces inserted inside a formatted word. Reading continues beyond the
selection to the article ending in order.

Scroll below the fold and select there: offscreen text that follows remains readable.
Navigation, ads, sidebars, hidden text, and comments outside the article are not read.
Finish at the article end: status is Finished and Resume is unavailable.

### M3 — Invalid and changed selections

Try whitespace, a non-article area, a selection crossing outside the article, and a page
without an identifiable main article. Where an action can be offered, choose it and expect
a clear explanation with zero unrelated speech. Whitespace/collapsed selections show no action.

Using Chrome's page inspector, change/remove the selected node before choosing the action:
expect a stale-selection message. Replace or clear a pending selection: the action updates
or disappears. Clicking or keyboard-focusing the action must preserve its intended bookmark.
If another session is active, every rejected reading request leaves it playing unchanged.

### M4 — Controls, speeds, and accessible UI

Start a long article, pause midway through a sentence, wait, and resume. Confirm it continues
at the native paused position without restarting the sentence. Stop while playing and while
paused: silence within 1 second, Stopped status, and no Resume of the old session.

Try all seven speeds: 0.5×, 0.75×, 1×, 1.25×, 1.5×, 1.75×, 2×. Each applies by the next
sentence without skipping unread words. Change speed while paused: it stays paused; the
resumed in-flight sentence keeps its existing rate and subsequent speech uses the new rate.
A fresh session starts at 1×.

Complete select, start, pause, resume, speed change, and stop with keyboard controls.
Check clear labels, visible focus, native select operation, disabled invalid actions,
accessible state announcements, and accessible errors. Scroll top to bottom, resize the
window, zoom, and try a page with unusual root font sizes: all controls remain reachable
and page styles stay unaffected.

### M5 — Session replacement and source lifecycle

Start in tab A, enable tab B, and start there: A ends before B speaks. A new selection alone
does not stop B. Rapidly issue start/stop/replacement actions: no overlap, revived old speech,
or stale error/status update may overwrite the new session. Reject an invalid request in A:
B must continue.

Repeat reload, full navigation, and source-tab closure while Starting, Playing, and Paused.
All pending and active source work ends. Test a source-tab replacement when available.
Change article path/query through the site's History API navigation: speech stops. Jump to
a fragment within the same article or switch tabs without starting elsewhere: speech continues.
Ordinary article appends do not change the frozen reading text; replacing the article root
invalidates the session. Returning through browser back/forward must not resume old speech.

### M6 — Local voices, errors, and worker lifetime

Inspect available voice metadata using the worker's Chrome APIs. Only explicitly local,
language-compatible voices with required events may be chosen. Verify no suitable local
voice produces the clear local-voice message and never uses a remote voice. Check remote-only,
missing-locality, and unsuitable-language/capability cases. If the machine cannot naturally
produce a case, temporarily override voice discovery in worker DevTools for that manual
check, then reload the extension to restore it. Do not add permanent fault-injection code.
Also check a remote/unclassified voice sharing the chosen local voice's selector: reject
that ambiguous candidate instead of risking selection of the other voice.

Repeat a no-local-voice request while another session is active: the old session is unchanged.
Remove/disable the pinned local voice during a session and verify a clear Error without
a remote or default-voice fallback. Interrupt TTS from worker DevTools to verify interruption/
failure handling. A missing start event must time out clearly rather than remain Starting.

Close all worker/content DevTools before lifetime measurements: play longer than five minutes,
pause for more than five minutes, then resume; keep the source tab in the background for more
than five minutes. Normal sessions retain controls and position. Stop or finish and verify
the session lifetime timer is removed so the worker can become idle.

For exceptional recovery, force-stop the worker through Chrome's service-worker inspection
tools, then return to the source tab. Orphaned speech must be cancelled on recovery; show a
session-interrupted message, require a fresh selection, and do not replay old content.
A stale cleanup request from an old tab must not stop a newer session. Idle reconnection
must not show a false playback error.

### M7 — Privacy, terminal cleanup, and reproducibility

After Stop, Finished, Error, replacement, and navigation, inspect the extension's state and
source handling: no text buffers, DOM bookmarks, playback cursor, pending callbacks, or
session timer may remain for the ended session. A live enabled document may retain only
its current connection/route metadata and content-free terminal display.

Review source/storage/network behavior for no content/history persistence, no analytics or
article-text logging, and no extension-generated speech network request. No storage API is
needed. Restart Chrome and return to the page: there is no saved session or reading position.
Do not interpret browser/OS voice-engine implementation as independently audited by this check.

Finally follow the build/load steps from a clean implemented checkout. No undocumented
commands or configuration edits may be required for one complete article-reading session.

## Coverage and reporting

| Check | Functional requirements | Success criteria |
| --- | --- | --- |
| Build and load | FR-015, FR-017 | SC-007 |
| M1 Activation/unsupported | FR-001, FR-002, FR-016 | SC-005, SC-008 |
| M2 Start/extraction | FR-002, FR-003, FR-004, FR-011 | SC-001, SC-002 |
| M3 Rejection/bookmark | FR-002, FR-003, FR-005, FR-016 | SC-002, SC-005 |
| M4 Controls/accessibility | FR-006, FR-007, FR-008, FR-011, FR-012 | SC-003, SC-004 |
| M5 Replacement/lifecycle | FR-005, FR-009, FR-010, FR-011 | SC-005 |
| M6 Voices/errors/lifetime | FR-005, FR-007, FR-011, FR-014 | SC-001, SC-003, SC-005, SC-008 |
| M7 Privacy/reproducibility | FR-013, FR-014, FR-015, FR-017 | SC-006, SC-007 |

Record Chrome/OS/Node versions, local voice identity, typecheck/build results, manual check
IDs and pass/fail/not-exercised status, and concise defect descriptions without webpage
content. A check not exercised must not be reported as passing. These are future acceptance
criteria, not a completed runtime-validation report.

## Validation Results — 2026-11-02

Implementation is ready for the user's Chrome check. No automated tests or test framework
were added, and no browser verification is claimed.

Environment: Windows; Node 25.2.1; npm 11.6.2; TypeScript 7.0.2; Vite 8.3.5;
React 19.3.1; Tailwind CSS 4.3.3. The environment's default Node/npm shim was broken, so
commands used the installation in C:\Program Files\nodejs with that directory prepended to PATH.
README.md documents this workaround.

| Check | Result | Evidence |
| --- | --- | --- |
| Lockfile dependency reinstall | PASS | npm ci --offline completed; 49 packages audited, zero reported vulnerabilities |
| Strict TypeScript checking | PASS | npm run typecheck passed for content/UI, background, and build configuration |
| Production packaging | PASS | npm run build emitted manifest.json, content.js, and background.js in dist/ |
| Static permission/dependency/privacy review | PASS | Four planned permissions; no broad host/storage access, test framework, persistence API, content logging, or network client in application source |
| M1–M3: activation, exact start, extraction/refusal | NOT EXERCISED | User Chrome verification pending; task T017 remains unchecked |
| M5–M6: session/source safety, local voices, worker lifetime | NOT EXERCISED | No successful Chrome inspection was performed; task T024 remains unchecked |
| M4 and Paused M5–M6: controls, keyboard, long pause | NOT EXERCISED | User Chrome verification pending; task T030 remains unchecked |
| M7 and final reading smoke check | NOT EXERCISED | User Chrome verification pending; task T034 remains unchecked |

Load C:\projects\page-speaker\Page-Speaker\dist through Chrome's Load unpacked action.
Enable the toolbar button on an article, select a starting phrase, and choose Read from here.
Audible speech, actual installed-voice metadata, keyboard operation, extraction on the five
sample layouts, and long-session behavior require those manual checks before MVP acceptance.
