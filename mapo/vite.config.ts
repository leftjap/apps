import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/apps/mapo/',
  server: { port: 5197, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  // 구운 판 전체를 읽는 시험(출구·사람 수 등)은 혼자 돌면 5초 안이지만, 전체 실행이나 CI 처럼 붐비면 넘는다.
  // 기본 5초 제한에 걸려 CI 가 마포를 배포에서 빼고 /apps/mapo/ 가 404 가 된 일이 두 번 있어 넉넉히 둔다
  // 로컬(맥미니)에서는 시험 일꾼을 3개로 묶는다. 묶지 않으면 전체 시험이 코어를 모두 써 부하 24·팬 소음이 났다(2026-11-17)
  // tmp/ 에는 하위 작업이 푼 깨끗한 사본(각자 test/ 를 가짐)이 쌓인다. 빼지 않으면 작업 트리의 pnpm test 가 사본 시험 수천 개를 함께 돌린다(2026-11-18)
  test: { testTimeout: 60_000, maxWorkers: process.env.CI ? undefined : 3, exclude: [...configDefaults.exclude, 'tmp/**'] },
});
