// Locate a quotation in one declared JD source and return that source's exact text.
// Only canonical Unicode composition and whitespace runs are treated as equivalent.
const SPACE = /\s/u;
const MARK = /\p{Mark}/u;
const PARAGRAPH_BREAK = /(?:\n[^\S\n]*\n|\u2029)/u;
const crossesParagraph = value => PARAGRAPH_BREAK.test(value.replace(/\r\n?|\u2028/gu, '\n'));

function folded(value, positions = false) {
  let text = '';
  const starts = [];
  const ends = [];
  let previousSpace = false;
  for (let offset = 0; offset < value.length;) {
    const start = offset;
    let point = String.fromCodePoint(value.codePointAt(offset));
    offset += point.length;
    if (SPACE.test(point)) {
      while (offset < value.length) {
        const next = String.fromCodePoint(value.codePointAt(offset));
        if (!SPACE.test(next)) break;
        offset += next.length;
      }
      if (!previousSpace) {
        text += ' ';
        starts.push(start);
        ends.push(offset);
      } else if (positions) ends[ends.length - 1] = offset;
      previousSpace = true;
      continue;
    }
    while (offset < value.length) {
      const next = String.fromCodePoint(value.codePointAt(offset));
      if (!MARK.test(next)) break;
      point += next;
      offset += next.length;
    }
    const normalized = point.normalize('NFC');
    text += normalized;
    for (let index = 0; index < normalized.length; index += 1) {
      starts.push(start);
      ends.push(offset);
    }
    previousSpace = false;
  }
  return { text, starts, ends };
}

export function locateJdEvidence(source, quote) {
  if (typeof source !== 'string' || !source) return { ok: false, reason: 'SOURCE_UNAVAILABLE' };
  if (typeof quote !== 'string' || !quote.trim() || quote.length > 500) {
    return { ok: false, reason: 'QUOTE_INVALID' };
  }
  if (crossesParagraph(quote)) return { ok: false, reason: 'QUOTE_CROSSES_PARAGRAPH' };
  const needle = folded(quote).text;
  const haystack = folded(source, true);
  let at = haystack.text.indexOf(needle);
  while (at >= 0) {
    const start = haystack.starts[at];
    const end = haystack.ends[at + needle.length - 1];
    const original = source.slice(start, end);
    if (!crossesParagraph(original)) {
      return { ok: true, quote: original, start, end };
    }
    at = haystack.text.indexOf(needle, at + 1);
  }
  return { ok: false, reason: haystack.text.includes(needle) ? 'QUOTE_CROSSES_PARAGRAPH' : 'QUOTE_NOT_FOUND' };
}
