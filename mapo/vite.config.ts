import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/apps/mapo/',
  server: { port: 5197, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  // 구운 판 전체를 읽는 시험(출구·사람 수 등)은 혼자 돌면 5초 안이지만, 전체 실행이나 CI 처럼 붐비면 넘는다.
  // 기본 5초 제한에 걸려 CI 가 마포를 배포에서 빼고 /apps/mapo/ 가 404 가 된 일이 두 번 있어 넉넉히 둔다
  test: { testTimeout: 60_000 },
});
