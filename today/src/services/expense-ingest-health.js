/** Shared, private-data-free classification for the client and scheduled monitor.
 * source='sms' also includes old imports/pastes, so it alone never proves live ingest.
 */
const DAY = 86400000;
const MANUAL_CARDS = new Set(['현금', '삼성카드 iD SIMPLE', 'samsung_soyeon']);
const ACTIVE_FAMILIES = new Set(['samsung_gio', '신한카드 Air', '현대백화점카드', 'K-패스 신한카드 체크']);
const validMeta = (value) => value == null || (typeof value === 'object' && !Array.isArray(value));
const time = (value) => typeof value === 'string' && value ? Date.parse(value) : NaN;

export function cardIngestFamily(card) {
  if (typeof card !== 'string' || !card.trim() || MANUAL_CARDS.has(card)) return null;
  return /^삼성(?:카드)?\s*\d{4}$/.test(card) ? 'samsung_gio' : card;
}

export function liveIngestAt(row) {
  if (!validMeta(row?.meta)) return null;
  if (row?.source !== 'sms' || typeof row.sms_raw !== 'string' || !row.sms_raw.trim()) return null;
  if (row.meta?.sms_kind === 'unparsed' || row.meta?.review_reason) return null;
  const channel = row.meta?.ingest_channel;
  if (channel && channel !== 'live') return null;
  const spent = time(row.spent_at);
  const received = time(channel === 'live' ? row.meta?.ingested_at || row.created_at : row.created_at);
  // A legacy row imported long after the expense (or lacking provenance) is unverified.
  if (!Number.isFinite(spent) || !Number.isFinite(received) || Math.abs(received - spent) > 2 * DAY) return null;
  return new Date(received).toISOString();
}

export function detectIngestGaps(rows, now = new Date()) {
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) return [];
  const recentFrom = nowMs - 90 * DAY;
  const byFamily = new Map();
  for (const row of rows || []) {
    const family = cardIngestFamily(row?.card);
    const spent = time(row?.spent_at);
    if (!family || row.deleted_at || !Number.isFinite(spent) || spent > nowMs ||
        typeof row.amount_krw !== 'number' || !Number.isFinite(row.amount_krw) || row.amount_krw <= 0 ||
        row.meta?.sms_kind === 'unparsed' || row.meta?.review_reason) continue;
    const group = byFamily.get(family) || { family, card: row.card, txCount: 0, autoCount: 0, lastAutoAt: '', evidenceId: null, latestSpent: -Infinity, liveTimes: [] };
    if (spent >= recentFrom) group.txCount++;
    if (spent > group.latestSpent) { group.card = row.card; group.latestSpent = spent; }
    const live = liveIngestAt(row);
    if (live && time(live) <= nowMs) {
      group.autoCount++;
      group.liveTimes.push(time(live));
      if (live > group.lastAutoAt) { group.lastAutoAt = live; group.evidenceId = row.id || null; }
    }
    byFamily.set(family, group);
  }
  const result = [];
  for (const group of byFamily.values()) {
    // Preserve a known regular channel's warning after its evidence ages past 90 days.
    // Occasional/unknown retired cards require current substantial use.
    const liveTimes = group.liveTimes.sort((a, b) => a - b);
    let regularHistory = false;
    for (let i = 9; i < liveTimes.length; i++) {
      if (liveTimes[i] - liveTimes[i - 9] <= 90 * DAY) { regularHistory = true; break; }
    }
    const active = group.txCount >= 10 || (ACTIVE_FAMILIES.has(group.family) && regularHistory);
    if (!active || !group.lastAutoAt || time(group.lastAutoAt) >= nowMs - 7 * DAY) continue;
    const { liveTimes: _, latestSpent: __, ...gap } = group;
    result.push({ ...gap, daysSince: Math.floor((nowMs - time(group.lastAutoAt)) / DAY) });
  }
  return result.sort((a, b) => a.family.localeCompare(b.family));
}

/** One private warning per owner per KST calendar week. State is stored only in
 * an existing evidence row's meta, with a compare-and-swap by the service monitor.
 * A stale pending claim is retryable after an hour if a runner crashed.
 */
export function planIngestGapAlert(rows, gaps, now = new Date()) {
  if (!gaps.length) return { status: 'healthy' };
  const kstDay = new Date(now.getTime() + 9 * 3600000);
  kstDay.setUTCDate(kstDay.getUTCDate() - (kstDay.getUTCDay() + 6) % 7);
  const week = kstDay.toISOString().slice(0, 10);
  for (const row of rows) {
    const mark = row?.meta?.ingest_gap_alert;
    if (mark?.week !== week) continue;
    if (mark.state === 'sent' || (mark.state === 'pending' && time(mark.claimed_at) > now.getTime() - 3600000)) return { status: 'throttled' };
  }
  const ids = new Set(gaps.map((gap) => gap.evidenceId).filter(Boolean));
  const evidence = rows.filter((row) => row?.id && !row.deleted_at && validMeta(row.meta) && ids.has(row.id)).sort((a, b) => a.id.localeCompare(b.id))[0];
  if (!evidence) return { status: 'missing_evidence' };
  const before = evidence.meta || {};
  return {
    status: 'claim', id: evidence.id, before,
    after: { ...before, ingest_gap_alert: { week, state: 'pending', claimed_at: now.toISOString() } },
  };
}
