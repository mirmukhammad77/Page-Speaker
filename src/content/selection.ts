export interface SelectionBookmark {
  startNode: Node; startOffset: number; endNode: Node; endOffset: number;
  startValue: string | null; endValue: string | null;
  startNeighbor: Node | null; endNeighbor: Node | null;
  text: string; sourceEpoch: number;
}
function elementAt(node: Node) { return node instanceof Element ? node : node.parentElement; }
export function isEditable(node: Node) {
  const element = elementAt(node);
  return element instanceof HTMLElement && (element.isContentEditable
    || Boolean(element.closest('input,textarea,select,[role="textbox"]')));
}
function neighbor(node: Node, offset: number) { return node.childNodes.item(offset); }
export function captureSelection(host: HTMLElement, sourceEpoch: number): SelectionBookmark | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (range.startContainer.getRootNode() !== document || range.endContainer.getRootNode() !== document
    || host.contains(range.commonAncestorContainer) || isEditable(range.startContainer) || isEditable(range.endContainer)) return null;
  const text = range.toString();
  if (!text.trim()) return null;
  return { startNode: range.startContainer, startOffset: range.startOffset,
    endNode: range.endContainer, endOffset: range.endOffset,
    startValue: range.startContainer.nodeValue, endValue: range.endContainer.nodeValue,
    startNeighbor: neighbor(range.startContainer, range.startOffset),
    endNeighbor: neighbor(range.endContainer, range.endOffset), text, sourceEpoch };
}
export function bookmarkRange(bookmark: SelectionBookmark): Range | null {
  if (!bookmark.startNode.isConnected || !bookmark.endNode.isConnected
    || bookmark.startNode.nodeValue !== bookmark.startValue || bookmark.endNode.nodeValue !== bookmark.endValue
    || neighbor(bookmark.startNode, bookmark.startOffset) !== bookmark.startNeighbor
    || neighbor(bookmark.endNode, bookmark.endOffset) !== bookmark.endNeighbor) return null;
  try {
    const range = document.createRange();
    range.setStart(bookmark.startNode, bookmark.startOffset);
    range.setEnd(bookmark.endNode, bookmark.endOffset);
    return range.toString() === bookmark.text ? range : null;
  } catch { return null; }
}
export function selectionPosition(bookmark: SelectionBookmark) {
  const range = bookmarkRange(bookmark);
  const rect = range?.getClientRects()[0] ?? range?.getBoundingClientRect();
  if (!rect || (!rect.width && !rect.height)) return null;
  const width = window.visualViewport?.width ?? window.innerWidth;
  const height = window.visualViewport?.height ?? window.innerHeight;
  return { left: Math.max(8, Math.min(rect.left, width - 158)),
    top: Math.max(8, Math.min(rect.bottom + 8, height - 48)) };
}
