import { basename } from 'node:path';
import { BaseSequencer, type TestSpecification } from 'vitest/node';
import { defineConfig } from 'vitest/config';

// 오래 걸리는 시험 파일(CI 시험 단계 초, 70c6a509 실행)을 긴 것부터 먼저 시작한다(W43). 캐시 없는 CI 에서 vitest 는 파일 크기가 큰 것부터 돌리는데,
// 판을 돌리는 w31-people2~5 는 네 줄짜리 파일이라 맨 뒤에 몰려 일꾼 하나가 둘을 잇달아 돌았다(시험 단계 29분, 끝 약 18분은 이 파일들)
const LONG: Record<string, number> = {
  'w31-people2': 578,
  'w31-people': 554,
  'w20-junction': 534,
  'w31-people5': 534,
  'w31-people4': 531,
  'w31-people3': 517,
  'w25-junction-s12': 459,
  'w25-junction-s13': 430,
  'w29-coarse': 289,
  'w21b-flow': 160,
  'w21-people': 103,
  'w41-turnback': 45,
};
class LongFirst extends BaseSequencer {
  async sort(files: TestSpecification[]) {
    const t = (f: TestSpecification) => LONG[basename(f.moduleId).replace(/\.test\.ts$/, '')] ?? 0;
    // 나머지는 vitest 차례 그대로(정렬은 안정적이다)
    return [...(await super.sort(files))].sort((a, b) => t(b) - t(a));
  }
}

export default defineConfig({
  base: '/apps/mapo/',
  server: { port: 5197, strictPort: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 900 },
  // 구운 판 전체를 읽는 시험(출구·사람 수 등)은 혼자 돌면 5초 안이지만, 전체 실행이나 CI 처럼 붐비면 넘는다.
  // 기본 5초 제한에 걸려 CI 가 마포를 배포에서 빼고 /apps/mapo/ 가 404 가 된 일이 두 번 있어 넉넉히 둔다
  // 로컬(맥미니)에서는 시험 일꾼을 3개로 묶는다. 묶지 않으면 전체 시험이 코어를 모두 써 부하 24·팬 소음이 났다(2026-11-17)
  test: { testTimeout: 60_000, maxWorkers: process.env.CI ? undefined : 3, sequence: { sequencer: LongFirst } },
});
