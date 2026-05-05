import { test, expect } from '@playwright/test';

/**
 * Wave 11.2 smoke — Wave 11.4 이후 비인증 진입점 검증으로 의미 축소.
 *
 * 카테고리 라우트 마운트 검증은 auth-guard.spec.js 가 책임 이전 받음
 * (가드 적용으로 비인증 시 mocks 카테고리 sidebar 미노출).
 */

test.describe('Wave 11.2 smoke — static assets', () => {
  test('manifest.webmanifest serves 200', async ({ page }) => {
    const res = await page.goto('/manifest.webmanifest');
    expect(res?.status()).toBe(200);
  });

  test('icons serve 200', async ({ page }) => {
    for (const f of [
      'icon-180.png',
      'icon-192.png',
      'icon-512.png',
      'icon-512-maskable.png',
    ]) {
      const res = await page.goto(`/icons/${f}`);
      expect(res?.status(), `${f}`).toBe(200);
    }
  });

  test('manifest content — iOS PWA 요건 + 4 icon 사이즈', async ({ request }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.name).toBe('Today');
    expect(m.display).toBe('standalone');
    expect(m.scope).toBe('/');
    expect(m.start_url).toBe('/');
    expect(m.lang).toBe('ko');
    expect(m.theme_color).toBeTruthy();
    expect(m.background_color).toBeTruthy();
    // icons 4 사이즈 (180 / 192 / 512 / 512-maskable)
    const sizes = m.icons?.map((i) => i.sizes) || [];
    expect(sizes).toContain('180x180');
    expect(sizes).toContain('192x192');
    expect(sizes.filter((s) => s === '512x512').length).toBe(2); // any + maskable
    // maskable purpose
    const maskable = m.icons?.find((i) => i.purpose === 'maskable');
    expect(maskable?.sizes).toBe('512x512');
  });

  test('index.html — iOS PWA meta tags', async ({ request }) => {
    const res = await request.get('/');
    expect(res.ok()).toBe(true);
    const html = await res.text();
    // viewport-fit=cover + initial-scale=1.0
    expect(html).toMatch(/viewport-fit=cover/);
    expect(html).toMatch(/initial-scale=1/);
    // 표준 mobile-web-app-capable + Safari legacy apple-mobile-web-app-capable
    expect(html).toMatch(/<meta[^>]*name="mobile-web-app-capable"[^>]*content="yes"/);
    expect(html).toMatch(/<meta[^>]*name="apple-mobile-web-app-capable"[^>]*content="yes"/);
    expect(html).toMatch(/<meta[^>]*name="apple-mobile-web-app-title"[^>]*content="Today"/);
    expect(html).toMatch(/<meta[^>]*name="theme-color"/);
    // apple-touch-icon (180) link
    expect(html).toMatch(/apple-touch-icon[^>]*icon-180\.png/);
    // manifest link
    expect(html).toMatch(/<link[^>]*rel="manifest"[^>]*href="\/manifest\.webmanifest"/);
  });
});
