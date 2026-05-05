/**
 * Wave 11.4 — Auth 라우트 가드 e2e
 *
 * 검증:
 *   - 비로그인 진입 시 #today-login-card 노출, mocks (.sb__item) 미노출
 *   - Supabase 설정 (env 활성) 시 로그인 버튼 활성화
 *   - 비로그인 카테고리 라우트 직접 진입 시 #/login 으로 redirect
 *   - body[data-auth-state] 마커 존재
 *
 * 비대상 (실 OAuth 통과·SIGNED_IN 흐름):
 *   - Google OAuth 통과 — 사용자 환경 의존 (수동)
 *   - profile insert — supabase 모킹 별 wave
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.4 auth guard', () => {
  test('비로그인 진입 → 로그인 카드 노출, 카테고리 sidebar 미노출', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
    });

    await page.goto('/');
    await page.waitForSelector('#today-login-card', { timeout: 5_000 });

    // 카테고리 sidebar 는 안 보임
    await expect(page.locator('#today-mocks-host .sb__item').first()).toBeHidden();

    // body 마커
    await expect(page.locator('body')).toHaveAttribute('data-auth-state', 'out');

    expect(errors).toEqual([]);
  });

  test('비로그인 시 #/navi 직접 진입 → #/login 으로 redirect', async ({ page }) => {
    await page.goto('/#/navi');
    await page.waitForSelector('#today-login-card', { timeout: 5_000 });
    await expect(page).toHaveURL(/#\/login$/);
  });

  test('Supabase 환경 설정 시 로그인 버튼 활성', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card', { timeout: 5_000 });

    const btn = page.locator('#today-login-card [data-role="signin"]');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test('window.todayAuth 가 노출되어 mocks IIFE 가 접근 가능', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card', { timeout: 5_000 });
    const exposed = await page.evaluate(() => typeof window.todayAuth);
    expect(exposed).toBe('object');
  });

  test('isAllowedEmail 검증 함수가 클라이언트에 노출', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#today-login-card');
    const result = await page.evaluate(() => ({
      ok: window.todayAuth.isAllowedEmail('LeftJap@Gmail.com'),
      bad: window.todayAuth.isAllowedEmail('attacker@example.com'),
    }));
    expect(result.ok).toBe(true);
    expect(result.bad).toBe(false);
  });
});
