import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: '.',
  publicDir: 'public',
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
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest}'],
        // Wave 11.9.1 — heic2any chunk (1.35 MB) 는 precache 제외 (HEIC 첨부 시점 lazy fetch).
        // 일반 사용자 (JPEG/PNG only) PWA 첫 설치 부담 1.95 → 0.6 MB.
        globIgnores: ['**/heic2any-*.js', '**/heic2any-*.js.map'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/mocks\//],
        // Wave 11.10 — 새 빌드 SW 즉시 활성화 (사용자 reload 시 옛 cache 강제 폐기).
        // skipWaiting:true → 새 SW install 시 waiting 단계 스킵. clientsClaim:true → 즉시 모든 탭 제어.
        // cleanupOutdatedCaches:true → 옛 precache 자동 삭제 (해시 다른 옛 chunks 제거).
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
