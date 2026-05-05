/**
 * Wave 11.27 — PWA 인프라 회귀 방지 e2e.
 *
 * 검증 4건 (모두 vite preview 4174 기반, 인증 우회 불필요):
 *   A. /manifest.webmanifest 200 + JSON valid + 필수 필드 (name/start_url/scope/display/icons/id)
 *   B. /sw.js 200 + workbox 참조 + precache 등록 + navigator.serviceWorker 등록 발화
 *   C. icon 4종 (180/192/512/512-maskable) 200 + Content-Type image/png
 *   D. index.html meta 정합 (apple-mobile-web-app-capable / theme-color / manifest link / apple-touch-icon)
 *
 * 본 검증의 가치: PWA 인프라 (manifest/SW/icons/meta) 가 Wave 11.20+ 의 동적 today 변경,
 *   Wave 11.22 의 azure-sdk 청크 분리, Wave 11.26 의 env 자동화 등 후속 변경에 영향받지 않음을 매 e2e 마다 자동 보증.
 *   회귀 시 결정적 실패로 즉시 검출.
 */
import { test, expect } from '@playwright/test';

test.describe('Wave 11.27 — PWA infrastructure', () => {
  test('A. /manifest.webmanifest 200 + JSON valid + 필수 필드', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const ct = res.headers()['content-type'] || '';
    // vite preview 가 .webmanifest 를 application/manifest+json 또는 application/json 등으로 서빙
    expect(ct).toMatch(/manifest\+json|json/);
    const json = await res.json();
    expect(json.name).toBe('Study');
    expect(json.short_name).toBe('Study');
    expect(json.start_url).toBe('/');
    expect(json.scope).toBe('/');
    expect(json.display).toBe('standalone');
    expect(json.id).toBe('/');
    expect(Array.isArray(json.icons)).toBe(true);
    expect(json.icons.length).toBeGreaterThanOrEqual(3);
    // 192 + 512 사이즈 필수 (Chrome PWA install 조건)
    const sizes = json.icons.map((i) => i.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    // maskable purpose 1건 이상 (Android 적응형 아이콘)
    const hasMaskable = json.icons.some((i) => /maskable/.test(i.purpose || ''));
    expect(hasMaskable).toBe(true);
  });

  test('B. /sw.js 200 + workbox 참조 + navigator.serviceWorker 등록 발화', async ({ page, request }) => {
    const swRes = await request.get('/sw.js');
    expect(swRes.status()).toBe(200);
    const swBody = await swRes.text();
    expect(swBody).toMatch(/workbox/i);
    expect(swBody).toMatch(/precacheAndRoute|skipWaiting/);
    // 페이지 로드 후 navigator.serviceWorker 등록 확인 (registerSW.js 가 load 이벤트로 등록)
    await page.goto('/');
    await page.waitForFunction(
      () => navigator.serviceWorker?.ready,
      null,
      { timeout: 5_000 },
    );
    const reg = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return { hasActive: !!r.active, scope: r.scope };
    });
    expect(reg.hasActive).toBe(true);
    expect(reg.scope).toMatch(/\/$/);
  });

  test('C. icon 4종 (180/192/512/512-maskable) 200 + image/png', async ({ request }) => {
    const icons = ['icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-512-maskable.png'];
    for (const icon of icons) {
      const res = await request.get(`/icons/${icon}`);
      expect(res.status(), `${icon} status`).toBe(200);
      const ct = res.headers()['content-type'] || '';
      expect(ct, `${icon} content-type`).toMatch(/image\/png/);
      const body = await res.body();
      // PNG signature: 89 50 4E 47 0D 0A 1A 0A
      expect(body[0]).toBe(0x89);
      expect(body[1]).toBe(0x50);
      expect(body[2]).toBe(0x4e);
      expect(body[3]).toBe(0x47);
    }
  });

  test('D. index.html meta 정합 (PWA 필수)', async ({ request }) => {
    const res = await request.get('/');
    expect(res.status()).toBe(200);
    const html = await res.text();
    // PWA 필수 meta·link 8건
    expect(html).toMatch(/<link[^>]+rel=["']manifest["'][^>]+href=["']\/manifest\.webmanifest["']/);
    expect(html).toMatch(/<meta[^>]+name=["']theme-color["'][^>]+content=["']#faf9f5["']/);
    expect(html).toMatch(/<meta[^>]+name=["']mobile-web-app-capable["'][^>]+content=["']yes["']/);
    expect(html).toMatch(/<meta[^>]+name=["']apple-mobile-web-app-capable["'][^>]+content=["']yes["']/);
    expect(html).toMatch(/<meta[^>]+name=["']apple-mobile-web-app-title["'][^>]+content=["']Study["']/);
    expect(html).toMatch(/<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']\/icons\/icon-180\.png["']/);
    // viewport-fit=cover (iOS safe area 대응)
    expect(html).toMatch(/viewport-fit=cover/);
    // SW 등록 스크립트 (vite-plugin-pwa autoInject)
    expect(html).toMatch(/registerSW\.js/);
  });
});
