/**
 * iOS WebKit race fix 실 엔진 검증 — Playwright WebKit (iOS Safari 와 동일 코어).
 *
 * 검증 대상: today/src/main.js 의 subscribe-first bootstrap.
 *
 * 시나리오:
 *   A. 세션 없는 상태 → INITIAL_SESSION + null → showLogin (data-auth-state="out")
 *   B. localStorage 에 fake session 주입 → 새로 로드 → INITIAL_SESSION + session 으로 인증 진입
 *   C. navigator.storage.persist() 실 호출 + grant 결과 확인
 *
 * 기존 chromium-only e2e 와 격리 — `--browser webkit` 으로만 실행 (자체 파일명 .webkit.spec).
 */
import { test, expect } from '@playwright/test';

const STORAGE_KEY = 'sb-tcbooffrdacfatywdzcm-auth-token';
const ALLOWED_USER = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'leftjap@gmail.com',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'google' },
  user_metadata: {},
};

function fakeSession() {
  // expires_at = 10년 후 → supabase-js 가 refresh 시도 안 함 → INITIAL_SESSION 그대로 발화.
  const future = Math.floor(Date.now() / 1000) + 10 * 365 * 24 * 60 * 60;
  return {
    access_token: 'fake-access-token-not-validated-clientside',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: future,
    refresh_token: 'fake-refresh-token',
    user: ALLOWED_USER,
  };
}

test.describe('iOS WebKit bootstrap race fix (실 엔진)', () => {
  test('A — 세션 없음: INITIAL_SESSION + null → showLogin', async ({ page }) => {
    const consoleLogs = [];
    page.on('console', (m) => consoleLogs.push(`${m.type()}: ${m.text()}`));

    await page.goto('/');
    await page.waitForSelector('#today-login-card', { timeout: 10_000 });

    await expect(page.locator('body')).toHaveAttribute('data-auth-state', 'out');

    // persist() 실 호출 + 결과 로그 확인
    const persistLog = consoleLogs.find((l) => l.includes('storage.persist() granted'));
    expect(persistLog, '[main] storage.persist() granted: ... 로그가 있어야 함').toBeDefined();
  });

  test('B — fake session 주입: INITIAL_SESSION + session → 인증 진입 (login flicker 없음)', async ({ page }) => {
    // 1) 첫 진입으로 origin 확보 (localStorage 접근 위해)
    await page.goto('/');
    await page.waitForSelector('#today-login-card', { timeout: 10_000 });

    // 2) localStorage 에 fake session 주입
    await page.evaluate(
      ({ key, session }) => {
        localStorage.setItem(key, JSON.stringify(session));
      },
      { key: STORAGE_KEY, session: fakeSession() },
    );

    // 3) reload — 새 bootstrap 이 INITIAL_SESSION 으로 session 받음
    const consoleLogs = [];
    page.on('console', (m) => consoleLogs.push(`${m.type()}: ${m.text()}`));
    await page.reload();

    // 4) 인증 마커 확인 — body[data-auth-state]='in'
    await expect(page.locator('body')).toHaveAttribute('data-auth-state', 'in', { timeout: 10_000 });

    // 5) 로그인 카드는 더 이상 보이면 안 됨
    await expect(page.locator('#today-login-card')).toBeHidden();
  });

  test('C — navigator.storage.persist() WebKit 실 호출·grant 값 노출', async ({ page }) => {
    const grantedValues = [];
    page.on('console', (m) => {
      const t = m.text();
      const match = t.match(/storage\.persist\(\) granted: (true|false)/);
      if (match) grantedValues.push(match[1]);
    });

    await page.goto('/');
    await page.waitForSelector('#today-login-card', { timeout: 10_000 });

    expect(grantedValues.length, 'persist() 결과가 한 번 로그됨').toBeGreaterThan(0);
    // 값 자체는 true/false 둘 다 가능 (heuristic). 호출 자체가 동작하는지가 핵심.
    expect(['true', 'false']).toContain(grantedValues[0]);
  });
});
