// 날짜·점수·공유·연속 기록. 화면과 무관한 순수 함수만 둔다.

export const EPOCH = '2026-11-11';
const DAY_MS = 86400000;

export function seoulDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(date);
  return parts; // en-CA 는 YYYY-MM-DD
}

function keyToUtc(key) {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function dayIndex(key, epoch = EPOCH) {
  return Math.round((keyToUtc(key) - keyToUtc(epoch)) / DAY_MS);
}

export function pickDay(days, key, epoch = EPOCH) {
  const n = days.length;
  return days[((dayIndex(key, epoch) % n) + n) % n];
}

// 지목한 사람이 거짓말한 사람이면 50점, 표정이 드러난 곳에 가까울수록 100점까지 더한다.
// 거리는 이미지 폭을 1 로 본 값. 단서 반경(r) 안이면 만점, 0.30 이상 떨어지면 50점.
const ZERO_AT = 0.3;
export function pinScore(caseObj, pick) {
  const liar = caseObj.suspects.find((s) => s.liar);
  if (!pick || pick.key !== liar.key) return 0;
  const d = Math.hypot(pick.x - liar.tell.x, pick.y - liar.tell.y);
  const k = d <= liar.tell.r ? 1 : Math.max(0, 1 - (d - liar.tell.r) / (ZERO_AT - liar.tell.r));
  return 50 + Math.round(50 * k);
}

export function tier(score) {
  if (score >= 80) return 'good';
  if (score >= 40) return 'mid';
  return 'bad';
}

const DOT = { good: '🟢', mid: '🟡', bad: '🔴' };
export function emojiRow(scores) {
  return scores.map((s) => DOT[tier(s)]).join('');
}

export function formatKoreanDate(key) {
  const [, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일`;
}

export function shareText(key, scores) {
  const total = scores.reduce((a, s) => a + s, 0);
  return `라이투미 · ${formatKoreanDate(key)}\n${emojiRow(scores)} ${total}/${scores.length * 100}`;
}

export function updateStreak(prev, key) {
  if (prev && prev.lastDate === key) return prev;
  const continued = prev && dayIndex(key, prev.lastDate) === 1;
  const streak = continued ? prev.streak + 1 : 1;
  return { lastDate: key, streak, best: Math.max(streak, prev?.best ?? 0) };
}
