import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages: leftjap.github.io/apps/book/ 서브경로 배포 (workflow 가 GH_PAGES=1 주입).
// 로컬 dev/preview 는 GH_PAGES 미설정 → / (기본 동작 유지).
const BASE = process.env.GH_PAGES ? '/apps/book/' : '/';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: BASE,
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/design-ref/**'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    // 5176 strictPort — geo-apps OAuth 클라이언트 redirect URI 가 5176 한정.
    // 다른 포트로 fallback 시 redirect_uri_mismatch 발생 (today 5175 교훈).
    port: 5176,
    strictPort: true,
    host: '0.0.0.0',
  },
  preview: {
    port: 4176,
    strictPort: true,
    host: '0.0.0.0',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: false,
      },
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'book',
        short_name: 'book',
        description: '부부 공용 어구록 — 책에서 옮긴 문장과 댓글',
        lang: 'ko',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: BASE,
        scope: BASE,
        icons: [
          { src: 'icons/book-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'icons/book-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${BASE}index.html`,
        // 새 빌드 SW 즉시 활성화 (today Wave 11.10 패턴).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pages',
              networkTimeoutSeconds: 3,
            },
          },
        ],
      },
    }),
  ],
});
