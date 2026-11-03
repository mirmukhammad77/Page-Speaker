import { PORT_NAME, isActive, isServerMessage, readerError, type RequestInput, type ServerMessage, type Snapshot } from "../shared/messages";
import { ReaderControls, type ReaderView, type ReaderActions } from "../ui/ReaderControls";
import { captureSelection, bookmarkRange, selectionPosition, type SelectionBookmark } from "./selection";
import { extractArticle, ExtractionError } from "./article";
import { mountReader } from "./shadow-root";

class Connection {
  private port: chrome.runtime.Port | null = null;
  workerId = "";
  sourceEpoch = 0;
  private activeSessionId: string | undefined;
  private requests = new Set<string>();
  private disposed = false;
  constructor(private receive: (message: ServerMessage) => void, private interrupted: () => void) {}
  get ready() { return Boolean(this.port && this.workerId); }
  connect() {
    if (this.port || this.disposed) return;
    try {
      const port = chrome.runtime.connect({ name: PORT_NAME });
      this.port = port;
      port.onMessage.addListener((value: unknown) => {
        if (this.port !== port || !isServerMessage(value)) return;
        if (value.kind === "WELCOME") {
          this.workerId = value.workerId;
          this.sourceEpoch = value.sourceEpoch;
        } else if (value.workerId !== this.workerId) return;
        if (value.kind === "SOURCE_RESET") {
          this.sourceEpoch = value.sourceEpoch;
          this.requests.clear();
          this.activeSessionId = undefined;
        }
        if ("sourceEpoch" in value && value.sourceEpoch !== this.sourceEpoch) return;
        if ("requestId" in value) {
          if (!this.requests.delete(value.requestId)) return;
        }
        if (value.kind === "STATE" && value.sessionId !== this.activeSessionId) return;
        if ((value.kind === "START_ACCEPTED" || value.kind === "STATE") && value.sourceEpoch === this.sourceEpoch) {
          this.activeSessionId = isActive(value.state) ? value.sessionId : undefined;
        }
        this.receive(value);
      });
      port.onDisconnect.addListener(() => {
        if (this.port !== port) return;
        // Consume runtime.lastError; never print error strings or webpage payloads.
        void chrome.runtime.lastError;
        const previousWorkerId = this.workerId;
        const previousSessionId = this.activeSessionId;
        this.port = null;
        this.workerId = "";
        this.activeSessionId = undefined;
        this.requests.clear();
        if (this.disposed || !previousSessionId) return;
        this.interrupted();
        try {
          void chrome.runtime.sendMessage({ v: 1, kind: "RECOVER_CONNECTION", requestId: crypto.randomUUID(),
            previousWorkerId, previousSessionId }).then(() => this.connect()).catch(() => {});
        } catch { /* An extension reload invalidates this old content context. */ }
      });
    } catch { this.interrupted(); }
  }
  send(input: RequestInput) {
    if (!this.port || !this.workerId) { this.connect(); return null; }
    const requestId = crypto.randomUUID();
    this.requests.add(requestId);
    try {
      this.port.postMessage({ ...input, v: 1, requestId, workerId: this.workerId, sourceEpoch: this.sourceEpoch });
      return requestId;
    } catch { this.requests.delete(requestId); this.interrupted(); return null; }
  }
  dispose() {
    this.disposed = true;
    this.requests.clear();
    this.port?.disconnect();
    this.port = null;
  }
}

declare global {
  interface Window { __pageSpeaker?: { activate(): boolean; dispose(): void } }
}

function bootstrap() {
  const existing = window.__pageSpeaker;
  if (existing?.activate()) return;
  existing?.dispose();
  const mount = mountReader();
  let bookmark: SelectionBookmark | null = null;
  let pendingStartId: string | null = null;
  let activeRoot: Element | null = null;
  let pendingRoot: Element | null = null;
  let disposed = false;
  let scheduled = 0;
  const view: ReaderView = { selection: null, snapshot: null, error: null, ready: false, pending: false };
  const rootObserver = new MutationObserver(() => {
    if ((activeRoot && !activeRoot.isConnected) || (pendingRoot && !pendingRoot.isConnected)) {
      connection.send({ kind: "INVALIDATE_SOURCE", reason: "article-replaced" });
      clearReadingSource();
      view.error = "The article changed. Select a starting point in the current article.";
      render();
    }
  });
  function clearBookmark() { bookmark = null; view.selection = null; }
  function clearReadingSource() {
    clearBookmark();
    pendingRoot = null;
    activeRoot = null;
    pendingStartId = null;
    view.pending = false;
    rootObserver.disconnect();
  }
  function watchRoots() {
    rootObserver.disconnect();
    if (pendingRoot || activeRoot) rootObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
  function applySnapshot(snapshot: Snapshot) {
    if (view.snapshot && snapshot.sessionId !== view.snapshot.sessionId) return;
    if (view.snapshot && snapshot.revision < view.snapshot.revision) return;
    view.snapshot = snapshot;
    if (!isActive(snapshot.state)) {
      activeRoot = null;
      if (!view.pending) { clearBookmark(); rootObserver.disconnect(); }
    }
  }
  const connection = new Connection(message => {
    switch (message.kind) {
      case "WELCOME": view.ready = true; break;
      case "SOURCE_RESET":
        clearReadingSource();
        if (view.snapshot && isActive(view.snapshot.state)) view.snapshot = { ...view.snapshot, state: "Stopped", reason: message.reason };
        break;
      case "START_ACCEPTED":
        if (message.requestId !== pendingStartId) return;
        view.snapshot = { sessionId: message.sessionId, revision: message.revision, state: message.state, rate: message.rate };
        activeRoot = pendingRoot;
        pendingRoot = null;
        pendingStartId = null;
        view.pending = false;
        view.error = null;
        clearBookmark();
        watchRoots();
        break;
      case "STATE": applySnapshot(message); break;
      case "ACK": if (message.snapshot) applySnapshot(message.snapshot); break;
      case "REJECTED":
        if (message.requestId === pendingStartId) {
          pendingStartId = null;
          pendingRoot = null;
          view.pending = false;
          clearBookmark();
          watchRoots();
        }
        if (message.code !== "REQUEST_SUPERSEDED") view.error = message.message;
        break;
    }
    render();
  }, () => {
    clearReadingSource();
    view.ready = false;
    const error = readerError("SESSION_INTERRUPTED");
    if (view.snapshot && isActive(view.snapshot.state)) {
      view.snapshot = { ...view.snapshot, state: "Error", error };
    }
    view.error = error.message;
    render();
  });
  const actions: ReaderActions = {
    start() {
      if (!bookmark || view.pending) return;
      if (!connection.ready) { connection.connect(); view.error = "Connecting to Page Speaker. Try Read from here again."; render(); return; }
      try {
        const range = bookmarkRange(bookmark);
        if (!range || bookmark.sourceEpoch !== connection.sourceEpoch) throw new ExtractionError("SELECTION_CHANGED", "The selection changed. Select your starting point again.");
        const article = extractArticle(range, bookmark.text, bookmark.sourceEpoch);
        pendingRoot = article.root;
        view.error = null;
        view.pending = true;
        watchRoots();
        pendingStartId = connection.send({ kind: "START", text: article.text, lang: article.lang });
        if (!pendingStartId) { view.pending = false; pendingRoot = null; view.error = "Connecting to Page Speaker. Try again."; }
      } catch (error: unknown) {
        view.error = error instanceof ExtractionError ? error.message : "Could not read this selection. Select text in the main article and try again.";
        clearBookmark();
      }
      render();
    },
    control(kind) {
      const snapshot = view.snapshot;
      if (!snapshot) return;
      view.error = null;
      connection.send({ kind, sessionId: snapshot.sessionId });
    },
    rate(rate) {
      if (!view.snapshot) return;
      connection.send({ kind: "SET_RATE", sessionId: view.snapshot.sessionId, rate });
    },
  };
  function render() {
    if (disposed) return;
    view.ready = connection.ready;
    mount.root.render(<ReaderControls view={{ ...view, error: view.error ?? view.snapshot?.error?.message ?? null }} actions={actions} />);
  }
  function capture() {
    if (disposed || mount.shadow.activeElement) return;
    bookmark = captureSelection(mount.host, connection.sourceEpoch);
    view.selection = bookmark ? selectionPosition(bookmark) : null;
    if (bookmark) connection.connect();
    render();
  }
  function onSelection(event: Event) {
    if (event.composedPath().includes(mount.host)) return;
    if (scheduled) cancelAnimationFrame(scheduled);
    scheduled = requestAnimationFrame(() => { scheduled = 0; capture(); });
  }
  function onViewport() {
    if (bookmark) { view.selection = selectionPosition(bookmark); render(); }
  }
  function onPageHide() {
    connection.send({ kind: "INVALIDATE_SOURCE", reason: "pagehide" });
    clearReadingSource();
  }
  document.addEventListener("selectionchange", onSelection);
  document.addEventListener("pointerup", onSelection);
  document.addEventListener("keyup", onSelection);
  window.addEventListener("scroll", onViewport, true);
  window.addEventListener("resize", onViewport);
  window.visualViewport?.addEventListener("resize", onViewport);
  window.addEventListener("pagehide", onPageHide);
  connection.connect();
  render();
  window.__pageSpeaker = {
    activate() {
      try { if (!chrome.runtime.id || !mount.host.isConnected) return false; connection.connect(); return true; }
      catch { return false; }
    },
    dispose() {
      disposed = true;
      clearReadingSource();
      if (scheduled) cancelAnimationFrame(scheduled);
      document.removeEventListener("selectionchange", onSelection);
      document.removeEventListener("pointerup", onSelection);
      document.removeEventListener("keyup", onSelection);
      window.removeEventListener("scroll", onViewport, true);
      window.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.removeEventListener("pagehide", onPageHide);
      connection.dispose();
      mount.dispose();
      delete window.__pageSpeaker;
    },
  };
}
bootstrap();
