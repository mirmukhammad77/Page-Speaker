# Message Contracts: Page Speaker

**Date**: 2026-11-02
**Protocol**: 1
**Status**: Phase 1 design complete
**Related**: [data model](../data-model.md), [plan](../plan.md),
[manual checks](../quickstart.md)

This is an internal Chrome-extension protocol between the content script and background
worker. It defines future shared TypeScript discriminated unions and runtime guards; this
document does not implement them. There are no network endpoints.

## Transport and authority

- After toolbar injection, content opens one runtime.Port named page-speaker:v1.
  The worker sends WELCOME before accepting commands. Only top-frame connections from this
  extension's own content script qualify.
- Derive tabId, frameId, and documentId from browser sender metadata. Never accept these
  identities, a voice identity, or the local/remote policy from a payload.
- All messages are plain JSON objects. Field kind is the discriminant; v is exactly 1.
  Reject unknown kinds, incorrect field types, unsupported versions, and non-finite rates
  before side effects. Text is treated as untrusted plain text.
- Content-to-worker requests carry a unique requestId, current workerId, and sourceEpoch.
  Request IDs correlate replies, not authorization. Worker-issued identity and epoch must
  match the live connection. Do not replay start/control commands after reconnection.
- Session controls additionally carry sessionId. Only that session's source connection and
  epoch may control it. A different tab can replace it only through a valid START.
- Worker state updates carry sessionId and monotonically increasing revision. The UI ignores
  lower revisions, unknown sessions, and old-worker messages. It adopts a new session only
  from its matching accepted START response.
- No external extension listener, webpage postMessage bridge, storage channel, or telemetry
  is used. Never log request payloads or raw engine error strings.

## Content → background requests

Common fields: v, kind, requestId, workerId, sourceEpoch. Fields below are additional.

| Kind | Additional fields | Preconditions / effect |
| --- | --- | --- |
| START | text: non-whitespace string; lang: language hint string | Source is live; preflight local voice and latest source; accept a fresh session at rate 1 |
| PAUSE | sessionId | Own current Playing session; native pause and prevent next-segment scheduling |
| RESUME | sessionId | Own current Paused session; resume its native utterance or next unsubmitted segment |
| STOP | sessionId | Own active session; invalidate callbacks, stop TTS, release text and timers |
| SET_RATE | sessionId; rate: one of seven supported numbers | Own Playing/Paused session; update pending rate without restarting the utterance |
| CANCEL_START | targetRequestId | Cancel only this source's matching pending START; never cancel another tab's work |
| INVALIDATE_SOURCE | reason: pagehide or article-replaced | Invalidate this source epoch, pending starts, and its own session only |

START sends only the normalized suffix after the selected boundary and a language hint.
It does not send HTML, the selection string separately, a webpage URL, DOM paths, or a full
article preceding the start. The worker independently segments it and chooses an eligible
voice. Language hints cannot enable remote speech.

Repeated STOP for a known source-local terminal session is harmless and returns its terminal
state; an unrelated or unknown session is rejected. Repeating a requestId while it is still
pending must not start duplicate work. Retain only bounded transient request correlation,
not a permanent request log.

## Background → content messages

All messages carry v and workerId. Request replies also carry requestId.

| Kind | Fields | Meaning |
| --- | --- | --- |
| WELCOME | sourceEpoch; state: Idle | Handshake for this live document; no previous session is restored |
| START_ACCEPTED | requestId; sourceEpoch; sessionId; revision; state: Starting; rate: 1 | Ownership accepted; any previous active session has been stopped |
| ACK | requestId; sourceEpoch; sessionId if applicable; snapshot if applicable | A control or cancellation completed; snapshot contains current state |
| REJECTED | requestId; code; message | This request failed before taking effect; do not overwrite a different active session's status |
| STATE | sourceEpoch; sessionId; revision; state; rate; optional reason and error | Authoritative source-local playback state |
| SOURCE_RESET | sourceEpoch; reason | Route or article root invalidated; drop stale selection/request state and use the new epoch |

A snapshot is sessionId, revision, state, rate, and optional reason/error. State is Starting,
Playing, Paused, Stopped, Finished, or Error. Error contains a stable code and fixed,
user-facing message, never article text or an unfiltered engine message. A terminal snapshot
contains no cursor, segment index, article title/URL, or text.

A rejected START can show a source-local request error alongside the existing playback
status; it must not falsely report that another session stopped or failed. A START_ACCEPTED
reply precedes state messages for that new session on its port. Replaced sessions receive
Stopped with reason replaced on their own source port when it is still connected.

## START acceptance and races

1. Check the envelope and current browser-issued source identity.
2. Register this as the newest pending START; invalidate an older pending start, preserving
   the existing accepted session. The superseded request gets REQUEST_SUPERSEDED if reachable.
3. Validate text/language, segment it, and discover a qualifying on-device voice. Resolve
   the current top-frame document/route using browser data after asynchronous preflight.
4. Recheck pending generation, connected source, sourceEpoch, and document identity.
   Any invalidation rejects the request and releases its text.
5. Atomically invalidate the old session's callbacks, call TTS stop, release its text,
   create a new session at rate 1, and send START_ACCEPTED.
6. Submit its first utterance and publish Playing only on the engine's start event.
   API acceptance alone does not mean speech is audible or completed.

A source navigation during steps 1–4 cannot produce delayed speech. Stop or Cancel Start
from the owning source invalidates its pending request where applicable. Old callbacks
cannot progress the new session. A failure after step 5 produces Error for the accepted
new session; it does not restore the previous one.

Before each subsequent utterance, verify the pinned voice is still explicitly local and
eligible. Never remove voiceName or optional extensionId to retry with Chrome's default voice.
Reject ambiguous selectors that could also match a remote/unclassified voice: name alone
for an engine without extensionId, or name/provider pair otherwise. Unexpected native
interrupted/cancelled events end the accepted session with SPEECH_ERROR; expected events
from an invalidated Stop/replacement generation are ignored.

## Lifecycle and recovery

- Worker registers action, connection, tab, and navigation listeners synchronously.
- Port disconnection invalidates that connection's pending and active session. Treat
  pagehide messages as best effort; navigation and tab events are independent stop guards.
- Full source navigation/reload terminates its session and the old document activation.
  Same-document article path/query changes terminate playback, advance sourceEpoch,
  and send SOURCE_RESET while leaving the existing selection listener enabled.
  Fragment-only changes and other-tab/subframe navigation do not stop speech.
- INVALIDATE_SOURCE also advances the epoch and emits SOURCE_RESET when the document is
  still reachable. A current source then acknowledges/uses the new epoch for future
  selections; a departing document is never restored by a late reply.
- Worker startup creates a fresh workerId and cancels orphaned TTS before accepting
  new requests. Native callbacks and article state are not restorable after worker loss.
- A disconnected live content script can make one runtime.sendMessage request
  RECOVER_CONNECTION with v, requestId, previousWorkerId, and optional previousSessionId.
  Validate its browser sender. On a fresh worker, bootstrap already handled stale speech.
  On the same still-running worker, cleanup may affect only that sender's exact matching
  old session; an obsolete recovery request must never stop a newer or another-tab session.
  Reply RECOVERED with v, requestId, and current workerId, then establish a new Port.
- Reconnection never resubmits text or resumes speech. A source that lost an active session
  clears text and presents SESSION_INTERRUPTED; an idle source reconnects silently.

## Rejections and errors

| Code | When | User-facing behavior |
| --- | --- | --- |
| INVALID_MESSAGE | Invalid shape, kind, version, or rate | Explain invalid control request; no playback mutation |
| STALE_SOURCE | Old worker/source epoch, disconnected or navigated document | Ask for a fresh selection on the current article |
| STALE_SESSION | A session was replaced or ended | Show current state; do not resume old speech |
| INVALID_STATE | Pause/Resume/rate action unavailable in this state | Keep current state and enable only valid controls |
| EMPTY_TEXT | No readable suffix | Explain that no readable article text remains |
| REQUEST_SUPERSEDED | A newer pending START replaced this request | Quietly discard the obsolete request and its text |
| NO_LOCAL_VOICE | No compatible explicitly local voice with required events | "No suitable local voice is available. Install or enable a local voice for this language, then try again." |
| VOICE_UNAVAILABLE | Pinned local voice disappears after acceptance | End with Error; ask user to enable the local voice and select again |
| SPEECH_ERROR | API rejection or engine failure after acceptance | End with Error and a clear retry suggestion |
| SPEECH_TIMEOUT | No start event within 5 seconds or a playing segment stalls | Stop; explain speech did not respond; ask for a fresh request |
| SESSION_INTERRUPTED | Detected worker/connection loss during a session | End with Error; require a new selection |

Extraction failures stay local to content and use ARTICLE_NOT_FOUND, START_NOT_FOUND,
SELECTION_CHANGED, or UNSUPPORTED_SELECTION with a clear selection/article explanation.
Unsupported injection uses the toolbar's error indication; it cannot depend on content UI.

A start timeout is cancelled at the utterance start event. A generous 120-second active
speech watchdog per 500-code-unit segment catches a missing terminal event; suspend it
during native pauses and discard it on every terminal or replacement path. This is a
project safeguard rather than a browser guarantee.

## Privacy and cleanup invariant

Only START crosses the extension boundary with webpage text. State/reply/recovery messages
never contain content or history. Release pending/accepted text on all rejection, cancellation,
replacement, Stop, Finished, Error, and source-loss paths. Retain at most the current panel's
content-free terminal display; do not collect past session records.
