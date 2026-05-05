import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  root: '.',
  publicDir: 'public',
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
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/mocks\//],
      },
    }),
  ],
});
