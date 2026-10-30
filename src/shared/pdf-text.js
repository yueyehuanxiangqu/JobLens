function itemFromPdf(raw, page) {
  const text = typeof raw?.str === 'string' ? raw.str : '';
  return {
    page, text, x: Number(raw?.transform?.[4]) || 0, y: Number(raw?.transform?.[5]) || 0,
    width: Math.max(0, Number(raw?.width) || 0), height: Math.max(1, Number(raw?.height) || 10),
    hasEOL: raw?.hasEOL === true,
  };
}

function groupLines(items, column) {
  const rows = [];
  for (const item of items.sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = rows.find(candidate => Math.abs(candidate.y - item.y) <= Math.max(2, item.height * 0.25));
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows.sort((a, b) => b.y - a.y).map(row => {
    const ordered = row.items.sort((a, b) => a.x - b.x);
    let text = '';
    let previous = null;
    for (const item of ordered) {
      const piece = item.text.trim();
      if (!piece) continue;
      const gap = previous ? item.x - previous.x - previous.width : 0;
      const touching = gap <= Math.max(1.2, item.height * 0.1);
      const splitLetter = previous && (previous.text.trim().length === 1 || piece.length === 1);
      const encodedSpace = previous && (/\s$/u.test(previous.text) || /^\s/u.test(item.text));
      const join = previous && !encodedSpace && (touching || (splitLetter && gap <= item.height * 0.3)
        || text.endsWith('-') || piece.startsWith('-'));
      if (text && !join) text += ' ';
      text += piece;
      previous = item;
    }
    return { page: ordered[0]?.page, column, x: ordered[0]?.x, y: row.y, text: text.replace(/[ \t]+/g, ' ').trim() };
  }).filter(row => row.text);
}

function detectGutter(items, pageWidth) {
  if (!Number.isFinite(pageWidth) || pageWidth <= 0 || items.length < 8) return null;
  const candidates = [];
  for (let ratio = 0.34; ratio <= 0.66; ratio += 0.02) {
    const split = pageWidth * ratio;
    const left = items.filter(item => item.x + item.width <= split - 5);
    const right = items.filter(item => item.x >= split + 5);
    const crossing = items.length - left.length - right.length;
    const leftChars = left.reduce((sum, item) => sum + item.text.trim().length, 0);
    const rightChars = right.reduce((sum, item) => sum + item.text.trim().length, 0);
    const overlappingRows = right.filter(item => left.some(other => Math.abs(other.y - item.y) <= 5)).length;
    if (left.length < 3 || right.length < 3 || Math.min(leftChars, rightChars) < 12
      || Math.max(leftChars, rightChars) < 45
      || !left.some(item => /\p{L}{5,}/u.test(item.text))
      || !right.some(item => /\p{L}{5,}/u.test(item.text))
      || overlappingRows < 2 || crossing > Math.max(2, items.length * 0.14)) continue;
    candidates.push({ split, crossing, balance: Math.min(leftChars, rightChars) / Math.max(leftChars, rightChars) });
  }
  return candidates.sort((a, b) => a.crossing - b.crossing || b.balance - a.balance)[0]?.split || null;
}

export function extractPdfPageLayout(rawItems = [], { page = 1, pageWidth = 595 } = {}) {
  const items = rawItems.map(raw => itemFromPdf(raw, page)).filter(item => item.text.trim());
  const gutter = detectGutter(items, pageWidth);
  let lines;
  if (gutter) {
    const left = groupLines(items.filter(item => item.x < gutter && item.x + item.width <= gutter + 5), 'left');
    const right = groupLines(items.filter(item => item.x >= gutter), 'right');
    const spanning = groupLines(items.filter(item => item.x < gutter && item.x + item.width > gutter + 5), 'spanning');
    const boundaries = [Infinity, ...spanning.map(item => item.y), -Infinity];
    lines = [];
    for (let index = 0; index < boundaries.length - 1; index += 1) {
      const top = boundaries[index];
      const bottom = boundaries[index + 1];
      lines.push(...left.filter(item => item.y < top && item.y > bottom));
      lines.push(...right.filter(item => item.y < top && item.y > bottom));
      if (index < spanning.length) lines.push(spanning[index]);
    }
  } else {
    lines = groupLines(items, 'single');
  }
  const issues = [];
  if (!gutter && items.length >= 8) {
    const midpoint = pageWidth * 0.5;
    const left = items.filter(item => item.x + item.width < midpoint - 5);
    const right = items.filter(item => item.x > midpoint + 5);
    if (left.length >= 3 && right.length >= 3 && right.reduce((sum, item) => sum + item.text.length, 0) > 50
      && right.some(item => left.some(other => Math.abs(other.y - item.y) <= 5))) {
      issues.push('Ambiguous PDF reading order; review this page.');
    }
  }
  return {
    text: lines.map(item => item.text).join('\n'),
    lines,
    fragments: items,
    columnsDetected: Boolean(gutter),
    qualityIssues: issues,
  };
}
