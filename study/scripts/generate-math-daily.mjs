#!/usr/bin/env node
/**
 * generate-math-daily.mjs — 루틴용 "오늘의 수학" 응용 생성기.
 *
 * 정본 = docs/math-curriculum.md. 개념 카드는 번들 큐레이션(자동생성 X);
 * 본 스크립트는 그 개념에 묶이는 **일일 응용 연습**만 생성한다(conceptId 연결 → 개념-우선 노출).
 * 파라메트릭 = 도형(figures.js)·답(계산)이 입력에서 결정 → LLM 산수/도형 오류 0. 날짜 시드 RNG → 멱등.
 *
 * 사용: node scripts/generate-math-daily.mjs [--date YYYY-MM-DD] [--count 3] [--out <file>] [--concept <id>]
 */
import { writeFileSync } from 'node:fs';
import { argv } from 'node:process';
import {
  squaresOnSides, staircaseToRect, labeledCircle, scaledSquares, scaledCircles,
  labeledTriangle, labeledParallelogram, labeledTrapezoid,
  triangleInRect, paraToRect, squareCount, rightTriangle, trapezoidDoubled, circleToRect,
} from '../src/data/math/figures.js';

function hashSeed(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

const META = {
  odd: { module: '모양으로 세기', tag: '응용 · 홀수합' }, trinum: { module: '모양으로 세기', tag: '응용 · 삼각수' },
  tri: { module: '넓이는 변형', tag: '응용 · 삼각형' }, para: { module: '넓이는 변형', tag: '응용 · 평행사변형' },
  trap: { module: '넓이는 변형', tag: '응용 · 사다리꼴' }, pyth: { module: '도형의 약속', tag: '응용 · 피타고라스' },
  sim: { module: '도형의 약속', tag: '응용 · 닮음' }, circ: { module: '도형의 약속', tag: '응용 · 원' },
};
const ORDER = ['odd', 'trinum', 'tri', 'para', 'trap', 'pyth', 'sim', 'circ'];
const TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [8, 15, 17], [9, 12, 15], [7, 24, 25]];

// 답 독립 재계산(생성식과 다른 경로) — 자체검증용.
function recompute(m) {
  switch (m.t) {
    case 'odd': return Array.from({ length: m.n }, (_, i) => 2 * i + 1).reduce((s, x) => s + x, 0);
    case 'trinum': { let s = 0; for (let i = 1; i <= m.n; i++) s += i; return s; }
    case 'tri': return m.base * m.height / 2;
    case 'para': return m.base * m.height;
    case 'trap': return (m.top + m.bottom) * m.height / 2;
    case 'pyth': return Math.sqrt(m.a * m.a + m.b * m.b);
    case 'sim': return m.k * m.k;
    case 'circ': return +(3.14 * m.r * m.r).toFixed(2);
    default: return NaN;
  }
}

function parseArgs(a) {
  const o = { count: 3 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--date') o.date = a[++i];
    else if (a[i] === '--count') o.count = +a[++i];
    else if (a[i] === '--out') o.out = a[++i];
    else if (a[i] === '--concept') o.concept = a[++i];
  }
  return o;
}

// 개념별 파라메트릭 생성기 (rng 주입). 각 응용 = {conceptId, figure, prompt, answer, accept, solution, _meta}.
function makeGen(rng) {
  const ri = (lo, hi) => lo + Math.floor(rng() * (hi - lo + 1));
  const evenRi = (lo, hi) => 2 * ri(Math.ceil(lo / 2), Math.floor(hi / 2));
  const pick = (a) => a[Math.floor(rng() * a.length)];
  return {
    odd() {
      const n = ri(4, 8), seq = Array.from({ length: n }, (_, i) => 2 * i + 1);
      return {
        conceptId: 'odd', figure: { type: 'dots', n, legend: `홀수 ${n}개 (${seq.join('·')})` },
        prompt: `${seq.join(' + ')} = ?`, answer: n * n, accept: [`${n * n}`, `${n}x${n}`, `${n}²`, `${n}^2`],
        solution: {
          figure: { type: 'svg', svg: squareCount({ side: n }) },
          core: '홀수 n개의 합 = n².',
          idea: `다 더하지 말고 홀수가 몇 개인지만 세요. 1부터 ${2 * n - 1}까지 홀수는 ${n}개 — 그림처럼 한 변 ${n}인 정사각형이 꽉 차니 답은 ${n} × ${n} = ${n * n}.`,
          steps: [`홀수가 ${n}개`, `${n} × ${n} = ${n * n}`], refresh: `제곱(${n}² = ${n * n})`,
          example: '정사각형으로 깔린 타일·좌석의 개수를 한눈에.', think: '"전부 더하기" 대신 "몇 개인지 세서 제곱" — 셈을 구조로 바꾼다.',
        }, _meta: { t: 'odd', n },
      };
    },
    trinum() {
      const n = ri(6, 12), figN = Math.min(n, 7);
      return {
        conceptId: 'trinum',
        prompt: `1 + 2 + 3 + … + ${n} = ?`, answer: n * (n + 1) / 2, accept: [`${n * (n + 1) / 2}`],
        solution: {
          figure: { type: 'svg', svg: staircaseToRect({ n: figN }) },
          core: 'n × (n+1) ÷ 2 — 계단 두 벌이 직사각형.',
          idea: `1부터 ${n}까지를 계단으로 쌓고 똑같은 계단을 거꾸로 끼우면(그림은 ${figN}까지 축약해 원리만), 가로 ${n} · 세로 ${n + 1} 직사각형이 돼요. 그 칸 ${n} × ${n + 1} = ${n * (n + 1)} 의 절반이 답.`,
          steps: [`직사각형 ${n} × ${n + 1} = ${n * (n + 1)}`, `계단 두 벌이니 절반 → ${n * (n + 1) / 2}`], refresh: '곱셈 · 절반(÷2)',
          example: `1~${n}번 좌석이나 한 칸씩 늘어난 계단 칸의 총수를 한 번에.`, think: '더할 게 많을수록 "두 벌→직사각형" 공식의 이득이 커진다.',
        }, _meta: { t: 'trinum', n },
      };
    },
    tri() {
      const base = ri(4, 12), height = evenRi(4, 8);
      return {
        conceptId: 'tri', figure: { type: 'svg', svg: labeledTriangle({ base, height }), legend: `밑변 ${base} · 높이 ${height}` },
        prompt: `밑변 ${base}, 높이 ${height}인 삼각형의 넓이는?`, answer: base * height / 2, accept: [`${base * height / 2}`],
        solution: {
          figure: { type: 'svg', svg: triangleInRect({ base, height }) },
          core: '½ × 밑변 × 높이.',
          idea: `이 삼각형을 점선 직사각형(${base} × ${height})의 절반으로 보세요(그림). 직사각형 칸 ${base * height} 의 절반이니 ${base * height / 2}.`,
          steps: [`감싸는 직사각형 ${base} × ${height} = ${base * height}`, `절반 → ${base * height / 2}`], refresh: '½ · 곱셈',
          example: '삼각 깃발·지붕 단면의 넓이도 "직사각형의 절반"으로.', think: '낯선 모양을 "직사각형의 절반"으로 환원.',
        }, _meta: { t: 'tri', base, height },
      };
    },
    para() {
      const base = ri(4, 12), height = ri(3, 8);
      return {
        conceptId: 'para', figure: { type: 'svg', svg: labeledParallelogram({ base, height }), legend: `밑변 ${base} · 높이 ${height}` },
        prompt: `밑변 ${base}, 높이 ${height}인 평행사변형의 넓이는?`, answer: base * height, accept: [`${base * height}`],
        solution: {
          figure: { type: 'svg', svg: paraToRect({ base, height }) },
          core: '평행사변형 = 밑변 × 높이.',
          idea: `기운 끝 조각을 잘라 반대편에 붙이면 점선 직사각형이 돼요(그림). 넓이는 그대로 ${base} × ${height} = ${base * height}.`,
          steps: [`직사각형으로 펴면 ${base} × ${height} = ${base * height}`], refresh: '곱셈 · 높이=수직 거리',
          example: '비스듬히 쌓은 벽돌 단·기울인 책 무더기 단면.', think: '겉모양 기울기에 안 흔들리고 밑변×높이만 본다.',
        }, _meta: { t: 'para', base, height },
      };
    },
    trap() {
      const top = ri(2, 6), bottom = top + ri(2, 8), height = evenRi(4, 8);
      return {
        conceptId: 'trap', figure: { type: 'svg', svg: labeledTrapezoid({ top, bottom, height }), legend: `윗변 ${top} · 아랫변 ${bottom} · 높이 ${height}` },
        prompt: `윗변 ${top}, 아랫변 ${bottom}, 높이 ${height}인 사다리꼴의 넓이는?`, answer: (top + bottom) / 2 * height, accept: [`${(top + bottom) / 2 * height}`],
        solution: {
          figure: { type: 'svg', svg: trapezoidDoubled({ top, bottom, height }) },
          core: '(윗변 + 아랫변) ÷ 2 × 높이.',
          idea: `똑같은 사다리꼴을 거꾸로 붙이면 밑변 ${top}+${bottom}=${top + bottom} 평행사변형이 돼요(그림). 한 벌은 절반이니 평균 폭 ${(top + bottom) / 2} 에 높이 ${height}.`,
          steps: [`평균 폭 (${top} + ${bottom}) ÷ 2 = ${(top + bottom) / 2}`, `× ${height} = ${(top + bottom) / 2 * height}`], refresh: '평균 · 곱셈',
          example: '둑·수로 단면처럼 위·아래 폭이 다른 면.', think: '들쭉날쭉을 평균으로 평평하게 골라 본다.',
        }, _meta: { t: 'trap', top, bottom, height },
      };
    },
    pyth() {
      const [a, b, c] = pick(TRIPLES), unit = Math.max(8, Math.round(260 / (2 * b + a)));
      return {
        conceptId: 'pyth', figure: { type: 'svg', svg: rightTriangle({ a, b, labels: { base: `${a}`, height: `${b}`, hyp: '?' } }), legend: `두 변 ${a}, ${b} → 빗변?` },
        prompt: `직각을 낀 두 변이 ${a}, ${b}인 직각삼각형의 빗변은?`, answer: c, accept: [`${c}`],
        solution: {
          figure: { type: 'svg', svg: squaresOnSides({ a, b, unit }) },
          core: 'a² + b² = c².',
          idea: `두 변 위 정사각형 넓이를 그려 더해요(그림). ${a}² + ${b}² = ${a * a} + ${b * b} = ${c * c} 가 빗변 위 정사각형 넓이. 빗변은 √${c * c} = ${c}.`,
          steps: [`${a}² + ${b}² = ${c * c}`, `√${c * c} = ${c}`], refresh: '제곱 · 제곱근',
          example: '직접 못 재는 빗변을 두 변으로 계산.', think: '못 재는 길이를 아는 값들의 관계로 우회해 구한다.',
        }, _meta: { t: 'pyth', a, b, c },
      };
    },
    sim() {
      const k = ri(2, 4), circle = rng() < 0.5;
      return circle ? {
        conceptId: 'sim', figure: { type: 'svg', svg: scaledCircles({ k }), legend: `지름 ${k}배 원` },
        prompt: `지름이 ${k}배인 피자는 양(넓이)이 몇 배일까요?`, answer: k * k, accept: [`${k * k}`, `${k * k}배`],
        solution: {
          figure: { type: 'svg', svg: squareCount({ side: k }) },
          core: '원도 닮음 — 지름이 k배면 넓이는 k².',
          idea: `원도 정사각형과 똑같이 지름 ${k}배 → ${k} × ${k} = ${k * k}배. 그림의 ${k}×${k}=${k * k}칸이 그 제곱이에요.`,
          steps: [`${k}² = ${k * k}`], refresh: `제곱(${k}² = ${k * k})`, example: '큰 피자가 훨씬 이득인 이유.', think: '"길이비의 제곱" 원리가 원에도 전이.',
        }, _meta: { t: 'sim', k },
      } : {
        conceptId: 'sim', figure: { type: 'svg', svg: scaledSquares({ k }), legend: `한 변 ${k}배 → 작은 정사각형 ${k * k}개` },
        prompt: `정사각형의 한 변을 ${k}배로 늘이면 넓이는 몇 배가 되나요?`, answer: k * k, accept: [`${k * k}`, `${k * k}배`],
        solution: {
          figure: { type: 'svg', svg: squareCount({ side: k }) },
          core: '길이비 k → 넓이비 k².',
          idea: `한 변 ${k}배 → 가로 ${k}줄·세로 ${k}줄이라 작은 정사각형이 ${k} × ${k} = ${k * k}개 들어차요(그림).`,
          steps: [`${k} × ${k} = ${k * k}`], refresh: `제곱(${k}² = ${k * k})`,
          example: `복사기 ${k}배 확대면 잉크·종이는 ${k * k}배.`, think: '1차원(길이) 변화가 2차원(넓이)엔 제곱으로 증폭.',
        }, _meta: { t: 'sim', k },
      };
    },
    circ() {
      const r = ri(3, 8), dia = rng() < 0.5, area = +(3.14 * r * r).toFixed(2);
      return dia ? {
        conceptId: 'circ', figure: { type: 'svg', svg: labeledCircle({ value: 2 * r, kind: 'diameter' }), legend: `지름 ${2 * r} (반지름 아님 — 함정)` },
        prompt: `지름이 ${2 * r}인 원의 넓이는? (π ≈ 3.14)`, answer: area, accept: [`${area}`, `${r * r}π`], range: [area - 0.5, area + 0.5],
        solution: {
          figure: { type: 'svg', svg: circleToRect({ r, unit: Math.max(5, Math.round(48 / r)) }) },
          core: '반지름 = 지름 ÷ 2 를 먼저.',
          idea: `지름 ${2 * r}을 그대로 쓰면 함정! 먼저 반으로 — 반지름 ${r}. 부채꼴로 펴면 가로 πr·세로 r 직사각형(그림), 넓이 = π × ${r}² = ${r * r} × 3.14 = ${area}.`,
          steps: [`반지름 ${2 * r} ÷ 2 = ${r}`, `${r}² × 3.14 = ${area}`], refresh: '지름÷2 · 제곱 · π',
          example: '바퀴·접시 크기는 보통 지름으로 — 반으로.', think: '주어진 게 지름인지 반지름인지 먼저 확인.',
        }, _meta: { t: 'circ', r, area },
      } : {
        conceptId: 'circ', figure: { type: 'svg', svg: labeledCircle({ value: r, kind: 'radius' }), legend: `반지름 ${r}` },
        prompt: `반지름 ${r}인 원의 넓이는? (π ≈ 3.14)`, answer: area, accept: [`${area}`, `${r * r}π`], range: [area - 0.5, area + 0.5],
        solution: {
          figure: { type: 'svg', svg: circleToRect({ r, unit: Math.max(5, Math.round(48 / r)) }) },
          core: 'πr².',
          idea: `원을 부채꼴로 펴면 가로 πr·세로 r 직사각형이 돼요(그림). 넓이 = π × ${r}² = ${r * r} × 3.14 = ${area}.`,
          steps: [`${r}² = ${r * r}`, `× 3.14 = ${area}`], refresh: '제곱 · π(≈3.14)',
          example: '반지름만 재면 접시·바퀴·CD 넓이가 바로.', think: "공식은 '틀' — 반지름만 갈아끼우면 어떤 원이든.",
        }, _meta: { t: 'circ', r, area },
      };
    },
  };
}

function main() {
  const o = parseArgs(argv.slice(2));
  const date = o.date || new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // KST
  const rng = mulberry32(hashSeed(date));
  const gen = makeGen(rng);
  const epochDay = Math.floor(new Date(date + 'T00:00:00Z').getTime() / 86400000);
  const conceptId = o.concept || ORDER[epochDay % ORDER.length]; // 날짜별 backbone 개념 순환
  const problems = [], seen = new Set();
  for (let guard = 0; problems.length < o.count && guard < o.count * 25; guard++) {
    const p = gen[conceptId](), meta = p._meta; delete p._meta;
    if (seen.has(p.prompt)) continue; // 같은 날 세트 내 중복 문제 회피
    seen.add(p.prompt);
    const rc = recompute(meta); // 답 독립 재계산 일치 검증
    if (Math.abs(rc - Number(p.answer)) > 0.011) throw new Error(`answer mismatch ${conceptId}: gen=${p.answer} recompute=${rc}`);
    const figOk = (f) => !!f && (f.type === 'dots' ? f.n > 0 : (f.svg || '').startsWith('<svg'));
    if (p.figure && !figOk(p.figure)) throw new Error(`prompt figure invalid ${conceptId}`);
    if (!figOk(p.solution.figure)) throw new Error(`solution figure missing/invalid ${conceptId}`); // 해설 도형 의무
    const i = problems.length;
    problems.push({
      id: `gen-${date}-${conceptId}-${i + 1}`, conceptId, kind: 'apply',
      module: META[conceptId].module, tag: META[conceptId].tag,
      prompt: p.prompt, figure: p.figure, answer: String(p.answer),
      accept: p.accept, range: p.range, solution: p.solution, order_index: i,
    });
  }
  if (problems.length < o.count) throw new Error(`unique 생성 실패 ${conceptId}: ${problems.length}/${o.count}`);
  const out = o.out || `seeds/math-${date}.json`;
  writeFileSync(out, JSON.stringify({ date, problems }, null, 2));
  console.log(`[generate-math-daily] date=${date} concept=${conceptId} count=${problems.length} → ${out}`);
  console.log('[generate-math-daily] 자체검증 OK (답 독립 재계산 일치 · 도형 SVG 정합)');
  for (const p of problems) console.log(`  ${p.id}  "${p.prompt}"  = ${p.answer}`);
}

main();
