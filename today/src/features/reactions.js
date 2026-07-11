/**
 * 이모지 리액션 — 순수 로직 + 렌더 (Wave: 리액션).
 *
 * 공유 게시물(entry)·댓글(comment)에 긍정 이모지(👍 ❤️ 😄)를 눌러 반응. 토글식.
 * DB/Dexie 접근 없음 → 단위 테스트 용이. 실제 CRUD 는 queries.js, 동기화는 sync.js.
 */

export const REACTION_EMOJIS = Object.freeze(['👍', '❤️', '😄']);

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 타겟 1개의 리액션 rows → 이모지별 집계.
 * @param {{emoji:string, author_id:string}[]} rows
 * @param {{currentUserId?:string}} opts
 * @returns {{emoji:string, count:number, mine:boolean}[]}  count>0 만, REACTION_EMOJIS 순서.
 */
export function summarizeReactions(rows, opts = {}) {
  const me = opts.currentUserId || null;
  const byEmoji = new Map();
  for (const r of rows || []) {
    if (!r || !r.emoji) continue;
    if (!byEmoji.has(r.emoji)) byEmoji.set(r.emoji, { emoji: r.emoji, count: 0, mine: false });
    const s = byEmoji.get(r.emoji);
    s.count += 1;
    if (me && r.author_id === me) s.mine = true;
  }
  const order = (e) => {
    const i = REACTION_EMOJIS.indexOf(e);
    return i === -1 ? REACTION_EMOJIS.length : i;
  };
  return [...byEmoji.values()].sort((a, b) => order(a.emoji) - order(b.emoji));
}

/**
 * 클릭 시 추가/제거 판정. 내 반응(같은 author+emoji)이 있으면 remove(그 id), 없으면 add.
 * @param {{id:string, emoji:string, author_id:string}[]} rows  해당 타겟의 전체 리액션
 * @param {{currentUserId:string, emoji:string}} opts
 * @returns {{action:'add'} | {action:'remove', id:string}}
 */
export function decideToggle(rows, opts = {}) {
  const me = opts.currentUserId || null;
  const mine = (rows || []).find((r) => r && r.author_id === me && r.emoji === opts.emoji);
  return mine ? { action: 'remove', id: mine.id } : { action: 'add' };
}

/**
 * 리액션 바 HTML. 카운트>0 이모지는 칩(내 반응은 is-mine), 항상 추가 버튼 + picker.
 * @param {{emoji:string, count:number, mine:boolean}[]} summary  summarizeReactions 결과
 * @param {{targetType:'entry'|'comment', targetId:string}} opts
 */
export function reactionBarHtml(summary, opts = {}) {
  const type = opts.targetType === 'entry' ? 'entry' : 'comment';
  const id = escapeHtml(opts.targetId || '');
  const chips = (summary || [])
    .filter((s) => s.count > 0)
    .map((s) => {
      const cls = s.mine ? 'rx-chip is-mine' : 'rx-chip';
      return `<button class="${cls}" type="button" data-emoji="${escapeHtml(s.emoji)}" aria-pressed="${s.mine ? 'true' : 'false'}">${escapeHtml(s.emoji)} <span class="rx-n">${s.count}</span></button>`;
    })
    .join('');
  const picks = REACTION_EMOJIS
    .map((e) => `<button class="rx-pick" type="button" data-emoji="${escapeHtml(e)}" aria-label="${escapeHtml(e)} 반응">${escapeHtml(e)}</button>`)
    .join('');
  return `<div class="rx-bar" data-target-type="${type}" data-target-id="${id}">${chips}<button class="rx-add" type="button" aria-label="반응 추가" aria-expanded="false">☺</button><div class="rx-picker" role="menu" hidden>${picks}</div></div>`;
}

export const Reactions = { REACTION_EMOJIS, summarizeReactions, decideToggle, reactionBarHtml };

if (typeof window !== 'undefined') {
  window.todayReactions = Reactions;
}

export default Reactions;
