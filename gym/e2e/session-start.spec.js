/**
 * Wave 11.9.1 — 세션 시작 + 운동 추가 e2e.
 *
 * 환경: vite preview (4173) + fakeUser ensureUserDB 패턴 (Wave 11.7.4b 답습).
 *
 * 검증:
 *   A. SPA fakeUser → session 진입 시 6 부위 chip + chest 운동 리스트 hydrate.
 *   B. 운동 클릭 → Dexie sessions row 1건 (startTime 갱신, blocks/tags 추가) + mocks nav-item.
 *   C. 같은 운동 두번째 클릭 → 중복 차단 (blocks 길이 보존).
 *   D. 다른 부위 chip → 종목 리스트 변경.
 */
import { test, expect } from '@playwright/test';

const FAKE_USER = { id: '88888888-9999-aaaa-bbbb-cccccccccccc', email: 'session-start@e2e.test' };

async function bootstrapFake(page) {
  await page.goto('/');
  await page.evaluate(async (user) => {
    if (!window.gymAuth) return;
    await window.gymAuth.ensureUserDB(user);
  }, FAKE_USER);
  // 깨끗한 상태 — 기존 sessions / settings hiddenExercises 비우기
  await page.evaluate(async () => {
    if (!window.gymQueries || !window.gymDB) return;
    const all = await window.gymDB.sessions.toArray();
    for (const s of all) await window.gymDB.sessions.delete(s.id);
    await window.gymQueries.upsertUserSettings({
      hiddenExercises: [], exerciseOrder: {}, exercisePartOverride: {},
    });
  });
}

async function navigateSession(page) {
  await page.evaluate(() => { window.location.hash = '#/session'; });
  await page.waitForFunction(() => document.body.dataset.route === 'session', { timeout: 5_000 });
  // SPA hydrate 완료 대기 — addexChips 가 6 부위 chip (PART_IDS) 로 바뀐 시점.
  await page.waitForFunction(() => {
    const el = document.getElementById('addexChips');
    if (!el) return false;
    const chips = el.querySelectorAll('[data-part]');
    if (chips.length !== 6) return false;
    // mocks 7부위 한국어 chip 이 아니라 SPA 6부위 영문 id 가 보장되는지 확인 (chest 등)
    return Array.from(chips).some((c) => c.getAttribute('data-part') === 'chest');
  }, { timeout: 5_000 });
}

test.describe('Wave 11.9.1 — session start + add exercise', () => {
  test('A. SPA session 진입 → 6 부위 + chest 운동 hydrate', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);

    // 부위 chip 6개 (spec §11)
    const partChips = await page.locator('#addexChips [data-part]').count();
    expect(partChips).toBe(6);

    // chest 활성
    await expect(page.locator('#addexChips [data-part="chest"]')).toHaveClass(/is-active/);

    // chest 운동 리스트 — 1건 이상 + bench_press
    const items = await page.locator('#addexList [data-ex]').count();
    expect(items).toBeGreaterThan(0);
    await expect(page.locator('#addexList [data-ex="bench_press"]')).toBeVisible();
  });

  test('B. 운동 클릭 → Dexie sessions row 1건 + startTime 갱신', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);

    const before = Date.now();
    await page.click('#addexList [data-ex="bench_press"]');

    // Dexie sessions row 검증 (active 1건)
    await page.waitForFunction(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all.length === 1 && all[0].status === 'active' && all[0].blocks.length === 1;
    }, { timeout: 3_000 });

    const sess = await page.evaluate(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all[0];
    });
    expect(sess.status).toBe('active');
    expect(sess.startTime).toBeGreaterThanOrEqual(before - 1000);
    expect(sess.blocks.length).toBe(1);
    expect(sess.blocks[0].type).toBe('single');
    expect(sess.blocks[0].exerciseId).toBe('bench_press');
    // Wave 11.9.2 — bench_press default 5세트 prefill (preset:true)
    expect(sess.blocks[0].sets.length).toBe(5);
    expect(sess.blocks[0].sets[0]).toEqual({
      weight: 60, reps: 10, done: false, preset: true, pr: false,
    });
    expect(sess.tags).toContain('chest');

    // v2 redesign — #navTrack .nav-item 옛 마크업 폐기. hookClicks 의 자동 mountSessionView →
    // active 분기 전환 후 #cardExName 에 운동명 표시 (mocks/session.html:133).
    await page.waitForFunction(() => document.body.dataset.state === 'active', { timeout: 3_000 });
    await expect(page.locator('#cardExName')).toHaveText('벤치프레스');
  });

  test('C. 같은 운동 두번째 클릭 → 중복 차단 (Dexie blocks 길이 1 유지)', async ({ page }) => {
    // NOTE: §1-X 자동 remount 로 첫 클릭 후 SessionEmpty 시트 hidden → 두 번째 UI 클릭 불가. API 단위로 중복 차단 의미 보존.
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);

    await page.click('#addexList [data-ex="bench_press"]');
    await page.waitForFunction(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all.length === 1 && all[0].blocks.length === 1;
    }, { timeout: 3_000 });

    // v2 — hookClicks 의 자동 mountSessionView → active 분기 → addexList hidden → UI 두 번째 클릭 불가.
    // 의미 ("중복 차단 — blocks 길이 1 유지") 는 addExerciseToActiveSession 직접 호출로 보존.
    const second = await page.evaluate(async () => {
      return window.gymSession.addExerciseToActiveSession('bench_press', 'chest');
    });
    expect(second.added).toBe(false);
    expect(second.reason).toBe('duplicate');
    const blocksLen = await page.evaluate(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all[0].blocks.length;
    });
    expect(blocksLen).toBe(1);
  });

  test('E. persistSetCommit → Dexie blocks[i].sets[idx] 갱신 (Wave 11.9.3)', async ({ page }) => {
    // mocks 의 좌 스와이프 commit 함수 (completeCurrentSet) 는 app.js reExecuteScripts (L87) 가
    // inline <script> 를 IIFE 로 wrap 해 외부 호출 불가. 따라서 SPA 가 노출한 persistSetCommit
    // 직접 호출로 통합 검증 (mocks hook 자체는 단위 테스트가 검증).
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);
    await page.click('#addexList [data-ex="bench_press"]');
    await page.waitForFunction(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all.length === 1 && all[0].blocks[0]?.sets?.length === 5;
    }, { timeout: 3_000 });

    const r = await page.evaluate(async () => {
      return window.gymSession.persistSetCommit({
        exerciseName: '벤치프레스',
        setIdx: 2,
        set: { weight: 65, reps: 12, done: true, pr: true },
      });
    });
    expect(r.ok).toBe(true);
    expect(r.exerciseId).toBe('bench_press');

    const sets = await page.evaluate(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all[0].blocks[0].sets;
    });
    expect(sets[2]).toEqual({ weight: 65, reps: 12, done: true, preset: false, pr: true });
    // 다른 세트는 preset:true 보존
    expect(sets[0].preset).toBe(true);
    expect(sets[1].preset).toBe(true);
    expect(sets[3].preset).toBe(true);
    expect(sets[4].preset).toBe(true);
  });

  test('H. finalizeActiveSession → status=completed + 합계 (Wave 11.9.5)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);
    await page.click('#addexList [data-ex="bench_press"]');
    await page.waitForFunction(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all.length === 1 && all[0].blocks[0]?.sets?.length === 5;
    }, { timeout: 3_000 });

    // 2 세트 commit (sets[0] 60×10 + sets[1] 65×8) + finalize
    const r = await page.evaluate(async () => {
      await window.gymSession.persistSetCommit({
        exerciseName: '벤치프레스', setIdx: 0,
        set: { weight: 60, reps: 10, done: true, pr: false },
      });
      await window.gymSession.persistSetCommit({
        exerciseName: '벤치프레스', setIdx: 1,
        set: { weight: 65, reps: 8, done: true, pr: true },
      });
      return window.gymSession.finalizeActiveSession();
    });
    expect(r.ok).toBe(true);
    expect(r.session.status).toBe('completed');
    expect(r.session.totalVolume).toBe(60 * 10 + 65 * 8); // 1120
    expect(r.session.endTime).toBeGreaterThan(0);
    expect(r.session.durationMin).toBeGreaterThanOrEqual(1);

    // Dexie 검증 — active 0건, completed 1건
    const counts = await page.evaluate(async () => {
      const all = await window.gymDB.sessions.toArray();
      return {
        total: all.length,
        active: all.filter((s) => s.status === 'active').length,
        completed: all.filter((s) => s.status === 'completed').length,
      };
    });
    expect(counts).toEqual({ total: 1, active: 0, completed: 1 });
  });

  test('I. finalizeActiveSession no_active_session — active 없음 (Wave 11.9.5)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);
    // 운동 추가 안 함 → active 없음
    const r = await page.evaluate(async () => {
      return window.gymSession.finalizeActiveSession();
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_active_session');
  });

  test('G. 이전 completed 세션 prefill (§6-3-3 ② Wave 11.9.4)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    // 이전 completed 세션 시드 — bench_press 3세트 (70/8 / 75/6 / 80/4)
    await page.evaluate(async () => {
      await window.gymDB.sessions.put({
        id: 'session_prev_seed',
        date: '2026-04-29',
        startTime: 1714330000000,
        endTime: 1714333600000,
        blocks: [{
          type: 'single',
          exerciseId: 'bench_press',
          sets: [
            { weight: 70, reps: 8, done: true, preset: false, pr: false },
            { weight: 75, reps: 6, done: true, preset: false, pr: true },
            { weight: 80, reps: 4, done: true, preset: false, pr: false },
          ],
        }],
        tags: ['chest'],
        totalVolume: 1340,
        totalCalories: 100,
        durationMin: 60,
        status: 'completed',
      });
    });

    await navigateSession(page);
    await page.click('#addexList [data-ex="bench_press"]');

    // 새 active 세션 — prefill 우선순위 ② → 이전 세션 sets (3세트, weight 70/75/80)
    await page.waitForFunction(async () => {
      const all = await window.gymDB.sessions.toArray();
      const active = all.find((s) => s.status === 'active');
      return active && active.blocks[0]?.sets?.length === 3;
    }, { timeout: 3_000 });

    const sets = await page.evaluate(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all.find((s) => s.status === 'active').blocks[0].sets;
    });
    expect(sets.length).toBe(3); // BUILTIN default 5 가 아닌 이전 세션 길이 3
    expect(sets[0]).toEqual({ weight: 70, reps: 8, done: false, preset: true, pr: false });
    expect(sets[1]).toEqual({ weight: 75, reps: 6, done: false, preset: true, pr: false });
    expect(sets[2]).toEqual({ weight: 80, reps: 4, done: false, preset: true, pr: false });
  });

  test('J. persistKeypadEdit → Dexie sets[idx] 단일 field 갱신 (Wave 11.12)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);
    await page.click('#addexList [data-ex="bench_press"]');
    await page.waitForFunction(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all.length === 1 && all[0].blocks[0]?.sets?.length === 5;
    }, { timeout: 3_000 });

    // weight=65 키패드 입력 시뮬 (mocks IIFE 우회 — SPA 어댑터 직접 호출)
    const r = await page.evaluate(async () => {
      return window.gymSession.persistKeypadEdit({
        exerciseName: '벤치프레스',
        setIdx: 0,
        field: 'weight',
        value: 65,
      });
    });
    expect(r.ok).toBe(true);
    expect(r.exerciseId).toBe('bench_press');

    const sets = await page.evaluate(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all[0].blocks[0].sets;
    });
    // sets[0]: weight 65 (갱신), reps 10 (보존), done:false / pr:false 보존, preset:false 강제
    expect(sets[0]).toEqual({ weight: 65, reps: 10, done: false, preset: false, pr: false });
    // 다른 세트는 preset:true 보존
    expect(sets[1].preset).toBe(true);
    expect(sets[2].preset).toBe(true);
  });

  test('K. dumpActiveSessionFromState → 모든 운동 sets 통째 dump (Wave 11.16)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);
    await page.click('#addexList [data-ex="bench_press"]');
    await page.waitForFunction(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all.length === 1 && all[0].blocks[0]?.sets?.length === 5;
    }, { timeout: 3_000 });

    // mocks state 시뮬 (좌 스와이프/키패드 hook 외 변경 — 빈 영역 탭 증감 가정)
    const r = await page.evaluate(async () => {
      return window.gymSession.dumpActiveSessionFromState({
        exerciseName: '벤치프레스',
        sets: [
          { weight: 70, reps: 10, done: false, preset: false, pr: false }, // 사용자 입력
          { weight: 60, reps: 10, done: false, preset: true, pr: false },
          { weight: 60, reps: 10, done: false, preset: true, pr: false },
          { weight: 60, reps: 10, done: false, preset: true, pr: false },
          { weight: 60, reps: 10, done: false, preset: true, pr: false },
        ],
        exerciseStates: {},
      });
    });
    expect(r.ok).toBe(true);
    expect(r.dumped).toBe(1);

    const sets = await page.evaluate(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all[0].blocks[0].sets;
    });
    expect(sets[0].weight).toBe(70);
    expect(sets[0].preset).toBe(false);
    expect(sets[1].preset).toBe(true);
  });

  test('F. persistSetCommit no_match — 운동 미추가 시 Dexie 변경 0 (Wave 11.9.3)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);
    await page.click('#addexList [data-ex="bench_press"]');
    await page.waitForFunction(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all.length === 1 && all[0].blocks[0]?.sets?.length === 5;
    }, { timeout: 3_000 });

    const before = await page.evaluate(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all[0].blocks[0].sets;
    });

    // 활성 세션에 없는 운동 — no_match
    const r = await page.evaluate(async () => {
      return window.gymSession.persistSetCommit({
        exerciseName: '데드리프트',
        setIdx: 0,
        set: { weight: 100, reps: 5, done: true, pr: false },
      });
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_match');
    expect(r.exerciseId).toBe('deadlift');

    const after = await page.evaluate(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all[0].blocks[0].sets;
    });
    expect(after).toEqual(before);
  });

  test('D. 다른 부위 chip 클릭 → 종목 리스트 변경', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);

    // chest 의 bench_press 가 보이는지 확인
    await expect(page.locator('#addexList [data-ex="bench_press"]')).toBeVisible();

    // legs chip 클릭
    await page.click('#addexChips [data-part="legs"]');
    await expect(page.locator('#addexChips [data-part="legs"]')).toHaveClass(/is-active/);

    // legs 의 squat 가 표시되고 bench_press 는 사라짐
    await expect(page.locator('#addexList [data-ex="squat"]')).toBeVisible({ timeout: 3_000 });
    await expect(page.locator('#addexList [data-ex="bench_press"]')).toHaveCount(0);
  });

  test('L. 빈 세션 첫 운동 추가 → empty → active 전환 + 카드 가시화', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateSession(page);

    // v2 redesign — #sessionApp[data-empty-session] / .session-placeholder 폐기.
    // body[data-state] 토글로 empty / active 분기 (mocks/session.html:49 + CSS:45-46).
    await expect(page.locator('body')).toHaveAttribute('data-state', 'empty');

    // 첫 운동 추가
    await page.click('#addexList [data-ex="bench_press"]');

    // 자동 mountSessionView → active 분기 전환
    await expect(page.locator('body')).toHaveAttribute('data-state', 'active');

    // SessionC active 카드 가시화 — #cardSwipeArea + 운동명 + 첫 세트 active
    await expect(page.locator('#cardSwipeArea')).toBeVisible();
    await expect(page.locator('#cardExName')).toHaveText('벤치프레스');
    await expect(page.locator('#cardSetProgress')).toHaveText(/SET 01/);

    // 세션 startTime 기록 (spec §6-1) — Dexie 검증
    const dexieStart = await page.evaluate(async () => {
      const all = await window.gymDB.sessions.toArray();
      return all[0]?.startTime ?? null;
    });
    expect(dexieStart).toBeTruthy();

    // 첫 세트 dot 존재 (5세트 prefill 기본) — cardSetDots 의 data-set-idx 0/1 양쪽 존재
    await expect(page.locator('#cardSetDots [data-set-idx="0"]')).toHaveCount(1);
    await expect(page.locator('#cardSetDots [data-set-idx="1"]')).toHaveCount(1);
  });

  test('L-timer. SessionHeader timer is-running 상태 (Phase B 미구현)', async () => {
    // TODO: 후속 wave 에서 spec §6-6 timer 구현 시 enable —
    // active 세션 진입 시 #sessionTime 가 is-running 클래스 보유 (또는 mm:ss 카운트 증가).
    // 옛 어설션: await expect(page.locator('#sessionTime')).toHaveClass(/is-running/);
    test.skip(true, 'Phase B timer wiring 미구현 — spec §6-6 후속 wave');
  });

  test('L-center. footer nav-item is-current 가운데 정렬 (Phase B 미구현)', async () => {
    // TODO: 후속 wave 에서 spec §6-8 footer nav center scroll 구현 시 enable —
    // 새 운동 추가 후 #sessionFooterPills 의 활성 pill 이 footer 중심 ±50px 이내.
    // 옛 어설션: .nav-item.is-current 의 getBoundingClientRect center 와 .footer-nav center 차 < 50px.
    test.skip(true, 'Phase B footer nav center scroll 미구현 — spec §6-8 후속 wave');
  });
});
