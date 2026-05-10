/**
 * Wave 11.10.1 — 홈 진행 중 세션 카드 e2e (spec §5-5).
 *
 * 환경: vite preview (4173) + fakeUser ensureUserDB 패턴 답습.
 *
 * 검증:
 *   A. active 없음 → 홈 default state ('active' = 마지막 운동) 그대로.
 *   B. active 있음 → mountHomeView 가 'session' state 로 덮어쓰기. #sLabel='진행 중' 등.
 *   C. CTA '이어가기' 클릭 → #/session 이동.
 */
import { test, expect } from '@playwright/test';

const FAKE_USER = { id: 'aaaa1010-1010-1010-1010-aaaa10101010', email: 'home-active@e2e.test' };

async function bootstrapFake(page) {
  await page.goto('/');
  await page.evaluate(async (user) => {
    if (!window.gymAuth) return;
    await window.gymAuth.ensureUserDB(user);
  }, FAKE_USER);
  await page.evaluate(async () => {
    if (!window.gymQueries || !window.gymDB) return;
    const all = await window.gymDB.sessions.toArray();
    for (const s of all) await window.gymDB.sessions.delete(s.id);
    await window.gymQueries.upsertUserSettings({
      hiddenExercises: [], exerciseOrder: {}, exercisePartOverride: {},
    });
  });
}

async function navigateHome(page) {
  await page.evaluate(() => { window.location.hash = '#/home'; });
  await page.waitForFunction(() => document.body.dataset.route === 'home', { timeout: 5_000 });
}

test.describe('Wave 11.10.1 — home active session card', () => {
  test('A. active 없음 + sessions 0 → empty state (Wave 11.10.3)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateHome(page);
    // mountHomeView 가 streak 처리 → empty state
    await page.waitForFunction(
      () => document.getElementById('app')?.dataset.state === 'empty',
      { timeout: 3_000 },
    );
    const v = await page.evaluate(() => ({
      label: document.getElementById('sLabel').textContent,
      num: document.getElementById('sNum').textContent,
      unit: document.getElementById('sUnit').textContent,
      sub: document.getElementById('sSub').textContent,
      subUnit: document.getElementById('sSubUnit').textContent,
      cta: document.getElementById('ctaBtn').textContent,
      appState: document.getElementById('app').dataset.state,
    }));
    expect(v).toEqual({
      label: '마지막 운동',
      num: '—',
      unit: '',
      sub: '0',
      subUnit: '/4회',
      cta: '첫 운동 시작',
      appState: 'empty',
    });
  });

  test('F. completed sessions 시드 → streak active state (Wave 11.10.3)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    // 어제 (1일 전) chest 시드 — 1~2일 → active state
    await page.evaluate(async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const iso = (d) => {
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };
      await window.gymDB.sessions.put({
        id: 'session_streak_chest',
        date: iso(yesterday),
        startTime: 0, endTime: 0,
        blocks: [], tags: ['chest', 'arms'],
        totalVolume: 600, totalCalories: 100, durationMin: 60,
        status: 'completed',
      });
    });

    await navigateHome(page);
    await page.waitForFunction(
      () => document.getElementById('app')?.dataset.state === 'active',
      { timeout: 3_000 },
    );
    const v = await page.evaluate(() => ({
      label: document.getElementById('sLabel').textContent,
      num: document.getElementById('sNum').textContent,
      unit: document.getElementById('sUnit').textContent,
      part: document.getElementById('sPart').textContent,
      sub: document.getElementById('sSub').textContent,
      subUnit: document.getElementById('sSubUnit').textContent,
      cta: document.getElementById('ctaBtn').textContent,
      appState: document.getElementById('app').dataset.state,
    }));
    expect(v.label).toBe('마지막 운동');
    expect(v.num).toBe('1');
    expect(v.unit).toBe('일 전');
    expect(v.part).toBe('가슴 · 팔');
    expect(v.sub).toMatch(/^\d+$/);
    expect(v.subUnit).toMatch(/^\/\d+회$/);
    expect(v.cta).toBe('운동 시작');
    expect(v.appState).toBe('active');
  });

  test('G. 5일+ 공백 → rest state (Wave 11.10.3)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await page.evaluate(async () => {
      const now = new Date();
      const longAgo = new Date(now);
      longAgo.setDate(now.getDate() - 7); // 7일 전
      const iso = (d) => {
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };
      await window.gymDB.sessions.put({
        id: 'session_streak_old',
        date: iso(longAgo),
        startTime: 0, endTime: 0,
        blocks: [], tags: ['legs'],
        totalVolume: 600, totalCalories: 100, durationMin: 60,
        status: 'completed',
      });
    });

    await navigateHome(page);
    await page.waitForFunction(
      () => document.getElementById('app')?.dataset.state === 'rest',
      { timeout: 3_000 },
    );
    const v = await page.evaluate(() => ({
      num: document.getElementById('sNum').textContent,
      appState: document.getElementById('app').dataset.state,
    }));
    expect(v.num).toBe('7');
    expect(v.appState).toBe('rest');
  });

  test('B. active 시드 → "진행 중" + 1/1 종목 + state="session"', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    // active 세션 직접 시드 — bench_press 1세트 모두 done
    const seedTime = Date.now() - 30 * 60 * 1000; // 30분 전
    await page.evaluate(async (startTime) => {
      await window.gymDB.sessions.put({
        id: 'session_active_seed',
        date: '2026-04-30',
        startTime,
        endTime: null,
        blocks: [{
          type: 'single',
          exerciseId: 'bench_press',
          sets: [{ weight: 60, reps: 10, done: true, preset: false, pr: false }],
        }],
        tags: ['chest'],
        totalVolume: 0,
        totalCalories: 0,
        durationMin: 0,
        status: 'active',
      });
    }, seedTime);

    await navigateHome(page);

    // mountHomeView 비동기 — DOM 갱신 대기
    await page.waitForFunction(() => {
      return document.getElementById('sLabel')?.textContent === '진행 중';
    }, { timeout: 3_000 });

    const v = await page.evaluate(() => ({
      label: document.getElementById('sLabel').textContent,
      unit: document.getElementById('sUnit').textContent,
      part: document.getElementById('sPart').textContent,
      sub: document.getElementById('sSub').textContent,
      cta: document.getElementById('ctaBtn').textContent,
      appState: document.getElementById('app').dataset.state,
      numFontSize: document.getElementById('sNum').style.fontSize,
    }));
    expect(v.label).toBe('진행 중');
    expect(v.unit).toBe('경과');
    expect(v.part).toBe('가슴');
    expect(v.sub).toBe('1 / 1 종목');
    expect(v.cta).toBe('이어가기');
    expect(v.appState).toBe('session');
    expect(v.numFontSize).toBe('40px');

    // num 형식 mm:ss (앞자리 0 padded)
    const num = await page.evaluate(() => document.getElementById('sNum').textContent);
    expect(num).toMatch(/^\d{2,}:\d{2}$/);
  });

  test('D. 주간 캘린더 SPA hijack — 7 cell + today 1건 (Wave 11.10.2)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateHome(page);

    // SPA hijack 완료 대기 — cal-day 가 spa-managed 클래스 가짐
    await page.waitForFunction(
      () => document.querySelectorAll('#weekCal .cal-day.spa-managed').length === 7,
      { timeout: 3_000 },
    );

    const stats = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll('#weekCal .cal-day'));
      const today = cells.find((c) => c.classList.contains('today'));
      return {
        count: cells.length,
        todayCount: cells.filter((c) => c.classList.contains('today')).length,
        todayIso: today?.dataset.iso,
        labels: cells.map((c) => c.querySelector('.cal-label').textContent),
      };
    });
    expect(stats.count).toBe(7);
    expect(stats.todayCount).toBe(1);
    expect(stats.labels).toEqual(['월','화','수','목','금','토','일']);
    // 오늘 ISO 가 today 클래스 cell 의 data-iso 와 매칭 (테스트 환경 기준)
    expect(stats.todayIso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('E. 주간 캘린더 — Dexie sessions 부위 약어 표시 (Wave 11.10.2)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    // 테스트 환경의 today ISO 계산 후 같은 주 chest 시드
    const seeded = await page.evaluate(async () => {
      const now = new Date();
      const day = (now.getDay() + 6) % 7; // 월=0
      const monday = new Date(now);
      monday.setDate(now.getDate() - day);
      const iso = (d) => {
        const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${dd}`;
      };
      const chestDate = iso(monday); // 월요일
      await window.gymDB.sessions.put({
        id: 'session_week_chest',
        date: chestDate,
        startTime: 0, endTime: 0,
        blocks: [{ type: 'single', exerciseId: 'bench_press', sets: [
          { weight: 60, reps: 10, done: true, preset: false, pr: false },
        ]}],
        tags: ['chest'],
        totalVolume: 600, totalCalories: 100, durationMin: 60,
        status: 'completed',
      });
      return { chestDate };
    });

    await navigateHome(page);
    await page.waitForFunction(
      () => document.querySelectorAll('#weekCal .cal-day.worked').length >= 1,
      { timeout: 3_000 },
    );

    const result = await page.evaluate((target) => {
      const cells = Array.from(document.querySelectorAll('#weekCal .cal-day'));
      const c = cells.find((el) => el.dataset.iso === target);
      return c ? {
        worked: c.classList.contains('worked'),
        part: c.querySelector('.cal-part').textContent.trim(),
      } : null;
    }, seeded.chestDate);
    expect(result).not.toBeNull();
    expect(result.worked).toBe(true);
    expect(result.part).toBe('가');
  });

  test('H. empty state CTA "첫 운동 시작" 클릭 → #/session (Wave 11.10.4)', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await navigateHome(page);
    await page.waitForFunction(
      () => document.getElementById('ctaBtn')?.textContent === '첫 운동 시작',
      { timeout: 3_000 },
    );
    await page.click('#ctaBtn');
    await page.waitForFunction(
      () => document.body.dataset.route === 'session',
      { timeout: 3_000 },
    );
    expect(await page.evaluate(() => window.location.hash)).toBe('#/session');
  });

  test('C. CTA "이어가기" 클릭 → #/session 이동', async ({ page }) => {
    await bootstrapFake(page);
    const dbReady = await page.evaluate(() => !!window.gymDB);
    test.skip(!dbReady, 'fake bootstrap 환경 외');

    await page.evaluate(async () => {
      await window.gymDB.sessions.put({
        id: 'session_active_seed_c',
        date: '2026-04-30',
        startTime: Date.now() - 60_000,
        endTime: null,
        blocks: [],
        tags: [],
        totalVolume: 0, totalCalories: 0, durationMin: 0,
        status: 'active',
      });
    });

    await navigateHome(page);
    await page.waitForFunction(
      () => document.getElementById('ctaBtn')?.textContent === '이어가기',
      { timeout: 3_000 },
    );

    await page.click('#ctaBtn');
    await page.waitForFunction(
      () => document.body.dataset.route === 'session',
      { timeout: 3_000 },
    );
    expect(await page.evaluate(() => window.location.hash)).toBe('#/session');
  });
});
