import type { ServerMessage, Snapshot } from "../shared/messages";

export interface SourceBinding {
  tabId: number;
  frameId: 0;
  documentId: string;
  sourceEpoch: number;
  articleUrl: string;
  port: chrome.runtime.Port;
  connected: boolean;
  terminal?: Snapshot;
}
export function pageUrl(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.href;
}
export function sourceFromPort(port: chrome.runtime.Port): SourceBinding | null {
  const sender = port.sender;
  if (sender?.id !== chrome.runtime.id || sender.frameId !== 0
    || typeof sender.tab?.id !== "number" || !sender.documentId || !sender.url
    || !/^https?:\/\//i.test(sender.url)) return null;
  return { tabId: sender.tab.id, frameId: 0, documentId: sender.documentId,
    sourceEpoch: 0, articleUrl: pageUrl(sender.url), port, connected: true };
}
export function send(source: SourceBinding, message: ServerMessage) {
  if (!source.connected) return;
  try { source.port.postMessage(message); } catch { source.connected = false; }
}
export async function sourceIsCurrent(source: SourceBinding, epoch: number) {
  if (!source.connected || source.sourceEpoch !== epoch) return false;
  try {
    const frame = await chrome.webNavigation.getFrame({ tabId: source.tabId, documentId: source.documentId });
    return source.connected && source.sourceEpoch === epoch && frame !== undefined && frame !== null
      && frame.documentId === source.documentId && frame.frameType === "outermost_frame"
      && frame.documentLifecycle === "active" && pageUrl(frame.url) === source.articleUrl;
  } catch { return false; }
}
export function observeSourceLifecycle(
  sources: Set<SourceBinding>,
  invalidate: (source: SourceBinding, reason: string, newUrl?: string) => void,
) {
  chrome.webNavigation.onBeforeNavigate.addListener(details => {
    if (details.frameId !== 0) return;
    for (const source of sources) if (source.tabId === details.tabId) invalidate(source, "navigation");
  });
  chrome.webNavigation.onCommitted.addListener(details => {
    if (details.frameId !== 0) return;
    for (const source of sources) if (source.tabId === details.tabId && source.documentId !== details.documentId) {
      invalidate(source, "document-replaced");
    }
  });
  chrome.webNavigation.onHistoryStateUpdated.addListener(details => {
    if (details.frameId !== 0) return;
    for (const source of sources) if (source.tabId === details.tabId
      && source.documentId === details.documentId && pageUrl(details.url) !== source.articleUrl) {
      invalidate(source, "article-changed", details.url);
    }
  });
  chrome.tabs.onRemoved.addListener(tabId => {
    for (const source of sources) if (source.tabId === tabId) invalidate(source, "tab-closed");
  });
  chrome.tabs.onReplaced.addListener((_added, removed) => {
    for (const source of sources) if (source.tabId === removed) invalidate(source, "tab-replaced");
  });
}
