import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages: leftjap.github.io/apps/book/ 서브경로 배포 (workflow 가 GH_PAGES=1 주입).
// 로컬 dev/preview 는 GH_PAGES 미설정 → / (기본 동작 유지).
const BASE = process.env.GH_PAGES ? '/apps/book/' : '/';

export default defineConfig(({ mode }) => {
  // .env / .env.local 에서 ALADIN_TTB_KEY 로드 (서버측만 — 클라 번들 미노출).
  const env = loadEnv(mode, process.cwd(), '');
  const ALADIN_KEY = env.ALADIN_TTB_KEY || '';

  return {
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
      port: 5176,
      strictPort: true,
      host: '0.0.0.0',
      // dev 전용 알라딘 프록시 — 알라딘은 CORS·JSONP 미지원(실측), 키도 서버측 은닉.
      // 클라: fetch('/api/aladin/ItemSearch.aspx?Query=...') → 알라딘 /ttb/api/* + ttbkey 주입.
      // ※ 배포(정적)에선 동작 안 함 → Supabase Edge Function 등 별도 프록시 필요.
      proxy: {
        '/api/aladin': {
          target: 'https://www.aladin.co.kr',
          changeOrigin: true,
          rewrite: (p) => {
            const rest = p.replace(/^\/api\/aladin/, '');
            const sep = rest.includes('?') ? '&' : '?';
            return '/ttb/api' + rest + sep + 'ttbkey=' + encodeURIComponent(ALADIN_KEY);
          },
        },
      },
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
  };
});
