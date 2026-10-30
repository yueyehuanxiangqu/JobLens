// Match presentation evidence against the stored PDF/DOCX/TXT extraction.
// Whitespace and Unicode forms may differ; returned quotations always come
// from the stored source, never from the model's rewritten text.
function canonicalCharacter(char) {
  const normalized = char.normalize('NFKC').toLowerCase();
  return normalized.replace(/[‐‑‒–—−]/gu, '-').replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"');
}

function compactWithPositions(value) {
  const chars = [];
  const starts = [];
  const ends = [];
  let offset = 0;
  for (const original of String(value || '')) {
    const end = offset + original.length;
    for (const char of canonicalCharacter(original)) {
      if (!/\s/u.test(char)) {
        chars.push(char);
        starts.push(offset);
        ends.push(end);
      }
    }
    offset = end;
  }
  return { text: chars.join(''), starts, ends };
}

function isWord(char) { return /[\p{L}\p{N}]/u.test(char || ''); }

function comparableText(value) {
  return String(value || '').normalize('NFKC').toLowerCase()
    .replace(/[‐‑‒–—−]/gu, '-')
    .replace(/[‘’]/gu, "'").replace(/[“”]/gu, '"')
    .replace(/(?<=[\p{L}\p{N}])\s*-\s*(?=[\p{L}\p{N}])/gu, '-')
    .replace(/\b([b-hj-z])\s+([a-z]{2,})\b/giu, '$1$2')
    .replace(/(\d{2,})\s+(\d)\b/gu, '$1$2')
    .replace(/\s+/gu, ' ').trim();
}

export function findCvEvidence(source, candidate, { allowShort = false } = {}) {
  const original = String(source || '');
  const requested = String(candidate || '').trim().replace(/^[•●▪*]\s*/u, '');
  const quote = requested.replace(/[.;,]\s*$/u, '');
  const needle = compactWithPositions(quote).text;
  if (!needle || (needle.length < 3 && !allowShort)) return null;
  const haystack = compactWithPositions(original);
  let position = haystack.text.indexOf(needle);
  while (position >= 0) {
    const start = haystack.starts[position];
    let end = haystack.ends[position + needle.length - 1];
    const span = original.slice(start, end);
    const before = original[start - 1];
    const after = original[end];
    // Short matches must be word bounded. Longer matches may cross PDF line
    // wraps but cannot include a disproportionate amount of unrelated text.
    if ((!isWord(quote[0]) || !isWord(before))
      && (!isWord(quote.at(-1)) || !isWord(after))
      && span.length <= Math.max(quote.length * 1.7, quote.length + 24)
      && (needle.length >= 3 || span.length === quote.length)
      && comparableText(span) === comparableText(quote)) {
      if (/[.;,]$/u.test(requested) && original[end] === requested.at(-1)) end += 1;
      return { quote: original.slice(start, end), start, end };
    }
    position = haystack.text.indexOf(needle, position + 1);
  }
  return null;
}

// A proficiency belongs to a language only when the two appear in the same
// CV entry. Keep this stricter than generic field matching, which can find an
// isolated level elsewhere in the resume.
export function findLanguageLevelEvidence(source, language, level) {
  const original = String(source || '');
  const name = String(language || '').trim();
  const proficiency = String(level || '').trim();
  if (!name || !proficiency || proficiency.toLowerCase() === 'unknown') return null;
  const literal = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[ \\t]+');
  const pattern = new RegExp(
    `(?<![\\p{L}\\p{N}])${literal(name)}(?![\\p{L}\\p{N}])`
      + `(?:[ \\t]*\\([ \\t]*|[ \\t]*[:|=\\-–—][ \\t]*|[ \\t]+)`
      + `${literal(proficiency)}(?![\\p{L}\\p{N}])`,
    'giu',
  );
  const match = pattern.exec(original);
  if (!match) return null;
  const start = match.index;
  let end = start + match[0].length;
  // Retain the complete parenthetical note when the model extracts a shorter
  // level (for example Beginner from "Dutch (Beginner, actively learning)").
  if (match[0].includes('(')) {
    const closing = original.slice(end).match(/^[^()\n]{0,100}\)/u);
    if (closing) end += closing[0].length;
  }
  return { quote: original.slice(start, end), start, end };
}

const ACTION_WORDS = new Set(['built', 'build', 'developed', 'develop', 'implemented', 'implement',
  'created', 'create', 'designed', 'design', 'using', 'used', 'with', 'for', 'the', 'and', 'a', 'an',
  'to', 'of', 'in', 'on', 'by', 'from', 'system', 'project']);

function anchors(value) {
  return (String(value || '').normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}+#.-]+/gu) || [])
    .map(word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(word => word.length >= 2 && !ACTION_WORDS.has(word));
}

function explicitlySupported(value, quote) {
  if (/\b(?:no|not|never|without|didn't|doesn't)\b/i.test(quote)
    && !/\b(?:no|not|never|without|didn't|doesn't)\b/i.test(value)) return false;
  const claimed = anchors(value);
  const sourced = new Set(anchors(quote));
  return claimed.length >= 2 && claimed.every(word => sourced.has(word));
}

function hasRelevantOverlap(value, quote) {
  const claimed = anchors(value);
  const sourced = new Set(anchors(quote));
  return claimed.filter(word => sourced.has(word)).length >= Math.min(2, claimed.length);
}

export function classifyCvField(value, source, fieldQuote = '', relatedQuotes = [], options = {}) {
  const text = String(value ?? '').trim();
  if (!text || text === 'Unknown') return { status: 'Unknown', sourceQuote: '' };
  const direct = findCvEvidence(source, text, { allowShort: options.allowShort === true });
  if (direct) return { status: 'Verified', sourceQuote: direct.quote };
  const cited = findCvEvidence(source, fieldQuote);
  if (cited) {
    if (/\b(?:no|not|never|without|didn't|doesn't)\b/i.test(cited.quote)
      && !/\b(?:no|not|never|without|didn't|doesn't)\b/i.test(text)) {
      return { status: 'Unverified', sourceQuote: '' };
    }
    const status = explicitlySupported(text, cited.quote) ? 'Source-supported'
      : hasRelevantOverlap(text, cited.quote) ? 'Inferred' : 'Unverified';
    return { status, sourceQuote: status === 'Unverified' ? '' : cited.quote };
  }
  // A project-level title/date quote is context, not evidence for a bullet.
  // Without this field's own citation, a rewritten bullet remains unverified.
  if (relatedQuotes.some(quote => findCvEvidence(source, quote))) return { status: 'Unverified', sourceQuote: '' };
  return { status: 'Unverified', sourceQuote: '' };
}
