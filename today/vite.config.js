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
      // 'prompt' (NOT 'autoUpdate'): autoUpdate+skipWaiting 은 배포 후 첫 실행에서 부팅 완료
      // 직후 새 SW 가 장악 → 강제 reload → "2번 로딩" 유발 (2026-07-16 필름스트립 실측).
      // 'prompt' 는 새 SW 를 대기시키고 다음 콜드스타트에 자연 적용 — gym/book 과 동일 패턴.
      // iOS 옛 빌드 고착(ef872e0)의 원인이던 "SW 만 새것·페이지는 구 JS" 스큐 자체가 사라짐.
      registerType: 'prompt',
      injectRegister: 'auto',
      devOptions: {
        enabled: false,
      },
      includeAssets: ['icons/*.png'],
      manifest: false,
      workbox: {
        // Web Push 핸들러 주입 — generateSW 유지(캐싱 무변경), public/push-sw.js 를 SW 에 importScripts.
        importScripts: ['push-sw.js'],
        // jpg 포함 필수 — cat-loading.jpg(초기 로딩 화면)가 프리캐시에서 빠지면 PWA 콜드
        // 스타트에 깨진 이미지 원형(흑백)이 표시됨 (2026-07-16 오프라인 재현).
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,webmanifest}'],
        // Wave 11.9.1 — heic2any chunk (1.35 MB) 는 precache 제외 (HEIC 첨부 시점 lazy fetch).
        // 일반 사용자 (JPEG/PNG only) PWA 첫 설치 부담 1.95 → 0.6 MB.
        globIgnores: ['**/heic2any-*.js', '**/heic2any-*.js.map'],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [new RegExp(`^${BASE.replace(/\//g, '\\/')}mocks\\/`)],
        // skipWaiting/clientsClaim 미설정 — 새 SW 는 열린 클라이언트가 모두 닫힐 때까지 대기.
        // (실행 중 페이지를 구 SW/구 번들에 고정 → 강제 reload·청크 불일치 차단. 'prompt' 전제)
        // cleanupOutdatedCaches:true → 옛 precache 자동 삭제 (해시 다른 옛 chunks 제거).
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
