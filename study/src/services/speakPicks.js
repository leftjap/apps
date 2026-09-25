/* speakPicks.js — 말하기 연습(#/speak) 표현 선별 (2026-09-08 작업지시서 §6, 2026-09-25 지난 세션 선택).
 * 저장된 프롬프트를 쓰지 않고 매번 Dexie 에서 다시 읽는다. 범위 3개:
 *   session = 세션 로그 한 건(newSentenceIds ∪ sentenceIds)의 카드. 오늘 세션뿐 아니라 지난 세션도 고른다(listSessions)
 *   hard    = 최근 HARD_WINDOW_DAYS 안에 X 판정(resultHistory) 또는 lastResult X 인 카드, 최근 실패 순
 *   random  = 활성 카드에서 무작위
 * 상한 SPEAK_MAX. soft-delete(explanation._deleted)·장면 카드(explanation.dialogue)는 뺀다. */
import { todayPlusDays } from './srs.js';

export const SPEAK_MAX = 5;
export const HARD_WINDOW_DAYS = 14;
export const SPEAK_SCOPES = ['session', 'hard', 'random'];

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

/* 세션 목록 — 로그 한 건이 세션 하나, 최신순(date → createdAt). 다른 로그에 문장이 모두 들어 있는 로그(중간에 끊긴 뒤
 * 다시 한 세션)는 빼고, 문장이 같으면 최신 한 건만 남긴다. 문장은 로그에 적힌 순서(배운 순서) 그대로 둔다 — 배우는 세션은
 * 판정을 남기지 않아 종전 '오늘 판정 X > △' 정렬이 실제로는 작동하지 않았다. 남은 활성 카드가 없는 세션(영어 트랙 리셋
 * 2026-09-13·09-20 로 삭제 표시된 세션 등)은 목록에 넣지 않는다. */
const logIds = (l) => [...new Set([...(Array.isArray(l?.newSentenceIds) ? l.newSentenceIds : []), ...(Array.isArray(l?.sentenceIds) ? l.sentenceIds : [])])];

export function listSessions(cards, logs) {
  const byId = new Map((Array.isArray(cards) ? cards : []).filter(isActive).map((c) => [c.id, c]));
  const rows = (Array.isArray(logs) ? logs : []).map((l) => ({ l, ids: logIds(l) })).filter((r) => r.ids.length)
    .sort((a, b) => str(b.l.date).localeCompare(str(a.l.date)) || str(b.l.createdAt).localeCompare(str(a.l.createdAt)));
  // 정렬 뒤라 앞선 행이 더 최신이다 — 문장이 같은 행끼리는 앞선 행만 남는다.
  const covered = (r, i) => rows.some((o, j) => j !== i && r.ids.every((id) => o.ids.includes(id)) && (o.ids.length > r.ids.length || j < i));
  return rows.filter((r, i) => !covered(r, i))
    .map(({ l, ids }) => ({ key: str(l.id), date: str(l.date), items: ids.map((id) => byId.get(id)).filter(Boolean).slice(0, SPEAK_MAX).map(toSpeakItem) }))
    .filter((s) => s.items.length);
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
  return [];
}

export async function loadSpeakSessions(db, lang) {
  if (!db?.reviewQueue?.where || !db?.sessionLogs?.where) return [];
  const [cards, logs] = await Promise.all([
    db.reviewQueue.where('lang').equals(lang).toArray(),
    db.sessionLogs.where('lang').equals(lang).toArray(),
  ]);
  return listSessions(cards, logs);
}
