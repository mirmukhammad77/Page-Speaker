# Data Model: Page Speaker

**Date**: 2026-11-02
**Status**: Phase 1 design complete
**Related**: [specification](spec.md), [plan](plan.md),
[message contracts](contracts/messages.md)

All entities are transient. No database, browser storage, saved reading position, webpage
content log, or reading history is part of this model.

## Ownership and boundaries

| Context | Owns | Does not own |
| --- | --- | --- |
| Content script | Activation mount, selection bookmark, DOM source spans, transient extraction request, React view state | Speech engine, another tab's session |
| Background worker | Validated source connections, one pending start, one active session, voice identity, utterance scheduling | DOM nodes, persistent content or history |
| React controls | Current status, selected speed, accessible messages and action callbacks | Extraction policy, native playback state |
| Shared modules | JSON message shapes, guards, segment offset rules | Browser runtime or persistence |

## SourceBinding

A connection established by the injected top-frame content script.

| Field | Meaning / validation |
| --- | --- |
| tabId | Browser-supplied integer identifying the source tab |
| frameId | Must be 0; frames are unsupported |
| documentId | Browser-issued document identifier, not a payload claim |
| sourceEpoch | Worker-issued integer; changes when this document's route or article root is invalidated |
| articleUrl | Transient browser-derived URL without a fragment; used only for navigation comparison |
| port | Runtime connection scoped to this injected document |
| connected | False immediately invalidates pending/active work belonging to the connection |

Only toolbar invocation injects a new document. Repeated invocation reuses its existing mount.
A same-document article navigation ends the session and advances sourceEpoch while selection
detection stays enabled. A new/reloaded document needs fresh toolbar activation. Closed ports
are removed from the registry; the registry is not a navigation log.

## SelectionBookmark

Content-only data: start/end node references, raw UTF-16 offsets, saved selected text,
selection rectangles, and the source epoch at capture. The saved Range is in document order,
even for a backward selection.

Validation requires non-whitespace text, connected unchanged endpoints, a non-editable
main-document selection, and a wholly contained eligible article region. An element-node
boundary resolves to the next eligible text position in Range order. A real selection change
invalidates the bookmark; interaction with the extension's own action preserves it.

Discard on selection replacement/clear, source invalidation, request acceptance/rejection,
or unmount. Do not send nodes, rectangles, or the original full webpage to the worker.

## ArticleSnapshot and SourceSpan

The content script identifies one coherent article root and extracts only its suffix from
the selected boundary.

- **SourceSpan**: original Text node identity, raw start/end offsets, containing block,
  and position in the ordered eligible traversal.
- **ArticleSnapshot**: source epoch, root identity, normalized article suffix, and language hint.
  Source spans are temporary mapping data; they are not sent with the snapshot text.

Clip the initial span before normalizing whitespace. Inline markup must not split a word;
block boundaries introduce intentional separators. Reject a stale or excluded start rather
than searching for an equal string elsewhere. Later article additions do not change an
accepted snapshot. Root removal/replacement invalidates its source; ordinary append-only
changes do not.

The content script drops the text after START is accepted or rejected. The background
retains only the data needed for the active session.

## SpeechSegment

| Field | Meaning / invariant |
| --- | --- |
| index | Zero-based utterance order |
| start, end | Half-open UTF-16 interval in the normalized suffix |
| text | Exactly the suffix slice for that interval; never HTML supplied for rendering |

Segments follow sentence boundaries, with a 500-code-unit cap and word-boundary splitting
for oversized sentences. A single unbroken token can split only at a safe Unicode boundary.
Do not split a surrogate pair. Avoid whitespace-only utterances by attaching separators to
an adjacent segment. Intervals cover the entire readable suffix in order without overlapping
or omitting words. Do not truncate a long article.

The worker may retain the segment strings instead of a duplicate suffix buffer after
segmentation. Release all strings when the session ends.

## LocalVoice

Fields: non-empty voiceName, optional extensionId, compatible language, remote fixed to false,
and supported event types.

A voice qualifies only when the browser explicitly reports remote false and start/end support.
Missing locality or capability metadata is not treated as permission to use the voice.
Prefer an exact article language, then the same base language; for an unlabeled English
baseline article use English. A declared unsupported language fails rather than being read
with an arbitrary language. Choose deterministically among otherwise equal eligible voices.

Pin the named identity for the session and revalidate before each utterance. No picker,
remote fallback, or automatic substitution is included. Availability failure before
acceptance rejects START without replacing current speech; failure after acceptance ends
that session with Error.

The speak selector must be unambiguous with respect to locality. When extensionId is absent,
a matching name alone must not also identify any remote or unclassified voice. When an
extensionId is present, apply the same rule to the matching name/provider pair. Exclude
an ambiguous selector rather than trusting whichever voice the engine happens to choose.

## PendingStart

Fields: requestId, source connection and epoch, workerId, start generation, transient text,
and preflight status.

There is at most one current pending start. A newer START supersedes an older pending one,
without interrupting active speech. After asynchronous voice/source validation, acceptance
must recheck the pending generation, live document/route, and connection. Invalidated or
superseded requests cannot become sessions. Drop their text immediately.

## ReadingSession

| Field | Meaning |
| --- | --- |
| workerId, sessionId | Worker incarnation and unique session identity |
| generation | Internal cancellation generation for speech callbacks |
| source | Owning SourceBinding and source epoch captured at acceptance |
| state | Starting, Playing, or Paused while active |
| segments, segmentIndex | Transient ordered speech data and current utterance |
| utteranceToken | Identity of the single in-flight utterance |
| voice | Pinned LocalVoice |
| requestedRate | One of 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2; initially 1 |
| utteranceRate | Rate used for the in-flight native utterance |
| pauseIntent | Prevents scheduling another utterance while paused |
| revision | Monotonic state revision for the session |
| lifetimeTimer | Session-scoped worker lifetime extension, cleared at termination |

There is at most one active session across tabs and one in-flight utterance. Native TTS owns
the position within that utterance; do not estimate a resume offset or store one for later.

## State transitions

Idle is an internal absence of a session; it need not display a playback panel.

| Current state | Trigger | Result |
| --- | --- | --- |
| Idle or terminal view | Valid START accepted | Starting, new identity, rate 1 |
| Starting | Native start event | Playing |
| Starting | Stop, replacement, or source invalidation | Stopped; pending callbacks cannot speak |
| Playing | Pause | Paused using native pause; retain current utterance |
| Paused | Resume | Playing using native resume, or submit next segment if between utterances |
| Playing / Paused | Set rate | State unchanged; new requestedRate applies to the next segment |
| Playing | Segment end with remaining text | Advance once; submit next segment unless pauseIntent is set |
| Paused | Segment end arrives at a boundary | Retain Paused; advance the completed segment once, do not speak next |
| Playing | Final segment end | Finished |
| Any active state | Stop, replacement, document/route loss | Stopped |
| Any active state | API/engine/voice failure or detected worker interruption | Error |
| Any state | Stale command/event | Ignore callback or reject command; current session unchanged |

Pause is enabled only while Playing, Resume only while Paused, Stop in all active states,
and rate selection while Playing or Paused. A speed change does not restart a paused native
utterance. No terminal state can transition to Playing without a fresh accepted START.

## TerminalView and cleanup

After Stopped, Finished, or Error, keep only the source-local panel's session identifier,
terminal status, displayed rate, revision, and optional sanitized error code/message.
The panel can remain visible until a new accepted session replaces it or the page is left.

Invalidate callback generations before stopping TTS. Clear segment text, selection text,
DOM bookmarks, current cursor/index, source article URL for the ended session, timers, and
pending asynchronous continuations. The live source connection may retain its current
document identity and route comparison URL solely for this enabled document's operation.
Do not accumulate previous session records.

A worker restart creates a new workerId, cancels orphaned speech before new work is accepted,
and does not restore session content. A source with an interrupted active session displays
Error and requires a new selection; idle reconnection does not display a spurious error.
