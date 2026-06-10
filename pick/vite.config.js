import { defineConfig, loadEnv } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages: leftjap.github.io/apps/pick/ 서브경로 배포 (workflow 가 GH_PAGES=1 주입).
// 앱명 Pick 리네임에 맞춰 경로 이관 (2026-06-10) — 구 /apps/pick/ 는 redirect 스텁 + kill-SW.
// 로컬 dev/preview 는 GH_PAGES 미설정 → / (기본 동작 유지).
const BASE = process.env.GH_PAGES ? '/apps/pick/' : '/';

export default defineConfig(({ mode }) => {
  // .env / .env.local 에서 ALADIN_TTB_KEY 로드 (서버측만 — 클라 번들 미노출). book 미러.
  const env = loadEnv(mode, process.cwd(), '');
  const ALADIN_KEY = env.ALADIN_TTB_KEY || '';

  return {
    root: '.',
    publicDir: 'public',
    base: BASE,
    test: {
      // design-ref 의 React jsx 는 vitest 대상 아님.
      exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/design-ref/**'],
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      sourcemap: true,
    },
    server: {
      // 5177 strictPort — geo-apps OAuth 클라이언트 redirect URI 가 5177 한정. fallback 시 redirect_uri_mismatch.
      port: 5177,
      strictPort: true,
      host: '0.0.0.0',
      // dev 전용 알라딘 프록시 (book 미러) — 알라딘 CORS 미지원·키 서버측 은닉.
      // 클라: fetch('/api/aladin/ItemSearch.aspx?Query=...') → 알라딘 /ttb/api/* + ttbkey 주입.
      // ※ 배포(정적)에선 미동작 → Supabase Edge Function 별도 프록시(Wave 2).
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
      port: 4177,
      strictPort: true,
      host: '0.0.0.0',
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        devOptions: { enabled: false },
        includeAssets: ['icons/*.png'],
        manifest: false,
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
              // 'pages' 같은 무스코프 이름은 한 origin 의 형제 앱들과 캐시를 공유하게 됨 — 앱 prefix 로 격리.
              options: { cacheName: 'pick-pages', networkTimeoutSeconds: 3 },
            },
          ],
        },
      }),
    ],
  };
});
