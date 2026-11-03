import { PORT_NAME, isClientRequest, isRecord, isRecoveryRequest } from "../shared/messages";
import { PlaybackController } from "./playback";
import { observeSourceLifecycle, pageUrl, send, sourceFromPort, type SourceBinding } from "./source-lifecycle";

const workerId = crypto.randomUUID();
const controller = new PlaybackController(workerId);
const sources = new Set<SourceBinding>();
// Callback closures cannot survive a worker restart. Never replay orphaned speech.
chrome.tts.stop();

function invalidate(source: SourceBinding, reason: string, newUrl?: string) {
  controller.invalidate(source, reason);
  source.sourceEpoch++;
  if (newUrl) source.articleUrl = pageUrl(newUrl);
  send(source, { v: 1, kind: "SOURCE_RESET", workerId, sourceEpoch: source.sourceEpoch, reason });
  if (reason !== "article-changed" && reason !== "article-replaced") {
    void chrome.action.setBadgeText({ tabId: source.tabId, text: "" }).catch(() => {});
  }
}
observeSourceLifecycle(sources, invalidate);

chrome.runtime.onConnect.addListener(port => {
  const source = port.name === PORT_NAME ? sourceFromPort(port) : null;
  if (!source) { port.disconnect(); return; }
  // Replacing a connection must not leave an unowned session behind.
  for (const previous of sources) if (previous.tabId === source.tabId && previous.documentId === source.documentId) {
    invalidate(previous, "connection-replaced");
    previous.connected = false;
    previous.port.disconnect();
    sources.delete(previous);
  }
  sources.add(source);
  send(source, { v: 1, kind: "WELCOME", workerId, sourceEpoch: source.sourceEpoch, state: "Idle" });
  port.onMessage.addListener((value: unknown) => {
    if (!isClientRequest(value)) {
      const requestId = isRecord(value) && typeof value.requestId === "string" && value.requestId.length <= 128
        ? value.requestId : "invalid";
      controller.reject(source, requestId, "INVALID_MESSAGE"); return;
    }
    if (!source.connected || value.workerId !== workerId || value.sourceEpoch !== source.sourceEpoch) {
      controller.reject(source, value.requestId, "STALE_SOURCE"); return;
    }
    switch (value.kind) {
      case "START": controller.start(source, value); break;
      case "INVALIDATE_SOURCE":
        invalidate(source, value.reason);
        send(source, { v: 1, kind: "ACK", workerId, requestId: value.requestId, sourceEpoch: source.sourceEpoch });
        break;
      default: controller.handle(source, value);
    }
  });
  port.onDisconnect.addListener(() => {
    source.connected = false;
    controller.invalidate(source, "source-disconnected");
    source.terminal = undefined;
    sources.delete(source);
  });
});

chrome.runtime.onMessage.addListener((value: unknown, sender, respond) => {
  if (!isRecoveryRequest(value) || sender.id !== chrome.runtime.id || sender.frameId !== 0
    || typeof sender.tab?.id !== "number" || !sender.documentId) return false;
  controller.recover(sender.tab.id, sender.documentId, value.previousWorkerId, value.previousSessionId);
  respond({ v: 1, kind: "RECOVERED", workerId, requestId: value.requestId });
  return false;
});

chrome.action.onClicked.addListener(tab => {
  void (async () => {
    const tabId = tab.id;
    if (tabId === undefined) return;
    try {
      if (!tab.url || !/^https?:\/\//i.test(tab.url) || /\.pdf$/i.test(new URL(tab.url).pathname)) throw new Error("unsupported");
      await chrome.scripting.executeScript({ target: { tabId, frameIds: [0] }, files: ["content.js"] });
      await chrome.action.setBadgeText({ tabId, text: "ON" });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#315be8" });
      await chrome.action.setTitle({ tabId, title: "Page Speaker enabled. Select article text, then choose Read from here." });
    } catch {
      await chrome.action.setBadgeText({ tabId, text: "!" }).catch(() => {});
      await chrome.action.setBadgeBackgroundColor({ tabId, color: "#b02d39" }).catch(() => {});
      await chrome.action.setTitle({ tabId, title: "Page Speaker cannot read this page. Open a normal web article; PDFs and protected browser pages are unsupported." }).catch(() => {});
    }
  })();
});
