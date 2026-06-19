/**
 * dev 시드 (로컬/스테이징 시각 검증용). today devSeed 패턴 답습.
 *
 * v14 design-ref/data.jsx 의 QUOTES(15)+comments 를 Dexie 에 주입 (전부 본인 소유).
 *  - 시드 id 는 비-UUID (`quote-seed-*`/`comment-seed-*`) → sync.js 가 push skip (로컬 전용).
 *  - 멱등: 이미 있으면 skip.
 *
 * 자동 호출 안 함 — preview/E2E 검증 시 명시 호출 (window.bookDevSeed.seedDemoData).
 * production 실데이터는 Supabase sync 로 채워짐.
 */
import { Queries } from './queries.js';

// design-ref/data.jsx QUOTES (b=book id, t=시각, text, pin?, comments?).
export const SEED_QUOTES = Object.freeze([
  { id: 1, b: 1, t: '2026.05.15 14:32', pin: true,
    text: '걷는 동안 나는 풍경에 속한다. 풍경이 나를 통과해 지나간다. 그 순간 만큼은, 풍경과 나 사이에는 아무런 거리도 없다.',
    comments: [
      { t: '05.15', text: '걷기가 왜 글쓰기와 닮았는지 — 같은 이유로 둘 다 느리고, 둘 다 거리(distance)를 다룬다.' },
      { t: '05.15', text: '걷다 보면 글로 옮길 거리가 더 생긴다.' },
      { t: '05.15', text: '천천히 걸을수록 문장은 길어진다.' },
    ] },
  { id: 2, b: 1, t: '2026.05.15 14:21',
    text: '걷기는 가장 오래된 형태의 사유다. 의자에 앉아서는 도달할 수 없는 결론들이 있다.' },
  { id: 3, b: 1, t: '2026.05.15 09:14',
    text: '천천히 걷는다고 해서 천천히 가는 것은 아니다. 가만히 있어도 어딘가에 도착하는 사람이 있다.' },
  { id: 4, b: 8, t: '2026.05.14 23:14',
    text: '사람이 의식적으로 자신의 주의를 한 가지에 집중하는 동안, 그 외의 모든 것은 사라진다.' },
  { id: 5, b: 3, t: '2026.05.14 21:08', pin: true,
    text: '우리는 작별을 알지 못한 채 작별한다. 그것이 다행이고 그것이 슬픔이다.' },
  { id: 6, b: 9, t: '2026.05.14 09:15',
    text: '돈을 다루는 데 가장 어려운 점은 그것이 수학이 아니라 행동이라는 것이다. 그리고 행동은 가르치기 어렵다 — 정말 똑똑한 사람에게도.',
    comments: [{ t: '05.14', text: '결국 시스템보다 습관.' }] },
  { id: 7, b: 9, t: '2026.05.14 08:48', pin: true,
    text: '운과 위험은 같은 동전의 양면이다. 한쪽만 보는 사람은 결국 그 동전 전체를 잃는다.' },
  { id: 8, b: 6, t: '2026.05.13 12:00',
    text: '어떤 말은 입에서 나오기 전에 마음에서 한 번 더 시작한다. 그래서 말을 잘 한다는 건, 시작을 잘 한다는 뜻이기도 하다.' },
  { id: 9, b: 2, t: '2026.05.12 19:30',
    text: '읽기는 빨라졌고, 쓰기는 더 빨라졌다. 그러나 머무르는 일은 여전히 느리다.' },
  { id: 10, b: 10, t: '2026.05.11 22:45',
    text: '오래 일하다 보면 알게 된다. 우리가 환자에게 줄 수 있는 가장 큰 것은 시간이라는 것을. 약이 아니라.' },
  { id: 11, b: 7, t: '2026.05.10 18:20',
    text: '우리가 빛의 속도로 갈 수 없다는 사실은, 결국 우리가 누군가를 영영 만나지 못할 수도 있다는 뜻이다.' },
  { id: 12, b: 1, t: '2026.04.24 11:25',
    text: '걷는 사람은 시간을 길게 쓴다. 같은 거리를 가더라도 그것을 가만히 펼친다. 그 사이로 생각이 끼어든다.' },
  { id: 13, b: 13, t: '2026.05.09 22:40',
    text: '매일이 신을 만나는 일이라면, 매일은 또한 신을 잃는 일이다.' },
  { id: 14, b: 10, t: '2026.05.08 07:10',
    text: '죽음을 미루는 것이 의학의 일이라면, 죽음을 견디게 하는 것은 누구의 일인가.' },
  { id: 15, b: 6, t: '2026.05.07 21:15',
    text: '말은 마음의 그림자다. 그림자만 보고도 사람을 짐작할 수 있다.' },
]);

function quoteTimeToIso(t) {
  const m = String(t).match(/(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00.000Z`;
  return new Date().toISOString();
}

function commentTimeToIso(t, fallbackIso) {
  const m = String(t).match(/(\d{2})\.(\d{2})/);
  if (m) return `2026-${m[1]}-${m[2]}T12:00:00.000Z`;
  return fallbackIso || new Date().toISOString();
}

const seedQuoteId = (n) => `quote-seed-${n}`;
const seedCommentId = (qn, i) => `comment-seed-${qn}-${i}`;

export const SEED_QUOTE_IDS = Object.freeze(SEED_QUOTES.map((q) => seedQuoteId(q.id)));

/**
 * v14 QUOTES → Dexie 시드 (멱등). 어구록·댓글 전부 본인(meId) 소유.
 * @param {{meId: string}} opts
 */
export async function seedDemoData({ meId } = {}) {
  if (!meId) return { ok: false, reason: 'no_meId' };
  const dbi = (typeof globalThis !== 'undefined' && globalThis.bookDB) || null;
  if (!dbi) return { ok: false, reason: 'no_db' };

  let quotesAdded = 0, quotesSkipped = 0, commentsAdded = 0;
  for (const q of SEED_QUOTES) {
    const qid = seedQuoteId(q.id);
    try {
      const existing = await Queries.getQuote(qid);
      if (existing) { quotesSkipped += 1; continue; }
      const ts = quoteTimeToIso(q.t);
      await Queries.createQuote({
        id: qid,
        owner_id: meId,
        book_ref: String(q.b),
        text: q.text,
        pinned: q.pin ? 1 : 0,
        created_at: ts,
        updated_at: ts,
      });
      quotesAdded += 1;
      const comments = q.comments || [];
      for (let i = 0; i < comments.length; i++) {
        const c = comments[i];
        await Queries.createComment({
          id: seedCommentId(q.id, i),
          quote_id: qid,
          author_id: meId,
          body: c.text,
          created_at: commentTimeToIso(c.t, ts),
          updated_at: commentTimeToIso(c.t, ts),
        });
        commentsAdded += 1;
      }
    } catch (err) {
      console.warn('[devSeed] quote 시드 실패:', qid, err?.message || err);
    }
  }
  return { ok: true, quotesAdded, quotesSkipped, commentsAdded };
}

/** 시드 데이터 hard-delete (멱등). */
export async function cleanupDemoData() {
  const dbi = (typeof globalThis !== 'undefined' && globalThis.bookDB) || null;
  if (!dbi?.quotes || !dbi?.comments) return { ok: false, reason: 'no_db' };
  let quotesRemoved = 0, commentsRemoved = 0;
  for (const q of SEED_QUOTES) {
    const qid = seedQuoteId(q.id);
    try {
      if (await dbi.quotes.get(qid)) { await dbi.quotes.delete(qid); quotesRemoved += 1; }
      const comments = q.comments || [];
      for (let i = 0; i < comments.length; i++) {
        const cid = seedCommentId(q.id, i);
        if (await dbi.comments.get(cid)) { await dbi.comments.delete(cid); commentsRemoved += 1; }
      }
    } catch (err) {
      console.warn('[devSeed] cleanup 실패:', qid, err?.message || err);
    }
  }
  return { ok: true, quotesRemoved, commentsRemoved };
}

export const DevSeed = {
  SEED_QUOTES,
  SEED_QUOTE_IDS,
  seedDemoData,
  cleanupDemoData,
};

if (typeof window !== 'undefined') {
  window.bookDevSeed = DevSeed;
}

export default DevSeed;
