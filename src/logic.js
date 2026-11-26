'use strict';

const MAX_LINE_CHARS = 140;

/** Turns Claude's reply into clean one-line speech bubbles. */
function cleanLines(text, maxWords = 18) {
  const seen = new Set();
  const lines = [];
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/^["'“‘]+|["'”’]+$/g, '')
      .trim();
    if (!line || line.endsWith(':')) continue;
    if (line.length > MAX_LINE_CHARS || line.split(/\s+/).length > maxWords) continue;
    const dedupeKey = line.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    lines.push(line);
  }
  return lines;
}

function partOfDay(date) {
  const hour = date.getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'late at night';
}

module.exports = { cleanLines, partOfDay };
