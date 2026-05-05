/**
 * Playwright 설정 (Wave 11.12).
 *
 * 검증 대상: 인증 라우트 가드 (e2e/auth-guard.spec.js).
 * 환경: vite preview (port 4174, vite.config.js 와 일치).
 * 전제: e2e 실행 전 `pnpm build` 가 필요 (package.json `e2e` 스크립트가 build 후 playwright test).
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // 단일 webServer 공유
  workers: 1,
  retries: 0,
  reporter: 'list',

  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    headless: true,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: 'pnpm preview',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
