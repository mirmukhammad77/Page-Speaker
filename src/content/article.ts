export type ExtractionCode = "ARTICLE_NOT_FOUND" | "START_NOT_FOUND" | "SELECTION_CHANGED" | "UNSUPPORTED_SELECTION";
export class ExtractionError extends Error {
  constructor(public readonly code: ExtractionCode, message: string) { super(message); }
}
export interface ArticleSnapshot { root: Element; text: string; lang: string; sourceEpoch: number }
const excludedSelector = 'nav,aside,footer,script,style,noscript,template,iframe,object,embed,svg,canvas,input,textarea,select,button,[role="navigation"],[role="banner"],[role="complementary"],[hidden],[inert],[aria-hidden="true"],[data-page-speaker]';
const unrelatedName = /(?:^|[-_\s])(ads?|advert(?:isement|ising)?|sidebar|related|comments?|social|share|newsletter|cookie|menu|breadcrumb)(?=$|[-_\s])/i;
function excluded(element: Element) {
  if (element.matches(excludedSelector) || (element instanceof HTMLElement && element.isContentEditable)) return true;
  if (element.tagName === "HEADER" && !element.closest("article,[role=article]")) return true;
  if (unrelatedName.test(element.getAttribute("class") ?? "") || unrelatedName.test(element.id)
    || element.hasAttribute("data-ad") || element.hasAttribute("data-ad-slot")) return true;
  const style = getComputedStyle(element);
  return style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse"
    || style.contentVisibility === "hidden" || style.opacity === "0";
}
function eligibleRoot(root: Element) {
  for (let el: Element | null = root; el; el = el.parentElement) if (excluded(el)) return false;
  return true;
}
function collect(root: Element) {
  const tokens: (Text | Element)[] = [];
  const rejected: Element[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node instanceof Element) {
        if (excluded(node)) { rejected.push(node); return NodeFilter.FILTER_REJECT; }
        return node.tagName === "BR" ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
      return node instanceof Text ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
    },
  });
  let node: Node | null;
  while ((node = walker.nextNode())) if (node instanceof Text || node instanceof Element) tokens.push(node);
  return { tokens, rejected };
}
function articleRoot(): Element {
  const candidates = new Set<Element>(document.querySelectorAll("article,[role=article],main,[role=main]"));
  for (const paragraph of document.querySelectorAll("p")) {
    let parent = paragraph.parentElement;
    for (let depth = 0; parent && depth < 3 && !parent.matches("html,body"); depth++, parent = parent.parentElement) {
      candidates.add(parent);
    }
  }
  const scored: { root: Element; score: number }[] = [];
  for (const root of candidates) {
    if (root.matches("html,body") || !eligibleRoot(root)) continue;
    // A feed containing several articles is not itself an article.
    if (!root.matches("article,[role=article]") && root.querySelectorAll("article,[role=article]").length > 1) continue;
    const { tokens } = collect(root);
    let textLength = 0, linkLength = 0;
    const paragraphs = new Set<Element>();
    for (const token of tokens) if (token instanceof Text) {
      const length = token.data.trim().length;
      textLength += length;
      if (token.parentElement?.closest("a")) linkLength += length;
      const paragraph = token.parentElement?.closest("p");
      if (paragraph && length) paragraphs.add(paragraph);
    }
    const semantic = root.matches("article,[role=article]");
    if (textLength < (semantic ? 80 : 160) || paragraphs.size < (semantic ? 1 : 2)
      || linkLength > textLength * 0.45) continue;
    scored.push({ root, score: (textLength - linkLength) * (semantic ? 1.4 : 1) });
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || scored.some(other => other !== best && other.score >= best.score * 0.8
    && !best.root.contains(other.root) && !other.root.contains(best.root))) {
    throw new ExtractionError("ARTICLE_NOT_FOUND", "Could not identify one main article. Try a simple article page and select text within its body.");
  }
  return best.root;
}
function blockFor(node: Text, root: Element) {
  return node.parentElement?.closest("p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,figcaption,td,th") ?? root;
}
export function extractArticle(range: Range, expectedText: string, sourceEpoch: number): ArticleSnapshot {
  if (!range.startContainer.isConnected || !range.endContainer.isConnected || range.toString() !== expectedText) {
    throw new ExtractionError("SELECTION_CHANGED", "The selection changed. Select your starting point again.");
  }
  const root = articleRoot();
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) {
    throw new ExtractionError("START_NOT_FOUND", "Select a starting point entirely within the main article, away from navigation or sidebars.");
  }
  const { tokens, rejected } = collect(root);
  if (rejected.some(element => element.textContent?.trim() && range.intersectsNode(element))) {
    throw new ExtractionError("UNSUPPORTED_SELECTION", "The selection crosses content outside the article reading flow. Select a shorter starting phrase.");
  }
  let started = false, output = "", previousBlock: Element | null = null;
  for (const token of tokens) {
    const tokenRange = document.createRange();
    if (token instanceof Text) tokenRange.selectNodeContents(token); else tokenRange.selectNode(token);
    if (!started) {
      if (tokenRange.comparePoint(range.startContainer, range.startOffset) === 1) continue;
      started = true;
    }
    if (token instanceof Element) { output = output.trimEnd() + "\n"; continue; }
    const raw = token === range.startContainer ? token.data.slice(range.startOffset) : token.data;
    if (!raw) continue;
    const block = blockFor(token, root);
    if (raw.trim() && previousBlock && block !== previousBlock) output = output.trimEnd() + "\n\n";
    let piece = raw.replace(/\s+/gu, " ");
    if (/\s$/u.test(output) && piece.startsWith(" ")) piece = piece.slice(1);
    output += piece;
    if (raw.trim()) previousBlock = block;
  }
  output = output.trim();
  if (!output) throw new ExtractionError("START_NOT_FOUND", "No readable article text remains here. Choose another starting point.");
  const lang = root.closest("[lang]")?.getAttribute("lang")?.trim() || document.documentElement.lang || "en";
  return { root, text: output, lang, sourceEpoch };
}
