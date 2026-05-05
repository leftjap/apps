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
      registerType: 'autoUpdate',
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
