/**
 * Wave 11.26 — SPA 모드 세션 흐름 통합 e2e.
 *
 * 검증 범위 (mocks 모드 검증 보완 — Wave 11.25 까지 mocks IIFE 만 preview MCP 검증):
 *  - SPA 라우터 #/session?mode=combined → setupByMode (Dexie reviewQueue 13건 → dueToday 필터)
 *  - reveal click → answer stage 진입 + autoTTS 자동 호출 (spec §8-2-1)
 *  - judge 'got' click → reviewIdx 증가 (다음 카드 진입)
 *  - btnEnd → endModal → endConfirm → #/summary 진입
 *
 * 인증 우회: data-display.spec.js 와 동일 (env 빈 + fakeUser ensureUserDB)
 *
 * autoTTS 검증 패턴:
 *  - speech.js backend='auto' 시 speakAzure 시도 → SDK init 실패 (env 빈) → speakWeb 폴백 → window.speechSynthesis.speak
 *  - window.studySpeech.speak 자체를 monkey-patch 해 호출 카운트 spy
 *  - reveal 후 setTimeout 300ms btnListen click → togglePlay → studySpeech.speak 호출
 */
import { test, expect } from '@playwright/test';

const FAKE_USER = {
  id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  email: 'test@example.com',
};

async function bootstrapFakeUserAndSpy(page) {
  await page.goto('/');
  await page.evaluate(async (user) => {
    await window.studyAuth.ensureUserDB(user);
  }, FAKE_USER);
  // studySpeech.speak spy — 페이지 로드 후 한 번 설치 (초기화는 main.js IIFE 동기 완료 보장)
  await page.evaluate(() => {
    if (!window.studySpeech?.speak) return;
    window.__speakCalls = [];
    const orig = window.studySpeech.speak.bind(window.studySpeech);
    window.studySpeech.speak = (text, opts) => {
      window.__speakCalls.push({ text, lang: opts?.lang });
      return orig(text, opts);
    };
  });
}

test.describe('Wave 11.26 — SPA session flow', () => {
  test('A. combined 모드 진입 → 첫 카드 prompt 렌더 (#btnReveal)', async ({ page }) => {
    await bootstrapFakeUserAndSpy(page);
    await page.goto('/#/session?mode=combined');
    // setupByMode → dueToday → reviewCards.length ≥1 → renderReviewCard prompt stage
    await expect(page.locator('#btnReveal')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('#counter')).toContainText(/복습/);
    // sentMain 은 prompt stage 에선 빈 상태. answer stage 후 채워짐
    const route = await page.evaluate(() => document.body.dataset.route);
    expect(route).toBe('session');
  });

  test('B. reveal click → answer stage + judge 버튼 + sentMain 채워짐', async ({ page }) => {
    await bootstrapFakeUserAndSpy(page);
    await page.goto('/#/session?mode=combined');
    await page.locator('#btnReveal').click();
    // answer stage — sentMain 에 영문 문장 + judge 버튼 3종
    await expect(page.locator('#sentMain')).toBeVisible();
    const sentText = (await page.locator('#sentMain').textContent()) || '';
    expect(sentText.trim().length).toBeGreaterThan(0);
    await expect(page.locator('.judge-no')).toBeVisible();
    await expect(page.locator('.judge-hmm')).toBeVisible();
    await expect(page.locator('.judge-got')).toBeVisible();
  });

  test('C. autoTTS — reveal 후 studySpeech.speak 자동 호출 (spec §8-2-1)', async ({ page }) => {
    await bootstrapFakeUserAndSpy(page);
    // Wave 11.34 — autoTTS default=false 로 변경. settings 명시 set 후 session 진입.
    await page.evaluate(async () => {
      await window.studyDB.meta.put({ key: 'studySettings', value: { autoTTS: true } });
    });
    await page.goto('/#/session?mode=combined');
    // 진입 직후 spy 가 사라졌을 수 있음 (라우트 변경 시 SPA 가 mounting 다시) → 재설치
    await page.evaluate(() => {
      if (!window.studySpeech?.speak) return;
      window.__speakCalls = [];
      const orig = window.studySpeech.speak.bind(window.studySpeech);
      window.studySpeech.speak = (text, opts) => {
        window.__speakCalls.push({ text, lang: opts?.lang });
        return orig(text, opts);
      };
    });
    await page.locator('#btnReveal').click();
    // reveal() 끝의 setTimeout 300ms 후 btnListen click → togglePlay → studySpeech.speak
    await page.waitForFunction(
      () => Array.isArray(window.__speakCalls) && window.__speakCalls.length > 0,
      null,
      { timeout: 2_000 },
    );
    const calls = await page.evaluate(() => window.__speakCalls);
    expect(calls.length).toBeGreaterThan(0);
    expect(calls[0].lang).toBe('en-US');
    expect(typeof calls[0].text).toBe('string');
    expect(calls[0].text.length).toBeGreaterThan(0);
  });

  test('D. judge "got" click → reviewIdx 증가 (다음 카드 진입)', async ({ page }) => {
    await bootstrapFakeUserAndSpy(page);
    await page.goto('/#/session?mode=combined');
    await page.locator('#btnReveal').click();
    const firstSent = (await page.locator('#sentMain').textContent()) || '';
    await page.locator('.judge-got').click();
    // judge() 끝 setTimeout 400ms nextReview → renderHeader/Stage. 다음 카드 prompt stage 진입.
    // counter 의 reviewIdx 증가 또는 phase 전환 (interstitial/finish) 검증
    await page.waitForTimeout(700); // 400ms nextReview + 안전 마진
    const counter = (await page.locator('#counter').textContent()) || '';
    // 정상 진행 시: 1) 다음 review prompt (#btnReveal 다시 visible), 2) interstitial (interGo 버튼), 3) summary 라우트
    const btnReveal = await page.locator('#btnReveal').count();
    const interGo = await page.locator('#interGo').count();
    const route = await page.evaluate(() => window.location.hash);
    const advanced = btnReveal > 0 || interGo > 0 || route.startsWith('#/summary');
    expect(advanced).toBe(true);
    // reviewIdx 증가: 첫 카드와 다른 sentMain (다음 review prompt 면 sentMain 빈 상태)
    if (btnReveal > 0) {
      // prompt 단계로 전환 — counter 가 "복습 2 / N" 또는 같은 인덱스의 다음 카드
      expect(counter).toMatch(/복습/);
    }
  });

  test('E. btnEnd → endModal → endConfirm → #/summary 진입', async ({ page }) => {
    await bootstrapFakeUserAndSpy(page);
    await page.goto('/#/session?mode=combined');
    await page.locator('#btnEnd').click();
    await expect(page.locator('#endModal')).toBeVisible();
    await page.locator('#endConfirm').click();
    await page.waitForURL(/#\/summary/, { timeout: 3_000 });
    await expect(page).toHaveURL(/#\/summary/);
  });

  test('F. Wave 11.34 — stats 문장 클릭 → session 진입 (홈 redirect 회귀 방지)', async ({ page }) => {
    // 회귀 시나리오: stats.html 의 goReview 가 template literal 백틱 사용 → app.js rewriteMockLinks 미매칭 →
    //   path 직접 변경 (session.html?...) → SPA hash 비어 home 라우팅 → 사용자 보고 정확
    // 본 테스트는 hash 라우팅 정상 (URL 에 #/session 포함) 검증
    await bootstrapFakeUserAndSpy(page);
    await page.goto('/#/stats');
    await expect(page.locator('#tab-cal')).toBeVisible({ timeout: 5_000 });
    // 문장 목록 탭 → 첫 sentence 클릭
    await page.locator('#tab-sent').click();
    await page.waitForTimeout(400);
    const firstSent = page.locator('.sl-item').first();
    await expect(firstSent).toBeVisible({ timeout: 3_000 });
    await firstSent.click();
    // hash 라우팅 정상 — URL 에 #/session 포함, body data-route='session'
    // mount() 는 hashchange 후 비동기 — dataset.route 변경까지 대기
    await page.waitForURL(/#\/session/, { timeout: 3_000 });
    await page.waitForFunction(() => document.body.dataset.route === 'session', null, { timeout: 3_000 });
    const route = await page.evaluate(() => document.body.dataset.route);
    expect(route).toBe('session');
  });

  test('G. Wave 11.34 — autoTTS default off (settings 미설정 시 reveal 후 speak 자동 호출 안 됨)', async ({ page }) => {
    // 회귀 시나리오: state.autoTTS default=false 변경했으나 사용자 db 의 studySettings.autoTTS=true 잔여 시 자동 재생.
    // 본 테스트는 db 미설정 시 default off 동작 검증.
    await bootstrapFakeUserAndSpy(page);
    // settings 명시 삭제 — db 미설정 상태
    await page.evaluate(async () => {
      await window.studyDB.meta.delete('studySettings');
    });
    await page.goto('/#/session?mode=combined');
    await page.evaluate(() => {
      window.__speakCalls = [];
      const orig = window.studySpeech.speak.bind(window.studySpeech);
      window.studySpeech.speak = (text, opts) => {
        window.__speakCalls.push({ text, lang: opts?.lang });
        return orig(text, opts);
      };
    });
    await page.locator('#btnReveal').click();
    await page.waitForTimeout(600); // reveal() 의 setTimeout 300ms + 여유
    const calls = await page.evaluate(() => window.__speakCalls);
    expect(calls.length).toBe(0);
  });
});
