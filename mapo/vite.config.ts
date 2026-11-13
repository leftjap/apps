import { defineConfig } from 'vite';

export default defineConfig({
  base: '/apps/mapo/',
  server: { port: 5197, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
});
