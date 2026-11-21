// 시험을 지도 시험과 차·사람 시뮬레이션 시험으로 나눠 돌린다. 1·2단계(지도) 동안 CI 는 지도 시험만 실패로 표시하고
// 시뮬레이션 시험은 기록만 한다(2026-11-19 지오 결정, mapo/CLAUDE.md). 시뮬레이션 시험은 차·사람을 만들어 돌리는 파일로 가른다
import { readdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

// w31-cases 는 차·사람 한 차림 측정(w31-run)을 부르는 공용 파일이라 그것을 쓰는 시험(w31-people·w31-people2 등)도 시뮬레이션 시험이다
const SIM = /makeCars|makePeople|measure-junction|junction-zero|w31-run|w31-cases/;
const files = readdirSync('test').filter((f) => f.endsWith('.test.ts'));
const sim = files.filter((f) => SIM.test(readFileSync(`test/${f}`, 'utf8'))).map((f) => `test/${f}`);
const which = process.argv[2];
if (which !== 'map' && which !== 'sim') {
  console.error('사용법: node tools/test-sets.mjs map|sim');
  process.exit(2);
}
const args = which === 'map' ? ['run', ...sim.flatMap((f) => ['--exclude', f])] : ['run', ...sim];
const r = spawnSync('pnpm', ['exec', 'vitest', ...args], { stdio: 'inherit' });
process.exit(r.status ?? 1);
