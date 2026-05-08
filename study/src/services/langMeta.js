/**
 * langMeta.js — lang_${lang} meta 의 totalDays / totalTime / streak 누적 (spec §4 LANG_META, §8-7).
 *
 * Wave A.11.
 *
 * Dexie meta key: 'lang_en' / 'lang_ja'.
 * value 구조 (spec §4):
 *   { totalDays, totalTime, streak, lastStudyDate, currentStage?, userKnown?, goal?, currentCategory? }
 *
 * 본 wave 는 totalDays / totalTime / streak / lastStudyDate 4 필드만 갱신.
 * 나머지 (currentStage/userKnown/goal/currentCategory) 는 userMeta.applySessionResults 등 별 모듈 책임.
 * spread 로 보존.
 */

function nextDayISO(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export function mergeLangMeta(prev, log) {
  const base = (prev && typeof prev === 'object' && !Array.isArray(prev)) ? { ...prev } : {};
  const totalTime = (Number(base.totalTime) || 0) + (Number(log?.durationSec) || 0);
  const date = log?.date;
  const lastStudyDate = base.lastStudyDate;
  let totalDays = Number(base.totalDays) || 0;
  let streak = Number(base.streak) || 0;

  if (!date) {
    return { ...base, totalTime };
  }

  if (date === lastStudyDate) {
    // 같은 날 추가 세션 — totalTime 만 누적, days/streak 변동 없음
  } else if (lastStudyDate && date === nextDayISO(lastStudyDate)) {
    totalDays += 1;
    streak += 1;
  } else {
    // 첫 세션 OR 갭 (2일 이상) → streak 리셋
    totalDays += 1;
    streak = 1;
  }

  return {
    ...base,
    totalTime,
    totalDays,
    streak,
    lastStudyDate: date,
  };
}

export async function applyLangMeta(db, lang, log) {
  if (!db?.meta || !lang || !log) return null;
  const key = `lang_${lang}`;
  const existing = await db.meta.get(key);
  const prev = existing?.value && typeof existing.value === 'object' ? existing.value : {};
  const next = mergeLangMeta(prev, log);
  await db.meta.put({ key, value: next, at: Date.now() });
  return next;
}
