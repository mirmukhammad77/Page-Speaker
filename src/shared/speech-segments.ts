export interface SpeechSegment { index: number; start: number; end: number; text: string }
const LIMIT = 500;
function safeEnd(text: string, start: number, limit: number) {
  let end = Math.min(start + limit, text.length);
  const last = text.charCodeAt(end - 1);
  if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
  return end;
}
export function segmentSpeech(text: string, lang: string): SpeechSegment[] {
  let segmenter: Intl.Segmenter;
  try { segmenter = new Intl.Segmenter(lang || "en", { granularity: "sentence" }); }
  catch { segmenter = new Intl.Segmenter("en", { granularity: "sentence" }); }
  const spans: { start: number; end: number }[] = [];
  for (const sentence of segmenter.segment(text)) {
    let start = sentence.index;
    const sentenceEnd = sentence.index + sentence.segment.length;
    while (start < sentenceEnd) {
      let end = Math.min(safeEnd(text, start, LIMIT), sentenceEnd);
      if (end < sentenceEnd) {
        const piece = text.slice(start, end);
        const boundary = Math.max(piece.lastIndexOf(" "), piece.lastIndexOf("\n"));
        if (boundary > 0) end = start + boundary + 1;
      }
      if (text.slice(start, end).trim()) spans.push({ start, end });
      else if (spans.length) { const last = spans[spans.length - 1]; if (last) last.end = end; }
      start = end;
    }
  }
  // Account for any leading separator without changing offsets or dropping source text.
  const first = spans[0]; if (first) first.start = 0;
  return spans.map((span, index) => ({ index, ...span, text: text.slice(span.start, span.end) }));
}
