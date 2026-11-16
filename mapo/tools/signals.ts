// 신호등·회전 표지 굽기: tools/raw/seoul-signals.json(python3 tools/seoul.py 가 받은 서울시 신호등 부착대·안전표지) → public/data/signals.json
// lamps: 차량 신호등 부착대마다 [지주 쪽 x, z, 팔 끝 x, z, 종류(3 3색등, 4 4색등, 5 버스전용 3색등), 같은 지주의 표지 비트] 6개씩.
// 표지 비트: 1 비보호좌회전(329), 2 유턴(311), 4 유턴금지(216), 8 좌회전금지(214), 16 우회전금지(213).
// signs: 신호등 지주에 달리지 않은 같은 표지들 [x, z, 표지 번호] 3개씩. 사용: node tools/signals.ts
import { readFileSync, writeFileSync } from 'node:fs';

const raw = JSON.parse(readFileSync(new URL('./raw/seoul-signals.json', import.meta.url), 'utf8')) as {
  lamps: { kind: string; pole: string; p: number[] }[];
  signs: { num: string; pole: string; x: number; z: number }[];
};
const BIT: Record<string, number> = { '329': 1, '311': 2, '216': 4, '214': 8, '213': 16 };
const KIND: Record<string, number> = { '002': 3, '005': 3, '003': 4, '006': 4, '022': 5 };
const poles = new Set(raw.lamps.map((l) => l.pole));
const onPole = new Map<string, number>();
for (const s of raw.signs) if (BIT[s.num] && poles.has(s.pole)) onPole.set(s.pole, (onPole.get(s.pole) ?? 0) | BIT[s.num]);
const r1 = (v: number) => Math.round(v * 10) / 10;
const lamps = raw.lamps.flatMap((l) => [...l.p.map(r1), KIND[l.kind], onPole.get(l.pole) ?? 0]);
const signs = raw.signs.filter((s) => BIT[s.num] && !poles.has(s.pole)).flatMap((s) => [r1(s.x), r1(s.z), Number(s.num)]);
writeFileSync(new URL('../public/data/signals.json', import.meta.url), JSON.stringify({ lamps, signs }));
console.log(`차량 신호등 ${lamps.length / 6}개(4색등 ${raw.lamps.filter((l) => KIND[l.kind] === 4).length}), 지주에 단 표지 ${onPole.size}곳, 따로 선 표지 ${signs.length / 3}개`);
