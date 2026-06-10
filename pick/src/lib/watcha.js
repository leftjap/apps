// 왓챠피디아 export CSV 파서. MOVIE 행만(TV 제외), 0.5★ 보존.
// ⚠ 컬럼명은 가정값(content_id/title/type/year/director/watched_at/rating) — 실제 export 헤더로 확정(spec §5).
function splitCsvLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseWatchaCsv(text) {
  const lines = String(text || '').trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (name) => head.indexOf(name);
  const iTitle = idx('title'), iType = idx('type'), iYear = idx('year'), iRating = idx('rating'), iWatched = idx('watched_at');
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    if (c.length < head.length) continue;
    if (String(c[iType]).toUpperCase() !== 'MOVIE') continue; // TV/드라마 제외
    const rating = parseFloat(c[iRating]);
    if (!(rating >= 0.5 && rating <= 5)) continue; // 무평점/범위 밖 제외
    rows.push({
      media_type: 'movie',
      title: (c[iTitle] || '').trim(),
      year: c[iYear] ? parseInt(c[iYear], 10) : null,
      rating,
      source: 'watcha',
      rated_at: c[iWatched] || null,
    });
  }
  return rows;
}
