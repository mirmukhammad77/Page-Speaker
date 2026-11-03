# Feature Specification: Page Speaker — Read Article Aloud

**Feature Branch**: Not created; no branch hook is configured.

**Feature Directory**: specs/001-read-article-aloud

**Created**: 2026-11-02

**Status**: Approved for planning — clarification gates resolved

**Input**: Personal-use Chrome extension that reads the main article from the beginning of a
user selection, with a nearby "Read from here" action and floating playback controls.
Specification only; keep the MVP small.

## Clarifications

### Session 2026-11-02

- Activation: The user enables each tab through the extension toolbar button. After
  activation, selecting article text shows "Read from here." A new or reloaded document
  requires activation again; selecting text on an unactivated page does not activate it.
- Voices: Use on-device voices only. Exclude remote voices and voices whose local status
  cannot be established. If no suitable local voice is available, show a clear message
  without starting a new session or falling back to remote speech.

## User Scenarios & Testing *(mandatory)*

Acceptance scenarios below are manual checks, not requests for automated tests.

### User Story 1 - Read from a chosen point (Priority: P1)

As a reader, I select text in an article and choose "Read from here" so I can listen from
that point through the rest of the article.

**Why this priority**: This is the extension's primary value.

**Independent Test**: On an ordinary article, select text midway through a paragraph,
activate the reading action, and listen through the following paragraphs and article ending.

**Acceptance Scenarios**:

1. **Given** Page Speaker is active on a supported page, **When** I finish selecting non-empty
   article text, **Then** a clearly labeled "Read from here" button appears near the selection,
   within the visible window, without starting speech.
2. **Given** a valid selection, **When** I activate the button, **Then** reading begins at the
   earliest selected character in document order, includes the selected text, and continues
   through the remaining article in order, rather than stopping at the selection boundary.
3. **Given** the same words appear earlier in the article, **When** I select their later
   occurrence, **Then** reading starts at that occurrence without jumping to the earlier one.
4. **Given** an article with navigation, advertisements, a sidebar, and hidden text outside
   its reading flow, **When** reading starts, **Then** it reads the article body without
   including those unrelated areas.
5. **Given** a non-article selection or a starting point that cannot be matched to the main
   article, **When** I request reading, **Then** a clear message explains the problem and no
   unrelated text is spoken.
6. **Given** a pending selection, **When** I replace or clear it before starting,
   **Then** the action updates to the new selection or disappears; activating the action
   itself retains its intended starting point.
7. **Given** a tab that has not been enabled, **When** I select article text, **Then** no
   reading action appears; **When** I enable it through the extension toolbar button and
   select text, **Then** "Read from here" appears without speech starting automatically.
8. **Given** an enabled page, **When** I activate the toolbar button again, **Then** it
   remains enabled with one set of controls; **When** the page reloads or a new document
   opens, **Then** I must enable that document before selecting text can offer reading.

### User Story 2 - Control listening while scrolling (Priority: P2)

As a listener, I pause, resume, stop, and change the speed from a small floating panel
that stays available while I scroll.

**Why this priority**: These controls make listening usable without interrupting browsing.

**Independent Test**: While reading a long article, scroll, pause and resume, adjust speed,
and stop using both pointer and keyboard controls.

**Acceptance Scenarios**:

1. **Given** a reading request is accepted, **When** playback is starting or active,
   **Then** a compact panel is visible with playback status and labeled Pause, Resume,
   Stop, and reading speed controls; unavailable actions are clearly disabled.
2. **Given** active playback, **When** I pause, **Then** speech stops and status becomes
   Paused; **When** I resume, **Then** reading continues from the paused position.
3. **Given** playing or paused speech, **When** I choose Stop, **Then** the session ends,
   status becomes Stopped, and Resume cannot restart it; a new selection is needed to read again.
4. **Given** a session at normal speed, **When** I choose a speed between 0.5× and 2×,
   **Then** the displayed value updates and subsequent speech uses that speed by the next
   sentence without skipping unread text; a paused session remains paused.
5. **Given** the panel is visible, **When** I scroll from the top to the bottom of the page,
   **Then** it remains inside the visible window with every control reachable.
6. **Given** a selection made with the keyboard, **When** I move focus to "Read from here"
   and operate playback controls, **Then** I can complete the flow without a pointer,
   see focus, and identify control names, speed, status, and errors accessibly.

### User Story 3 - End safely and understand failures (Priority: P1)

As a listener, I want only my current session to play, with clear endings and failures,
and no saved webpage content or reading history.

**Why this priority**: Unwanted speech, silent failures, or retained reading data undermine
the personal reading workflow.

**Independent Test**: Replace an active session, reload or leave its page, reach the article
end, and try unavailable speech; inspect each result and manually review data handling.

**Acceptance Scenarios**:

1. **Given** playing or paused speech, **When** I start a valid new session on this or
   another tab, **Then** the old session ends before the new one starts and cannot resume.
2. **Given** an active session, **When** I make a new selection without starting it,
   **Then** the current session continues unchanged.
3. **Given** playing, paused, or starting speech, **When** its source page reloads,
   navigates to another page or article, or closes, **Then** the session ends and cannot
   later resume or emit delayed speech.
4. **Given** the last article text has been read, **When** playback finishes,
   **Then** status becomes Finished, no unrelated content follows, and Resume is unavailable.
5. **Given** an accepted session encounters a speech failure, **When** playback cannot
   continue, **Then** speech ends, the panel reports Error with a clear explanation and
   recovery suggestion, and it does not silently restart or read different content.
6. **Given** a completed, stopped, replaced, or failed session, **When** I later use the
   extension or reopen the page, **Then** it offers no saved content, history, or saved position.
7. **Given** only remote, unclassified, or unsuitable voices are available, **When** I
   request reading, **Then** a clear message says no suitable local voice is available,
   no new speech begins, and any existing session is unchanged.

### Edge Cases

- Whitespace-only or collapsed selections do not offer reading. Selections in editable
  fields or embedded frames are ignored.
- Selections spanning formatting, paragraphs, or made backwards start at the first selected
  character in document order. Partial-word selections start exactly where selected.
- A selection crossing outside the identified article is rejected with a clear message.
- If selected text changes or disappears before reading starts, reading is rejected.
  Once started, reading uses the article text available at session start; later additions
  are not included. Navigation to a different article still ends the session.
- An ambiguous article, an unsupported page, or no readable text after the starting point
  produces a clear message rather than falling back to the whole page.
- PDF documents, browser-internal pages, and pages that prohibit extension access are
  unsupported. Where controls can be shown, a reading attempt explains the limitation.
- Starting, pausing, stopping, and replacing sessions in rapid succession cannot revive
  stopped speech or make an obsolete session overwrite the current status.
- Switching tabs alone does not stop reading; only starting another session or ending the
  source page does. A fragment-only jump within the same article does not end the session.
- No suitable on-device voice, unclassified voice locality, or unsupported article language
  produces a clear message instead of silent playback or a fallback to remote speech.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Page Speaker MUST enable selection detection on a supported article page only
  after the user activates that tab through the extension toolbar button. Selecting text
  afterward MUST show "Read from here." Repeated activation MUST NOT duplicate controls.
  A new or reloaded document MUST require activation again; pages MUST NOT activate automatically.
- **FR-002**: For a non-empty, non-editable main-page selection, the extension MUST show a
  keyboard-accessible "Read from here" button near that selection, keep it within the
  visible window, update it for a replacement selection, and hide it when cleared.
- **FR-003**: Activating that button MUST preserve the intended selection and read from
  its first selected character in document order through the article's end exactly once,
  including content after the selection. Repeated text MUST NOT change the starting point.
- **FR-004**: Reading MUST use the main article's visible text in reading order, including
  its paragraphs, headings, and lists after the starting point. It MUST exclude navigation,
  advertisements, sidebars, hidden text, and comments outside the article where identifiable.
- **FR-005**: If the article or a wholly contained starting selection cannot be identified,
  or no readable text remains, the extension MUST explain why reading cannot start and MUST
  NOT read an alternative region or the entire page. Rejected requests MUST leave any
  existing session unchanged.
- **FR-006**: Accepted reading requests MUST show a compact floating panel with Pause,
  Resume, Stop, speed, and current status. The panel MUST stay within the visible window
  during scrolling, including while paused.
- **FR-007**: Pause MUST retain the current position; Resume MUST continue from it;
  Stop MUST end the session and make that session impossible to resume.
- **FR-008**: Speed MUST default to 1× for each new session and be selectable from 0.5×
  to 2× in 0.25× steps. Changes MUST apply by the next sentence without skipping unread
  text or automatically resuming paused speech.
- **FR-009**: At most one reading session MUST be active across the extension's tabs.
  A new valid session MUST end any previous session before speaking; selecting alone
  MUST NOT interrupt playback.
- **FR-010**: Source-page reload, navigation to another page or article, or closure MUST
  end starting, playing, and paused sessions and discard delayed speech. Tab switching
  and same-article fragment jumps MUST NOT end playback.
- **FR-011**: The panel MUST distinguish Starting, Playing, Paused, Stopped, Finished,
  and Error. Actions MUST only be enabled when applicable; errors MUST provide a clear
  explanation and recovery suggestion without exposing webpage content in diagnostics.
- **FR-012**: All extension controls MUST have clear accessible names, visible keyboard
  focus, and keyboard operation; status and error changes MUST be available to assistive
  technology without requiring a pointer.
- **FR-013**: The extension MUST NOT persist webpage content, selected text, reading
  positions, or reading history, including in logs or analytics. Session text MUST be
  held only while needed and released when the session ends.
- **FR-014**: Speech MUST use only suitable on-device voices. Remote voices and voices whose
  on-device status cannot be established MUST be excluded. If none is available, the
  extension MUST show a clear "No suitable local voice is available" message, MUST NOT
  start a new session, and MUST NOT fall back to a remote voice. An existing session MUST
  remain unchanged when a new request is rejected during voice selection.
- **FR-015**: Access MUST be limited to permissions necessary for this reading workflow,
  with each requested permission's purpose documented.
- **FR-016**: The extension MUST ignore editable-field and embedded-frame selections and
  MUST NOT attempt PDF reading. Unsupported or inaccessible pages MUST NOT trigger fallback
  reading of unrelated content.
- **FR-017**: User documentation MUST explain how to build locally, load the extension
  into Chrome, use the selection and playback flow, and perform manual acceptance checks.

### Key Entities *(include if feature involves data)*

- **Starting selection**: The user-chosen source page and exact article location, valid
  only while the pending reading request can still be matched to that page.
- **Article reading text**: The transient main-article text from that starting location
  through the article ending, excluding identifiable unrelated content.
- **Reading session**: One source page, starting location, transient reading text,
  current position, playback state, and selected speed; never a saved history record.
- **Playback status**: The current session state or failure explanation presented by the panel.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: On each of five manually chosen supported article pages, a valid selection
  shows "Read from here" within 1 second, and activation starts audible reading within
  5 seconds when a suitable local voice is available.
- **SC-002**: On all five pages, reading starts at the exact selected occurrence and
  continues through the article ending in order, with no identifiable navigation, ad,
  sidebar, or hidden text spoken. Checks include repeated text and multi-paragraph selections.
- **SC-003**: Pause and Stop silence speech within 1 second; Resume retains the paused
  position; each of the seven supported speed settings is usable without skipping unread text.
- **SC-004**: Every playback control remains visible during top-to-bottom scrolling and
  the complete select, start, pause, resume, change-speed, and stop flow works by keyboard.
- **SC-005**: Every manual unsupported-page, invalid-start, and speech-failure scenario
  produces a clear explanation and zero unrelated speech. New-session and source-page
  lifecycle checks produce no overlapping or subsequently revived old speech.
- **SC-006**: After each ending state and a browser restart, zero webpage content,
  reading history, or resumable positions are retained by the extension.
- **SC-007**: Following the written local instructions from a clean checkout enables the
  user to build, load, and complete one article-reading session without undocumented steps.
- **SC-008**: An unactivated page shows no reading action, activation enables it only on
  that document, and every remote-only or unclassified-voice check starts zero new speech
  and presents the local-voice limitation clearly.

## Assumptions

- The MVP targets personal use in desktop Chrome, with a readable article already loaded
  in the main page. It requires no authentication, paid service, or cloud storage.
- English articles are the initial acceptance baseline; a voice-picker UI and guaranteed
  multilingual support are outside scope. A suitable local voice must be available under FR-014.
- The five manual sample pages cover a simple article, headings and lists, inline
  formatting and repeated phrases, surrounding navigation and ads, and a long article.
  They do not establish support for every website or dynamic content feed.
- Article identification is best effort across arbitrary sites; uncertain cases fail
  clearly. The article text is fixed for each session rather than continuously updated.
- Speed is session-only, starts at 1×, and is not remembered. Switching tabs can leave
  speech playing; the source-page panel is available when the user returns.
- The panel keeps the final Stopped, Finished, or Error status until another accepted
  session replaces it or the source page is left; no extra panel-management controls are required.
- Manual acceptance checks are the verification scope. The user's explicit exclusion of
  automated tests and test frameworks overrides the automated-testing requirement in
  constitution Principle VII and the associated review gate for this MVP.
- PDFs, embedded frames, editable fields, word highlighting, automatic scrolling, audio
  downloads, authentication, cloud storage, automated tests, and test frameworks are outside
  scope. Writing this specification does not authorize application implementation.
