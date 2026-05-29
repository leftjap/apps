import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages: leftjap.github.io/apps/gym/ 서브경로 배포 (workflow 가 GH_PAGES=1 주입).
// 로컬 dev/preview 는 GH_PAGES 미설정 → / (기본 동작 유지).
const BASE = process.env.GH_PAGES ? '/apps/gym/' : '/';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  base: BASE,
  // vitest 가 e2e/*.spec.js (playwright) 까지 로드 시 충돌 → 명시 exclude (Wave 11.7).
  test: {
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
  },
  preview: {
    // Gym 은 4173 (default), Study 는 4174 로 분리됨.
    port: 4173,
    host: '0.0.0.0',
  },
  plugins: [
    VitePWA({
      // 'prompt' (NOT 'autoUpdate'): autoUpdate 는 새 SW 활성화 시 vite-plugin-pwa 가
      // window.location.reload() 를 자동 호출(register.js: activated→reload) → 배포 후 앱 재개 시
      // 화면이 통째로 리로드되는 체감. 'prompt' 는 새 버전을 대기시키고 다음 콜드스타트에 자연 적용
      // (강제 reload 없음). 개인용 PWA 라 즉시 갱신보다 끊김 없는 재개 우선. 회귀 주의 — 되돌리지 말 것.
      registerType: 'prompt',
      injectRegister: 'auto',
      devOptions: {
        enabled: false,
      },
      includeAssets: ['icons/*.png'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        navigateFallback: `${BASE}index.html`,
        navigateFallbackDenylist: [new RegExp(`^${BASE.replace(/\//g, '\\/')}mocks\\/`)],
      },
    }),
  ],
});
