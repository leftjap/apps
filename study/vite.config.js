import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { visualizer } from 'rollup-plugin-visualizer';

// GitHub Pages: leftjap.github.io/apps/study/ 서브경로 배포 (workflow 가 GH_PAGES=1 주입).
// 로컬 dev/preview 는 GH_PAGES 미설정 → / (기본 동작 유지).
const BASE = process.env.GH_PAGES ? '/apps/study/' : '/';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: BASE,
  // vitest 가 e2e/*.spec.js (playwright) 까지 로드 시 충돌 → 명시 exclude (Wave 11.12).
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    // Wave 11.15/11.19 — bundle size 추적/회피. 청크별 분리해
    //   (1) 청크별 사이즈 가시화 (어떤 의존성이 무거운지 명확)
    //   (2) PWA 의 SW precache 가 청크별 캐싱 → 코드 변경 시 의존성 청크 재다운로드 회피
    // Wave 11.19: supabase-js → auth-js + postgrest-js sub-package 직접 사용 (Realtime/Functions/Storage 제거).
    rollupOptions: {
      input: {
        main: 'index.html',
        mocksHome: 'mocks/home.html',
        mocksSessionNew: 'mocks/session-new.html',
        mocksSessionReview: 'mocks/session-review.html',
      },
      output: {
        // 함수 형태 — sub-path import (`@supabase/auth-js/dist/module/GoTrueClient.js` 등) 도 매치.
        // 객체 형태는 root index 만 매치해 sub-module 들이 index 청크로 흡수됨 (Wave 11.19 검증).
        manualChunks(id) {
          if (id.includes('node_modules/@supabase/auth-js/')) return 'auth';
          if (id.includes('node_modules/@supabase/postgrest-js/')) return 'postgrest';
          if (id.includes('node_modules/dexie/')) return 'dexie';
          // Wave 11.22 — Azure Speech SDK dynamic import → 별 청크 (첫 페이지 로드 영향 0).
          if (id.includes('node_modules/microsoft-cognitiveservices-speech-sdk/')) return 'azure-sdk';
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  preview: {
    // 4173 은 gym-preview 가 선점 가능 → Study 는 4174
    port: 4174,
    host: '0.0.0.0',
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        // dev 모드에서 SW 비활성 — PWA 검증은 preview 에서만
        enabled: false,
      },
      includeAssets: ['icons/*.png'],
      // manifest 는 public/manifest.webmanifest 사용 (plugin 자동 생성 비활성)
      manifest: false,
      workbox: {
        // 새 빌드 배포 시 클라이언트 SW 즉시 갱신 — 옛 아이콘/asset precache 잔존 방지
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Wave 11.18 — visualizer 결과 stats.html 은 SW precache 제외 (개발자 분석용, 실 사용 X)
        // Wave 11.22 — azure-sdk 청크 (467 kB) 는 dynamic import 라 첫 페이지 미필요. SW precache 제외 후
        //   runtimeCaching 으로 첫 호출 시 cache. PWA 첫 진입 다운로드 ~435 kB 절감.
        globIgnores: ['**/stats.html', '**/azure-sdk-*.js', '**/azure-sdk-*.js.map'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/azure-sdk-.*\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'azure-sdk-cache',
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
        navigateFallback: `${BASE}index.html`,
        // mocks/ 는 SPA fallback 대상 제외 (각 HTML 이 독립 페이지)
        navigateFallbackDenylist: [new RegExp(`^${BASE.replace(/\//g, '\\/')}mocks\\/`)],
      },
    }),
    // Wave 11.18 — bundle 분석 (build 시 dist/stats.html 자동 생성).
    // Wave 11.13.3 → 11.13.x 의 +205 kB 원인 추적용. dev/preview 영향 0 (build only).
    visualizer({
      filename: 'dist/stats.html',
      template: 'treemap', // 모듈별 사이즈 시각화
      gzipSize: true,
      brotliSize: true,
      open: false,
      sourcemap: true,
    }),
  ],
});
