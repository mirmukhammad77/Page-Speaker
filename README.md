# Page Speaker

A personal-use Chrome extension that reads an article aloud from the exact starting point
you select. Speech uses on-device voices only. No webpage content, reading history, or reading
position is saved.

## Build locally

Use Node.js 22.12+ and npm. From this repository:

```powershell
npm ci
npm run typecheck
npm run build
```

On Windows, if Node/npm points to a broken shim or PowerShell blocks npm.ps1, use the
installed Node tools directly:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
& "C:\Program Files\nodejs\npm.cmd" ci
& "C:\Program Files\nodejs\npm.cmd" run typecheck
& "C:\Program Files\nodejs\npm.cmd" run build
```

On Windows, if Node/npm points to a broken shim or PowerShell blocks npm.ps1, use the
installed Node tools directly:

```powershell
$env:Path = "C:\Program Files\nodejs;$env:Path"
& "C:\Program Files\nodejs\npm.cmd" ci
& "C:\Program Files\nodejs\npm.cmd" run typecheck
& "C:\Program Files\nodejs\npm.cmd" run build
```

The production extension is generated in `dist/`:

- `manifest.json`: Chrome Manifest V3 configuration.
- `content.js`: selection, article extraction, and isolated React controls.
- `background.js`: local speech playback and source/session lifecycle.

The build packages React and the compiled Tailwind/shadcn styles locally. It needs no backend,
database, paid API, development server, or runtime CDN. Type checking covers content/UI,
background, and build configuration separately.

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project's **dist** folder.

For this workspace, that folder is:

```text
C:\projects\page-speaker\Page-Speaker\dist
```

After making changes, rebuild, click **Reload** on the extension card, refresh the article
page, and enable Page Speaker there again.

## Read an article

1. Open a normal text article and click the Page Speaker **toolbar button** to enable that
   document. Pin the extension from Chrome's Extensions menu if needed.
2. Select a word or phrase inside the article.
3. Click **Read from here** near the selection.
4. Use the floating **Pause**, **Resume**, **Stop**, and **Reading speed** controls.

Reading starts at the first selected character in document order and continues through the
article ending. Selecting a phrase is a starting marker, not a limit on the amount read.
The panel remains available while you scroll. You can also select text and operate the controls
by keyboard; Tab reaches the extension buttons.

Speed ranges from 0.5× to 2× in 0.25× steps and resets to 1× for a new session. A change applies
by the next sentence. Changing speed while paused does not resume or restart the current sentence.

Starting another valid reading session stops the previous one, including in another tab.
Changing the selection alone does not stop speech. Reloading, leaving, or closing the source
page stops playback. A same-document article route change stops the old session; fragment-only
jumps and ordinary tab switching do not.

A new or reloaded document needs toolbar activation again. Protected pages and PDFs display a
limitation through the extension toolbar title/badge because controls cannot be injected there.

## Local voices and errors

Install or enable an on-device voice for the article's language in your operating system.
English articles are the initial compatibility baseline; there is no voice-picker UI.

Page Speaker requires Chrome to explicitly identify a voice as local and to advertise the
start/end events needed for playback. Remote voices and voices with unknown locality are
excluded. If no suitable local voice is available, a clear message appears and no new speech
starts. It does not fall back to a remote voice.

If an article or starting point cannot be identified confidently, choose text within the
article body or try a simpler article page. If speech fails, enable a compatible local voice
and select a starting point again. If the extension or its worker is interrupted, refresh
and re-enable the page as needed; previous reading text is never restored.

## Supported scope

Supports ordinary, top-level, visible text article pages. Extraction is conservative and may
refuse ambiguous layouts rather than reading unrelated content. Below-the-fold article text
is included; identifiable navigation, ads, sidebars, hidden content, and external comments are
excluded.

PDFs, embedded frames, editable fields, complex article feeds, guaranteed multilingual support,
word highlighting, automatic scrolling, audio downloads, accounts, and cloud storage are outside
this MVP.

## Browser permissions

| Permission | Why it is needed |
| --- | --- |
| `activeTab` | Temporary access to the page after you click the toolbar button |
| `scripting` | Inject the packaged selection/control script into that page's main frame |
| `tts` | Discover suitable local voices and control speech |
| `webNavigation` | Stop speech on document reload/navigation and same-document article route changes |

There are no persistent host permissions, automatic content-script matches, storage permissions,
analytics, or content logs. Text and playback position exist only in memory for the current
request/session. Terminal controls retain only a content-free status display.

## Verification

`npm run typecheck` and `npm run build` are the code/build gates. Manual Chrome scenarios and
the actual verification status are in [the quickstart](specs/001-read-article-aloud/quickstart.md).
No automated tests or test framework is included. Browser behavior, installed voices, audible
output, keyboard accessibility, and long-session operation still require the manual checks.
