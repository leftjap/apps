/**
 * Wave 11.7 — 인증 라우트 가드 e2e 검증 (Study 11.12 패턴).
 *
 * 환경 전제:
 *   - .env.local 미설정 시: supabase = null, isSupabaseConfigured = false → 가드/error state 검증.
 *   - .env.local 설정 시: 가드/error state 는 여전히 isSupabaseConfigured 분기로 동작 가능하지만
 *     B 케이스가 OAuth redirect 로 이탈할 수 있음. 이번 spec 은 디폴트 (.env.local 가능 + 미인증 세션) 가정.
 *
 * 검증 4건:
 *   A. 미인증 첫 진입 (/) → #/login 자동 redirect
 *   B. 미인증 + Supabase 없음 상태 Google 버튼 → ss('error') 트리거 (env 미설정 dev 가정)
 *   C. AUTH_ERROR_KEY 'not_allowed' 주입 후 login 진입 → error state + 마커 자동 클리어
 *   D. #/home 직접 접근 → 가드로 #/login 강제 redirect
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.7 — Auth route guard', () => {
  test('A. 미인증 첫 진입 → #/login 자동 redirect', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/#\/login$/);
    // v2 redesign — #btnGoogle → #googleSignInBtn (mocks/login.html:63)
    await expect(page.locator('#googleSignInBtn')).toBeVisible();
    // v2 redesign — .brand 클래스 폐기. Gym 헤드라인 텍스트 직접 검증 (mocks/login.html:56)
    await expect(page.getByText('Gym', { exact: true }).first()).toBeVisible();
  });

  test('B. env 미설정 상태 Google 버튼 → error state', async ({ page }) => {
    // env 가 설정된 빌드면 OAuth redirect 가 일어날 수 있음 → window.gymAuth.isSupabaseConfigured 로 분기 확인
    await page.goto('/#/login');
    // v2 redesign — #app[data-state] 토글 폐기. 초기 #loginError 미표시 (display:none)
    await expect(page.locator('#loginError')).toBeHidden();
    const configured = await page.evaluate(() => window.gymAuth?.isSupabaseConfigured ?? false);
    test.skip(configured, 'Supabase env 설정됨 → 이 테스트는 미설정 dev 환경 전용');
    await page.click('#googleSignInBtn');
    // signInWithGoogle 호출 전 isSupabaseConfigured false 체크 → showErr (loginError 표시 + 텍스트)
    await expect(page.locator('#loginError')).toBeVisible();
    await expect(page.locator('#loginError')).toHaveText(/Supabase 미구성/);
  });

  test('C. AUTH_ERROR_KEY=not_allowed 주입 후 login 진입 → error banner + 마커 클리어', async ({ page }) => {
    // page navigation 전에 localStorage 마커 set (login.html 의 checkAuthError IIFE 가 mount 시 읽음)
    await page.addInitScript(() => {
      localStorage.setItem('gymAuthError', 'not_allowed');
    });
    await page.goto('/#/login');
    // v2 redesign — #app[data-state] 토글 폐기. #loginError 가시성 + 텍스트로 검증 (mocks/login.html:91)
    await expect(page.locator('#loginError')).toBeVisible();
    await expect(page.locator('#loginError')).toHaveText(/허용되지 않은 계정/);
    // IIFE 가 set 후 removeItem 호출 → 마커 1회 소비
    const remaining = await page.evaluate(() => localStorage.getItem('gymAuthError'));
    expect(remaining).toBeNull();
  });

  test('D. #/home 직접 접근 → 가드로 #/login 강제 redirect', async ({ page }) => {
    await page.goto('/#/home');
    await page.waitForURL(/#\/login$/, { timeout: 5_000 });
    // home 컨텐츠가 잠깐도 마운트되지 않고 login UI 렌더 확인 (v2 — #googleSignInBtn)
    await expect(page.locator('#googleSignInBtn')).toBeVisible();
    await expect(page.locator('body')).toHaveAttribute('data-route', 'login');
  });
});
