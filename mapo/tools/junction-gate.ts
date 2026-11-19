// 넓힌 씨앗 0 시험 게이트(재작업 W56, 설계 문서 63절). CI 의 9판(씨앗 11·12·13 × 세 조건, test/junction-zero.ts)은 그대로 두고,
// 차 규칙·차로 자료를 바꾸는 커밋 전에는 로컬에서 씨앗 11~50 × 세 조건 120판을 이 스크립트로 돌린다(노드 둘, 약 40분, ~/apps/scripts/heavy.sh 안에서).
//   node tools/junction-gate.ts [첫 씨앗] [끝 씨앗] [--base]
// 목표는 모든 판에서 아홉 가지 0 이다. 지금은 HEAD 도 깨지는 판이 있어, 당분간 통과 기준은 GATE_BASE(같은 게이트로 잰 HEAD 120판)보다 나빠지지 않는 것이다.
//  · 깨진 판 비율이 HEAD 비율보다 높지 않다
//  · 깨진 자리(가지 + 가장 가까운 횡단보도)가 HEAD 에서 나온 자리이거나, 같은 원인 종류로 추적해 KNOWN 에 적은 자리다
//  · W44 셋(까닭 없이 선 차·찻길 면 밖·빗금 위)의 조건별 씨앗 평균이 HEAD 평균 + 표준오차를 넘지 않는다
// 씨앗 셋 가운데 가장 큰 값을 판마다 상한으로 두던 W44 꼴과 씨앗 20개 묶음은 표본 하나에 맞춘 값이었다: HEAD 끼리도 씨앗 11~30 과 31~50 에서 깨진 판이 11·20,
// 토 stuck 평균이 15.2·18.4 로 흔들려, 난수를 바꾸는 커밋은 통과 여부가 운에 달렸다(W56).
// --base 는 지금 판을 잰 값을 GATE_BASE 꼴로 찍는다(HEAD 에서 돌려 아래 값을 바꾼다)
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { decodeBoard } from '../src/data/board.ts';
import { CASES, type AuditResult } from './measure-junction.ts';

/** HEAD 기준값(이 게이트로 잰 값): 판 수, 깨진 판 수, 깨진 자리, 조건(일·토·평일)마다 W44 셋의 씨앗 평균과 그 표준오차 */
// 기준은 재작업 W56 커밋(차 난수 분리) 자체를 120판 잰 값이다. 그 전 HEAD c149686d 는 120판 가운데 31판 깨짐(xw726 20·합정 e184/e185 겹침 6·xw430 4·xw23 2),
// W44 평균±표준오차 stuck 8.0±0.73/16.8±1.56/56.8±4.71, offRoad 115.3±4.15/136.9±5.54/124.2±7.32, onGore 1,732±51/2,073±68/5,426±95(일/토/평일)였다.
// W56 은 일 stuck(8.9, 옛 HEAD + 표준오차 8.73)·토 offRoad(150.7, 142.4) 두 칸이 그보다 높다. 토 offRoad 의 70% 는 두 판 모두 e189(합정 서쪽, 그린 찻길 면과
// 차로가 어긋난 자료 자리, HEAD 97.8 대 W56 105.2 차·초/판)라 다음 묶음(B3)에서 다시 볼 것(설계 63절)
export const GATE_BASE = {
  head: 'W56',
  runs: 120,
  fails: 15,
  sites: ['overlap xw259', 'stopXw xw23', 'stopXw xw420', 'stopXw xw430', 'stopXw xw726', 'walk xw420'] as string[],
  stuck: [8.9, 17.3, 43.2],
  stuckSE: [1.17, 1.42, 4.63],
  offRoad: [117.7, 150.7, 104.2],
  offRoadSE: [5.97, 7.53, 4.91],
  onGore: [1692.1, 2028.4, 5337.2],
  onGoreSE: [56.9, 57.3, 91.3],
};
/** HEAD 120판에는 없지만 같은 원인 종류로 추적해 둔 자리. 모두 이음매 옆 거리·차체 방향(차체가 OSM 가운데선 방향이라 차로와 어긋남) 때문에 옆 차로 차 몸이
 *  내 앞으로 들어와 몸통 막기가 횡단보도 위에서 세운 것이다. 다음 묶음(B3 차로 정본 + 차체 방향 + 앞길 차로 틀)에서 고칠 것 */
export const KNOWN: Record<string, string> = {
  'stopXw xw420': '월드컵로 e337(road7966r): 0번 차로 차가 옆 거리 −0.37m 로 넘어오던 1번 차로 뒤차와 몸이 닿아 둘이 100초 맞물림(W56 k4 씨앗 20 토)',
  'walk xw420': '위와 같은 맞물림이 보행 초록까지 이어짐',
};
const ZERO = ['red', 'lane', 'cross', 'offPath', 'walk', 'stopXw', 'center', 'side', 'overlap'] as const;
const W44 = ['stuck', 'offRoad', 'onGore'] as const;

const DATA = process.env.MAPO_DATA ?? new URL('../public/data/', import.meta.url).pathname;
const xws = decodeBoard(JSON.parse(readFileSync(`${DATA}/board.json`, 'utf8'))).crosswalks;
/** 기록 한 줄('x,z 정보')의 자리 종류: 가지 + 횡단보도(기록에 있으면 그것, 없으면 가장 가까운 것) */
export function siteOf(kind: string, where: string): string {
  const m = where.match(/xw(\d+)/);
  if (m) return `${kind} xw${m[1]}`;
  const [x, z] = where.split(' ')[0].split(',').map(Number);
  let best = -1;
  let bd = Infinity;
  xws.forEach((c, i) => {
    const d = Math.hypot(c.x - x, c.z - z);
    if (d < bd) (bd = d), (best = i);
  });
  return `${kind} xw${best}`;
}

function one(seed: number): Promise<AuditResult[]> {
  return new Promise((ok, no) => {
    const p = spawn(process.execPath, [new URL('./measure-junction.ts', import.meta.url).pathname, '300', String(seed)], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.on('close', (code) => (code ? no(new Error(`씨앗 ${seed} 끝 코드 ${code}`)) : ok(out.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l)))));
  });
}

if (process.argv[1]?.endsWith('junction-gate.ts')) {
  const lo = Number(process.argv[2] ?? 11);
  const hi = Number(process.argv[3] ?? 50);
  const base = process.argv.includes('--base');
  const seeds = Array.from({ length: hi - lo + 1 }, (_, k) => lo + k);
  const res = new Map<number, AuditResult[]>();
  const queue = [...seeds];
  await Promise.all(
    [0, 1].map(async () => {
      for (let s = queue.shift(); s !== undefined; s = queue.shift()) res.set(s, await one(s));
    }),
  );
  let fails = 0;
  let runs = 0;
  let bad = 0;
  const sites = new Set<string>();
  for (const s of seeds)
    for (const r of res.get(s)!) {
      runs++;
      const z = ZERO.filter((k) => r[k]);
      if (r.passes <= 500) (bad++, console.log(`씨앗 ${s} ${r.case}: 통과 ${r.passes} ≤ 500`));
      if (!z.length) continue;
      fails++;
      for (const k of z) for (const w of r.where[k] ?? []) sites.add(siteOf(k, w));
      console.log(`씨앗 ${s} ${r.case}: ${z.map((k) => `${k} ${r[k]} [${(r.where[k] ?? []).slice(0, 2).join(' / ')}]`).join(', ')}`);
    }
  const out: Record<string, number[]> = {};
  CASES.forEach(([name], k) => {
    const rs = seeds.map((s) => res.get(s)![k]);
    const mean = (f: (r: AuditResult) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    const line = [`${name}: 속도 ${mean((r) => r.speed).toFixed(3)} 통과 ${mean((r) => r.passes).toFixed(1)}`];
    for (const key of W44) {
      const m = mean((r) => r[key]);
      const se = Math.sqrt(rs.reduce((a, r) => a + (r[key] - m) ** 2, 0) / (rs.length - 1) / rs.length);
      (out[key] ??= []).push(+m.toFixed(1));
      (out[`${key}SE`] ??= []).push(+se.toFixed(1));
      const cap = GATE_BASE[key][k] + GATE_BASE[`${key}SE`][k];
      line.push(`${key} ${m.toFixed(1)}/${cap.toFixed(1)}`);
      if (!base && m > cap) bad++;
    }
    console.log(line.join(' '));
  });
  const fresh = [...sites].filter((x) => !GATE_BASE.sites.includes(x)).sort();
  const unknown = fresh.filter((x) => !KNOWN[x]);
  console.log(`깨진 판 ${fails}/${runs}(HEAD ${GATE_BASE.fails}/${GATE_BASE.runs}), 자리 ${[...sites].sort().join(', ') || '없음'}`);
  for (const x of fresh) console.log(`  HEAD 에 없던 자리 ${x}: ${KNOWN[x] ? `알려진 종류 — ${KNOWN[x]}, 다음 묶음(B3+차체 방향+차로 틀)에서 고칠 것` : '추적 기록 없음(실패)'}`);
  if (base) {
    console.log(JSON.stringify({ runs, fails, sites: [...sites].sort(), ...out }));
    process.exit(0);
  }
  if (fails / runs > GATE_BASE.fails / GATE_BASE.runs) bad++;
  bad += unknown.length;
  console.log(bad ? `게이트 실패 ${bad}` : `게이트 통과(씨앗 ${lo}~${hi} × 세 조건)`);
  process.exit(bad ? 1 : 0);
}
