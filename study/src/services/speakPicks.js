/* speakPicks.js — 말하기 연습(#/speak) 표현 선별 (2026-09-08 작업지시서 §6).
 * 저장된 프롬프트를 쓰지 않고 매번 Dexie 에서 다시 읽는다. 범위 3개:
 *   today  = 오늘 세션 로그(newSentenceIds ∪ sentenceIds)에 있는 카드
 *   hard   = 최근 HARD_WINDOW_DAYS 안에 X 판정(resultHistory) 또는 lastResult X 인 카드, 최근 실패 순
 *   random = 활성 카드에서 무작위
 * 상한 SPEAK_MAX — 오늘 카드가 6~7장이면 오늘 판정 X > △ > 나머지, 같으면 신규 > 복습, 같으면 나중에 배운 순으로 남긴다
 * (2026-09-08 사용자 확정 권장안). soft-delete(explanation._deleted)·장면 카드(explanation.dialogue)는 뺀다. */
import { todayPlusDays } from './srs.js';

export const SPEAK_MAX = 5;
export const HARD_WINDOW_DAYS = 14;
export const SPEAK_SCOPES = ['today', 'hard', 'random'];

const RESULT_RANK = { X: 3, '△': 2, O: 1 };
const str = (v) => String(v ?? '');
const isActive = (c) => Boolean(c && str(c.sentence).trim() && !c.explanation?._deleted && !Array.isArray(c.explanation?.dialogue));
const learnedAt = (c) => str(c?.promotedAt || c?.createdAt);
/* 핵심 표현 = explanation.key 의 '=' 앞 청크(괄호 주석 제거) — sessionShell.exprOf 와 같은 규칙. UI 모듈을 서비스로 끌어오지 않으려고
 * summaryData.js 처럼 한 줄로 둔다. */
const exprOf = (card) => str(card?.explanation?.key).split('=')[0].replace(/\([^)]*\)/g, '').trim();

export function toSpeakItem(card) {
  const expr = exprOf(card) || str(card?.sentence).trim();
  return {
    id: card.id,
    expr,
    sentence: str(card?.sentence).trim(),
    situation: str(card?.explanation?.situation).trim(),
    ko: str(card?.meaning ?? card?.ko).trim(),
    miniDialogue: Array.isArray(card?.explanation?.miniDialogue) ? card.explanation.miniDialogue : [],
    drills: Array.isArray(card?.explanation?.drills) ? card.explanation.drills : [],
  };
}

/* 오늘 판정 — resultHistory 의 오늘 항목(마지막) 우선, 없으면 lastResultAt 이 오늘인 lastResult. */
function todayResult(card, todayISO) {
  const hist = Array.isArray(card?.resultHistory) ? card.resultHistory : [];
  const t = hist.filter((x) => x?.date === todayISO).pop();
  if (t?.result) return t.result;
  if (card?.lastResultAt && str(card.lastResultAt).slice(0, 10) === todayISO) return card.lastResult ?? null;
  return null;
}

export function pickToday(cards, logs, todayISO) {
  const todayLogs = (Array.isArray(logs) ? logs : []).filter((l) => l?.date === todayISO);
  const newIds = new Set(todayLogs.flatMap((l) => (Array.isArray(l.newSentenceIds) ? l.newSentenceIds : [])));
  const ids = new Set([...newIds, ...todayLogs.flatMap((l) => (Array.isArray(l.sentenceIds) ? l.sentenceIds : []))]);
  const pool = (Array.isArray(cards) ? cards : []).filter((c) => isActive(c) && ids.has(c.id));
  const key = (c) => [RESULT_RANK[todayResult(c, todayISO)] || 0, newIds.has(c.id) ? 1 : 0, learnedAt(c)];
  pool.sort((a, b) => {
    const ka = key(a), kb = key(b);
    return (kb[0] - ka[0]) || (kb[1] - ka[1]) || kb[2].localeCompare(ka[2]);
  });
  return pool.slice(0, SPEAK_MAX).map(toSpeakItem);
}

export function pickHard(cards, todayISO) {
  const cutoff = todayPlusDays(todayISO, -HARD_WINDOW_DAYS);
  const lastFail = (c) => {
    const hist = Array.isArray(c?.resultHistory) ? c.resultHistory : [];
    const fails = hist.filter((x) => x?.result === 'X' && str(x?.date) >= cutoff).map((x) => str(x.date)).sort();
    if (fails.length) return fails[fails.length - 1];
    if (c?.lastResult === 'X') return str(c.lastResultAt).slice(0, 10) || cutoff;
    return null;
  };
  const pool = (Array.isArray(cards) ? cards : []).filter(isActive)
    .map((c) => ({ c, d: lastFail(c) })).filter((x) => x.d);
  pool.sort((a, b) => b.d.localeCompare(a.d) || learnedAt(b.c).localeCompare(learnedAt(a.c)));
  return pool.slice(0, SPEAK_MAX).map((x) => toSpeakItem(x.c));
}

export function pickRandom(cards, rng = Math.random) {
  const pool = (Array.isArray(cards) ? cards : []).filter(isActive);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, SPEAK_MAX).map(toSpeakItem);
}

export async function loadSpeakItems(db, lang, scope, todayISO, rng = Math.random) {
  if (!db?.reviewQueue?.where) return [];
  const cards = await db.reviewQueue.where('lang').equals(lang).toArray();
  if (scope === 'random') return pickRandom(cards, rng);
  if (scope === 'hard') return pickHard(cards, todayISO);
  const logs = db.sessionLogs?.where ? await db.sessionLogs.where('date').equals(todayISO).toArray() : [];
  return pickToday(cards, logs.filter((l) => !l?.lang || l.lang === lang), todayISO);
}
