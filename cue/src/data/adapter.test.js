/* adapter.test.js — fetchLang 언어 분리 회귀 (버그: 영어만 학습했는데 일본어 시드 레슨이 누출).
   study 앱은 en/ja 둘 다 매일 today_lessons 를 시딩하지만, 실제 학습은 study_daily_stats 에만
   기록된다. 어학 카드는 '사용자가 실제로 한 언어'(=최신 daily_stats lang)만 반영해야 한다.
   최소 mock Supabase 빌더로 buildRealApps 의 어학 경로를 검증. */
import { describe, it, expect } from 'vitest';
import { buildRealApps } from './adapter.js';
import { startOfToday, localDayKey } from './transforms.js';

/** fetchLang 이 쓰는 쿼리 체인만 지원하는 최소 mock 클라이언트.
    canned: { tableName: rows[] }. eq/gte/lte/in/is 필터 + order/limit + count(head) 지원. */
function makeClient(canned) {
  return {
    from(table) {
      const state = { rows: [...(canned[table] || [])], wantCount: false, orderBy: null, asc: true, lim: null };
      const b = {
        select(_cols, opts) { if (opts && opts.count) state.wantCount = true; return b; },
        eq(col, val) { state.rows = state.rows.filter((r) => r[col] === val); return b; },
        gte(col, val) { state.rows = state.rows.filter((r) => r[col] >= val); return b; },
        lte(col, val) { state.rows = state.rows.filter((r) => r[col] <= val); return b; },
        in(col, arr) { state.rows = state.rows.filter((r) => arr.includes(r[col])); return b; },
        is(col, val) { state.rows = state.rows.filter((r) => (r[col] ?? null) === val); return b; },
        or() { return b; }, // sceneTitle not-null 조건 — canned 데이터로 보장(모두 sceneTitle 보유)
        order(col, opts) { state.orderBy = col; state.asc = !(opts && opts.ascending === false); return b; },
        limit(n) { state.lim = n; return b; },
        then(resolve) {
          let rows = state.rows;
          if (state.orderBy) {
            const k = state.orderBy, dir = state.asc ? 1 : -1;
            rows = [...rows].sort((a, x) => (a[k] < x[k] ? -1 : a[k] > x[k] ? 1 : 0) * dir);
          }
          if (state.lim != null) rows = rows.slice(0, state.lim);
          resolve(state.wantCount ? { count: rows.length, error: null } : { data: rows, error: null });
        },
      };
      return b;
    },
  };
}

describe('buildRealApps 어학 — 언어 분리 (일본어 시드 누출 차단)', () => {
  const today = startOfToday();
  const todayKey = localDayKey(today);
  const tenAgo = new Date(today); tenAgo.setDate(tenAgo.getDate() - 10);
  const tenAgoKey = localDayKey(tenAgo);
  const FUTURE = '2099-01-01';

  const U = 'u1';
  const canned = {
    // 실제 학습: 오늘 영어, 과거 일본어 1회(2026-05-13 류) — 최신 활동 = en
    study_daily_stats: [
      { user_id: U, date: todayKey, lang: 'en', study_time_sec: 7200, utterance_count: 20, new_sentences: 4 },
      { user_id: U, date: tenAgoKey, lang: 'ja', study_time_sec: 240, utterance_count: 19, new_sentences: 0 },
    ],
    // 시딩된 레슨: 오늘 일본어(べつに) + 과거 영어(공원 설문). 둘 다 sceneTitle 보유
    study_today_lessons: [
      { user_id: U, date: todayKey, lang: 'ja', explanation: { sceneTitle: 'べつに、めんどくさい' } },
      { user_id: U, date: tenAgoKey, lang: 'en', explanation: { sceneTitle: '공원 설문' } },
    ],
    // 복습 큐: en 3건(1건 오늘 만료) + ja 5건(2건 만료) → en 필터 시 collected 3 · due 1
    study_review_queue: [
      { user_id: U, lang: 'en', next_review: tenAgoKey }, { user_id: U, lang: 'en', next_review: FUTURE }, { user_id: U, lang: 'en', next_review: FUTURE },
      { user_id: U, lang: 'ja', next_review: tenAgoKey }, { user_id: U, lang: 'ja', next_review: tenAgoKey },
      { user_id: U, lang: 'ja', next_review: FUTURE }, { user_id: U, lang: 'ja', next_review: FUTURE }, { user_id: U, lang: 'ja', next_review: FUTURE },
    ],
    study_session_logs: [],
  };

  it('오늘 영어 학습 → 일본어 시드 제목이 어학 카드에 누출되지 않는다', async () => {
    const apps = await buildRealApps(makeClient(canned), 'u1');
    const lang = apps[2]; // read, write, lang, gym 순
    expect(lang.id).toBe('lang');
    expect(lang.done).toBe(true); // 오늘 영어를 했으므로 완료
    // 핵심: 일본어 시드 제목이 어디에도 없어야 한다
    expect(JSON.stringify(lang)).not.toContain('べつに');
    expect(lang.hookDone.title).toBe('오늘'); // "오늘 「べつに…」" 아님
  });

  it('복습 대기·익힌 문장도 활성 언어(en)만 집계', async () => {
    const apps = await buildRealApps(makeClient(canned), 'u1');
    const lang = apps[2];
    // 익힌 문장 = en 큐 전체 3개 (ja 5개 제외)
    const collected = lang.statRecords.find((r) => r.lb === '익힌 문장');
    expect(collected.v).toBe('3개');
    // 복습 대기 = en 만료 1개 (ja 2개 제외)
    expect(lang.sub).toContain('1개');
  });
});

describe('buildRealApps 어학 — 실학습 신호 게이트 (발화 0 잔류 세션 오탐 차단, 2026-07-04)', () => {
  const today = startOfToday();
  const todayKey = localDayKey(today);
  const threeAgo = new Date(today); threeAgo.setDate(threeAgo.getDate() - 3);
  const threeAgoKey = localDayKey(threeAgo);
  const U = 'u1';

  // 오늘: 세션 탭 방치로 study_time 만 쌓임 (발화·신규·복습 0) — 실학습 아님.
  // 3일 전: 발화 7 실학습. today_lessons 는 학습 여부와 무관하게 매일 시딩됨.
  const canned = {
    study_daily_stats: [
      { user_id: U, date: todayKey, lang: 'en', study_time_sec: 1445, utterance_count: 0, new_sentences: 0, review_count: 0 },
      { user_id: U, date: threeAgoKey, lang: 'en', study_time_sec: 112, utterance_count: 7, new_sentences: 0, review_count: 0 },
    ],
    study_today_lessons: [
      { user_id: U, date: todayKey, lang: 'en', explanation: { sceneTitle: '방문 유세 — 공원에 관심 없다는 주민' } },
      { user_id: U, date: threeAgoKey, lang: 'en', explanation: { sceneTitle: '공원 설문' } },
    ],
    study_review_queue: [],
    study_session_logs: [],
  };

  it('발화·신규·복습 0 이면 study_time>0 이어도 done=false (✔ 오탐 제거)', async () => {
    const apps = await buildRealApps(makeClient(canned), 'u1');
    const lang = apps[2];
    expect(lang.id).toBe('lang');
    expect(lang.done).toBe(false);
    expect(lang.tlMeta).toBeNull(); // 타임라인 '오늘 N분' 메타도 없어야 함
  });

  it('팬텀 날은 캘린더 활동일로도 안 잡히고, 직전 학습은 3일 전(실학습일)', async () => {
    const apps = await buildRealApps(makeClient(canned), 'u1');
    const lang = apps[2];
    expect(lang.cal[new Date(today).getDate() - 1]).toBe(0); // 오늘 칸 = 무활동
    // 오늘 시드 제목이 '한 것'처럼 누출되지 않아야 함 (직전 학습 = 3일 전 '공원 설문')
    expect(JSON.stringify(lang)).not.toContain('방문 유세');
  });

  it('활성 언어 판정도 실학습 신호 기준 — 타 언어 팬텀 행이 언어를 뺏지 않는다', async () => {
    const yesterAgo = new Date(today); yesterAgo.setDate(yesterAgo.getDate() - 1);
    const yKey = localDayKey(yesterAgo);
    const c2 = {
      study_daily_stats: [
        { user_id: U, date: todayKey, lang: 'ja', study_time_sec: 999, utterance_count: 0, new_sentences: 0, review_count: 0 },
        { user_id: U, date: yKey, lang: 'en', study_time_sec: 300, utterance_count: 5, new_sentences: 1, review_count: 0 },
      ],
      study_today_lessons: [
        { user_id: U, date: todayKey, lang: 'ja', explanation: { sceneTitle: 'べつに、めんどくさい' } },
        { user_id: U, date: yKey, lang: 'en', explanation: { sceneTitle: '공원 설문' } },
      ],
      study_review_queue: [
        { user_id: U, lang: 'en', next_review: yKey }, { user_id: U, lang: 'en', next_review: '2099-01-01' },
        { user_id: U, lang: 'ja', next_review: yKey }, { user_id: U, lang: 'ja', next_review: yKey },
      ],
      study_session_logs: [],
    };
    const apps = await buildRealApps(makeClient(c2), 'u1');
    const lang = apps[2];
    expect(JSON.stringify(lang)).not.toContain('べつに'); // ja 팬텀이 활성 언어를 못 뺏음
    const collected = lang.statRecords.find((r) => r.lb === '익힌 문장');
    expect(collected.v).toBe('2개'); // en 큐만
  });
});
