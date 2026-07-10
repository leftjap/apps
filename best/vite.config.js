import { defineConfig } from 'vite'

export default defineConfig({
  base: process.env.GH_PAGES ? '/apps/best/' : '/',
  server: { port: 5179, strictPort: true },
})
