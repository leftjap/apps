import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages: leftjap.github.io/apps/today/ 서브경로 배포 (workflow 가 GH_PAGES=1 주입).
// 로컬 dev/preview 는 GH_PAGES 미설정 → / (기본 동작 유지).
const BASE = process.env.GH_PAGES ? '/apps/today/' : '/';

// 빌드 식별자 — 사이드바 하단에 표시. 지오가 폰에서 "보는 빌드" 를 읽어 옛 캐시/최신 판별.
// CI 는 commit SHA(7자), 로컬은 'dev'. 날짜시각(분 단위) 동반 — 사람이 비교하기 쉽게.
const BUILD_ID = [
  (process.env.GITHUB_SHA || 'dev').slice(0, 7),
  new Date().toISOString().slice(2, 16).replace('T', ' '),
].join(' · ');

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: BASE,
  define: {
    __BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    // 5175 fallback 금지 — geo-apps OAuth 클라이언트 redirect URI 가 5175 한정.
    // 다른 포트로 fallback 시 redirect_uri_mismatch 발생.
    port: 5175,
    strictPort: true,
    host: '0.0.0.0',
  },
  preview: {
    port: 4175,
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
      includeAssets: ['icons/*.png'],
      manifest: false,
      workbox: {
        // Web Push 핸들러 주입 — generateSW 유지(캐싱 무변경), public/push-sw.js 를 SW 에 importScripts.
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Wave 11.9.1 — heic2any chunk (1.35 MB) 는 precache 제외 (HEIC 첨부 시점 lazy fetch).
        // 일반 사용자 (JPEG/PNG only) PWA 첫 설치 부담 1.95 → 0.6 MB.
        globIgnores: ['**/heic2any-*.js', '**/heic2any-*.js.map'],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [new RegExp(`^${BASE.replace(/\//g, '\\/')}mocks\\/`)],
        // Wave 11.10 — 새 빌드 SW 즉시 활성화 (사용자 reload 시 옛 cache 강제 폐기).
        // skipWaiting:true → 새 SW install 시 waiting 단계 스킵. clientsClaim:true → 즉시 모든 탭 제어.
        // cleanupOutdatedCaches:true → 옛 precache 자동 삭제 (해시 다른 옛 chunks 제거).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        // navigation 요청은 NetworkFirst — 새 빌드 배포 시 favicon/manifest 즉시 갱신.
        // precache fallback 은 offline 시에만 사용.
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
