<!--
Sync Impact Report (temporary review note; remove before committing)
Version change: unversioned scaffold -> 1.0.0 (initial adoption)
Modified principles: replaced placeholder principles with:
- I. Small MVP
- II. Strict TypeScript
- III. Accessible Controls
- IV. Minimum Browser Permissions
- V. No Content or History Storage
- VI. Separate Responsibilities
- VII. Test Important Behavior
- VIII. Reproducible Local Builds
Added sections: Product Scope; Development and Review (filled template slots)
Removed sections: none
Follow-up TODOs: none
-->
# Page Speaker Constitution

## Core Principles

### I. Small MVP

Changes MUST support reading an article aloud from a user-selected starting point.
Dependencies MUST solve a current need that browser APIs or simple project code cannot
reasonably meet. Speculative features and abstractions MUST be deferred to keep the MVP small.

### II. Strict TypeScript

Application code MUST use TypeScript with `strict: true`. Changes MUST pass type checking;
type suppressions or `any` MUST NOT be used to bypass unresolved type errors.

### III. Accessible Controls

Every control MUST have a clear accessible name and support keyboard operation.
Interactive UI MUST provide visible focus and expose playback state and errors accessibly.

### IV. Minimum Browser Permissions

The extension MUST request only browser and host permissions required by implemented behavior.
Every added permission MUST have a documented purpose; unused permissions MUST be removed.

### V. No Content or History Storage

Webpage content MUST exist only in transient memory needed for the current reading session
and MUST be released when that session ends. The extension MUST NOT persist webpage content
or record reading history, including in logs, analytics, or browser storage.

### VI. Separate Responsibilities

Webpage interaction and text extraction, speech playback, and UI logic MUST live in separate
modules with explicit interfaces. This separation MUST allow extraction and playback behavior
to be tested independently of the UI.

### VII. Test Important Behavior

Automated tests MUST cover extraction from the selected starting point, empty or unusable
text, and playback start, stop, completion, and failure behavior. Changes affecting these
behaviors MUST add or update relevant tests, including regression tests for fixed defects.

### VIII. Reproducible Local Builds

Project documentation MUST include prerequisites, dependency installation, type checking,
test and build commands, the output location, and steps to load the unpacked extension in Chrome.
These instructions MUST be kept current when the workflow changes.

## Product Scope

Page Speaker is a small Chrome extension for reading article text aloud from a point chosen
by the user. New work MUST preserve this focused workflow and comply with the accessibility,
permission, and privacy principles above.

## Development and Review

Each change MUST be checked against this constitution. Before merge, applicable type checks,
behavior tests, and the local build MUST pass. UI changes MUST receive a keyboard and labeling
check; permission and data-handling changes MUST be reviewed against Principles IV and V.

## Governance

This constitution governs project specifications, plans, and implementation. Amendments MUST
document the rationale and affected principles, receive maintainer approval, and update the
version and amendment date. Use a MAJOR increment for incompatible principle changes or
removals, MINOR for new principles or materially expanded guidance, and PATCH for clarifications.
Reviews MUST identify and resolve conflicts with this constitution before merge.

**Version**: 1.0.0 | **Ratified**: 2026-11-02 | **Last Amended**: 2026-11-02
