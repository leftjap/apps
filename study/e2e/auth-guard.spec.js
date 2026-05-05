/**
 * Wave 11.12 — 인증 라우트 가드 e2e 검증.
 *
 * 환경 전제:
 *   - .env.local 미설정 (CI/로컬 dev 디폴트). supabase = null, isSupabaseConfigured = false.
 *   - 따라서 OAuth 흐름 자체는 검증 불가 — 가드·error state·마커 처리만 검증.
 *
 * 검증 4건:
 *   A. 미인증 첫 진입 (/) → #/login 자동 redirect
 *   B. env 미설정 상태 Google 버튼 → ss('error') 트리거
 *   C. AUTH_ERROR_KEY 'not_allowed' 주입 후 login 진입 → error state + 마커 자동 클리어
 *   D. #/home 직접 접근 → 가드로 #/login 강제 redirect
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.12 — Auth route guard', () => {
  test('A. 미인증 첫 진입 → #/login 자동 redirect', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/#\/login$/);
    await expect(page.locator('#btnGoogle')).toBeVisible();
    await expect(page.locator('.brand')).toHaveText('Study');
  });

  test('B. env 미설정 상태 Google 버튼 → error state', async ({ page }) => {
    await page.goto('/#/login');
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'default');
    await page.click('#btnGoogle');
    // signInWithGoogle 호출 전 isSupabaseConfigured false 체크 → 즉시 ss('error')
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
    await expect(page.locator('#btnLabel')).toHaveText(/다시 시도/);
  });

  test('C. AUTH_ERROR_KEY=not_allowed 주입 후 login 진입 → error banner + 마커 클리어', async ({ page }) => {
    // page navigation 전에 localStorage 마커 set (login.html 의 checkAuthError IIFE 가 mount 시 읽음)
    await page.addInitScript(() => {
      localStorage.setItem('studyAuthError', 'not_allowed');
    });
    await page.goto('/#/login');
    await expect(page.locator('#app')).toHaveAttribute('data-state', 'error');
    // IIFE 가 set 후 removeItem 호출 → 마커 1회 소비
    const remaining = await page.evaluate(() => localStorage.getItem('studyAuthError'));
    expect(remaining).toBeNull();
  });

  test('D. #/home 직접 접근 → 가드로 #/login 강제 redirect', async ({ page }) => {
    await page.goto('/#/home');
    await page.waitForURL(/#\/login$/, { timeout: 5_000 });
    // home 컨텐츠가 잠깐도 마운트되지 않고 login UI 렌더 확인
    await expect(page.locator('#btnGoogle')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-route', 'login');
  });
});
