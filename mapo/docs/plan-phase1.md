# 마포 라이브 3D 1단계 구현 계획

> 실행 방식: 이 세션에서 순서대로 실행한다(superpowers:executing-plans). 단계는 체크박스로 표시한다.

**목표:** 홍대입구·연남·합정·서강대교 일대 반경 2km 모형판 위에서 열차·차·보행자·길고양이가 시간대 패턴으로 움직이는 화면과 사이드바를 완성해 `/apps/mapo/`에 배포한다.

**구조:** 빌드 전에 OSM 자료를 정적 파일로 굽고, 실행 중에는 시계 하나가 순수 함수 위주의 시뮬레이션을 움직이며 Three.js가 그린다. 시뮬레이션 입력은 DataProvider 뒤에 두어 2단계에서 실데이터로 바꾼다.

**기술:** Vite 6, TypeScript, three, vitest. Node 22의 타입 제거 실행으로 `tools/*.ts`를 바로 돌린다. React와 지도 엔진은 쓰지 않는다.

**설계 문서:** `mapo/docs/design.md`

## 공통 제약

- 좌표: 원점 북위 37.5515, 동경 126.9190. x 동쪽, z 남쪽, y 위. 단위 m. 판 반지름 2,000m.
- 구운 자료의 길이 값은 데시미터 정수로 저장한다.
- 시뮬레이션의 위치는 가능한 한 "시각의 함수"로 만든다(열차, 고양이, 구역 혼잡도). 차와 보행자만 상태를 가진다.
- 화면 후처리 금지. 움직이는 것은 인스턴싱.
- 핀·말풍선 금지.
- 시뮬레이션·굽기 함수는 테스트를 먼저 쓴다. 셰이더와 색은 화면을 보며 고치므로 테스트 대상이 아니다.
- `tools/*.ts`와 거기서 불러오는 `src/*.ts`는 타입 제거만으로 실행되어야 하므로 enum, 생성자 매개변수 속성을 쓰지 않고 import 경로에 `.ts`를 적는다.
- 커밋은 마지막에 한 번 한다(다른 세션의 스냅샷 훅이 중간 상태를 묶을 수 있으므로 배포 단계 추가도 마지막에 한다).

## 파일

| 파일 | 맡는 일 |
|---|---|
| `tools/fetch.ts` | Overpass에서 원자료를 받아 `tools/raw/`에 저장 |
| `tools/bake.ts` | 원자료 → `public/data/board.json`, `public/data/mask.png` |
| `tools/lib/height.ts` | 건물 높이 추정 |
| `tools/lib/elevate.ts` | 교량·터널 높이 계산 |
| `tools/lib/raster.ts` | 다각형·선을 마스크에 칠하기, PNG 쓰기 |
| `tools/lib/rail.ts` | 선로 조각 잇기, 역을 선 위에 올리기 |
| `src/geo.ts` | 위경도 ↔ 판 좌표 |
| `src/poly.ts` | 꺾은선 길이, 거리로 점 찾기, 가장 가까운 점 |
| `src/data/board.ts` | 구운 자료 타입, 로더, 풀어 쓰기 |
| `src/sim/clock.ts` | 시계(`?t=`, `?speed=`) |
| `src/sim/curves.ts` | 시간대 곡선, 해 높이 |
| `src/sim/provider.ts` | DataProvider와 시뮬레이션 구현, 구역 혼잡도 |
| `src/sim/trains.ts` | 배차표, 주행 곡선, 열차 위치, 역 도착 |
| `src/sim/graph.ts` | 도로 자료 → 차 그래프, 보행 그래프 |
| `src/sim/cars.ts` | 차 이동과 간격 유지 |
| `src/sim/walkers.ts` | 보행자 생성·이동·소멸 |
| `src/sim/cats.ts` | 고양이 배치, 시각별 상태와 위치 |
| `src/render/*.ts` | 장면, 색, 바닥, 건물, 도로, 노선·열차, 차, 보행자, 고양이, 링·글씨, 랜드마크 |
| `src/ui/hud.ts`, `src/ui/hud.css` | 사이드바, 모바일 배치, 카드 |
| `src/main.ts` | 조립과 프레임 루프 |

## 작업 1: 프로젝트 틀

- [ ] `package.json`(scripts: dev, build, preview, test=`vitest run`, bake), `tsconfig.json`, `vite.config.ts`(base `/apps/mapo/`), `index.html`, `.gitignore`.
- [ ] `pnpm install` 후 `pnpm test`, `pnpm build`가 끝까지 도는지 확인.
- [ ] `~/apps/.claude/launch.json`에 `mapo-dev`(포트 5197) 추가.

## 작업 2: 좌표와 꺾은선 (테스트 먼저)

만드는 것:

```ts
// src/geo.ts
export const ORIGIN: { lat: number; lon: number };
export const BOARD_R: number;
export function toXZ(lat: number, lon: number): [number, number];
export function toLatLon(x: number, z: number): [number, number];

// src/poly.ts — 꺾은선은 [x,y,z, x,y,z, ...] 평면 배열
export function cumLen(p: ArrayLike<number>): Float32Array;          // 각 꼭짓점까지 누적 길이
export function pointAt(p, cum, s, out): number;                     // s(m) 지점을 out[0..2]에 쓰고 구간 번호를 돌려준다
export function headingAt(p, seg): number;                           // 구간의 진행 방향(라디안)
export function nearestS(p, cum, x, z): { s: number; d: number };    // 가장 가까운 지점의 거리 값과 떨어진 거리
```

테스트: 원점은 (0,0), 북쪽으로 0.001도는 z ≈ −111m, 왕복 변환 오차 0.01m 이하. 직각으로 꺾인 선의 누적 길이, 꺾이는 지점 앞뒤의 `pointAt`, 범위 밖 s는 끝점으로 고정, `nearestS`가 선분 중간의 수선의 발을 찾는지.

## 작업 3: 자료 굽기 (테스트 먼저)

만드는 것:

```ts
// tools/lib/height.ts
export function estimateHeight(tags: Record<string, string>, area: number, id: number): number; // m
// tools/lib/elevate.ts — 교량 묶음 안에서 땅에 닿는 점까지의 거리로 높이를 정한다
export function rampHeight(distToGround: number, top: number, ramp?: number): number;
// tools/lib/raster.ts
export function fillPolygon(mask: Uint8Array, size: number, paths: number[][], ch: number): void; // 짝홀 채우기. 줄들이 합쳐서 닫혀 있으면 된다
export function strokeLine(mask: Uint8Array, size: number, line: number[], widthPx: number, ch: number): void;
export function encodePng(rgba: Uint8Array, size: number): Buffer;
// tools/lib/rail.ts
export function stitch(ways: { id: number; pts: number[][] }[]): number[][];  // 끝점이 맞닿는 조각을 한 줄로
```

테스트:
- 높이: `height=30` → 30, `building:levels=5` → 16~18, 태그 없는 `apartments` 넓은 건물 → 35 이상, 태그 없는 작은 `house` → 12 이하, 같은 id는 항상 같은 값.
- 교량: 거리 0 → 0, 80m 이상 → top, 중간은 단조 증가.
- 채우기: 사각형 안의 칸만 칠해지고, 구멍 고리 안은 비며, 캔버스 밖으로 나간 다각형도 오류 없이 잘린다.
- PNG: 서명 8바이트와 IHDR 크기 값.
- 잇기: 순서와 방향이 섞인 조각 셋이 한 줄로 이어진다.

`tools/bake.ts`는 위 함수를 써서 `board.json`과 `mask.png`를 만든다. 구운 결과 검사(`test/board.test.ts`): 건물 8,000동 이상이고 전부 판 안, 노선 4개에 각 역 2개 이상, 2호선에 y > 5인 지상 구간과 y < −5인 지하 구간이 모두 있음, 랜드마크 5개, 도로에 교량 높이가 10m 넘는 구간이 있음.

## 작업 4: 모형판 그리기 — 중간 화면 1

`render/scene.ts`(렌더러·카메라·조작·크기 변경), `render/palette.ts`(시각 → 색 묶음), `render/ground.ts`, `render/buildings.ts`, `render/roads.ts`, `render/landmarks.ts`, `render/trees.ts`. `?t=13:00`과 `?t=22:00`으로 낮·밤을 캡처해 공유한다.

확인: 한강과 녹지가 제자리에 있고, 건물이 도로를 덮지 않으며, 교량이 물 위로 떠 있고, 밤에 창문 불빛이 보인다.

## 작업 5: 시계·곡선·구역 (테스트 먼저)

```ts
// src/sim/clock.ts
export interface Now { tod: number; dow: number; doy: number }        // 자정부터 초, 요일(0 = 일), 날짜 번호
export interface Clock { now(): Now; tick(dtReal: number): void; live: boolean }
export function makeClock(search: string, nowMs?: () => number): Clock;   // ?t=HH:MM ?speed=N ?dow=0~6
// src/sim/curves.ts
export function sunAngles(tod: number, doy: number): { elev: number; azim: number };  // 해의 고도·방위(도)
export function daylight(elev: number): number;        // 0(밤) ~ 1(낮), 지평선 ±6도에서 부드럽게
export function duskiness(elev: number): number;       // 해가 지평선 근처일 때 1로 솟는 값
export function commute(tod: number): number;          // 출퇴근 봉우리 0~1
export function nightlife(tod: number): number;        // 저녁~심야 봉우리 0~1
// src/sim/provider.ts
export interface AreaStatus { id: string; name: string; level: 0 | 1 | 2 | 3; label: string; pplMin: number; pplMax: number }
export interface DataProvider {
  mode: 'sim' | 'live';
  areas(now: Now): AreaStatus[];
  roadSpeed(now: Now, cls: number, edgeKey: number): number;   // 자유 속도 대비 0.15~1
  alighting(now: Now, station: string): number;                 // 최근 5분 하차 인원
}
export function makeSimProvider(): DataProvider;
```

테스트: `?t=08:30` → 30,600초, 배속 60에서 1초 뒤 60초 증가, 자정 넘김. 한낮 `daylight` 1·새벽 3시 0. 08:30 `commute` > 0.8, 03:00 < 0.1. 홍대 관광특구는 금요일 21시가 화요일 10시보다 붐비고, 단계 경계에서 라벨이 여유·보통·약간 붐빔·붐빔으로 나온다. 08:30 큰길 속도 비율 < 03:00. 운행 시간 밖 하차 인원은 0.

## 작업 6: 열차 (테스트 먼저)

```ts
// src/sim/trains.ts
export interface LineDef { id: string; name: string; color: string; cars: number; carLen: number; p: Float32Array; cum: Float32Array; stops: number[] } // stops = 역의 거리 값(오름차순)
export interface RunProfile { dur: number; distAt(tau: number): number; arrive: number[] } // tau = 출발 뒤 초
export function makeProfile(length: number, stops: number[]): RunProfile;
export function headway(lineId: string, tod: number): number;           // 초, 운행 안 하면 0
export function departures(lineId: string, dir: 0 | 1): number[];        // 하루치 진입 시각
export interface TrainPos { line: string; dir: 0 | 1; s: number; key: number }
export function trainsAt(lines: LineDef[], tod: number): TrainPos[];
export function arrivals(lines: LineDef[], t0: number, t1: number): { line: string; dir: 0 | 1; name: string }[];
```

테스트: 주행 곡선은 단조 증가하고 역마다 25초 동안 거리가 변하지 않으며 최고 속도 22m/s를 넘지 않는다. 2호선 배차는 08:30에 180초 이하, 14:00에 그보다 길고, 03:00에는 0. `trainsAt`은 같은 시각에 같은 결과, 1초 뒤 위치 변화는 22m 이하. `arrivals(t0,t1)`을 구간을 나눠 불러도 합이 같다.

그리기: `render/rails.ts`(바닥 빛 띠, 지상 구간 교량), `render/trains.ts`(지하 = 밝은 막대, 지상 = 입체 차량).

## 작업 7: 차 (테스트 먼저)

```ts
// src/sim/graph.ts
export interface Edge { id: number; p: Float32Array; cum: Float32Array; len: number; cls: number; lanes: number; off0: number; next: number[]; nextW: number[]; entry: boolean; name: string; key: number }
export function buildCarGraph(roads: Road[]): Edge[];
export function buildWalkGraph(roads: Road[]): WalkGraph;
// src/sim/cars.ts
export interface Cars { n: number; x: Float32Array; y: Float32Array; z: Float32Array; yaw: Float32Array; brake: Float32Array; kind: Uint8Array }
export function makeCars(edges: Edge[], provider: DataProvider, seed: number, max: number): {
  cars: Cars; step(dt: number, now: Now, spawn?: boolean): void; fill(n: number): void; target(now: Now): number; meanSpeed(): number;
};
```

테스트: 양방향 도로는 방향이 반대인 구간 둘이 되고 일방통행은 하나. 구간 끝이 맞닿으면 `next`로 이어지고 유턴 구간은 빠진다. 한 줄 도로에서 300초 돌린 뒤 같은 차로의 앞뒤 간격이 4m 이상. 속도 비율이 낮으면 평균 속도가 내려가고 브레이크 값이 켜진 차가 늘어난다. 03:00의 차 수가 08:30보다 적다.

그리기: `render/cars.ts`(승용차·버스 인스턴스, 전조등·브레이크등, 밤의 빛 번짐 점).

## 작업 8: 보행자 (테스트 먼저)

```ts
// src/sim/walkers.ts
export interface Walkers { n: number; x: Float32Array; z: Float32Array; yaw: Float32Array; phase: Float32Array; fade: Float32Array; tint: Uint8Array }
export function makeWalkers(g: WalkGraph, exits: Exit[], provider: DataProvider, seed: number): {
  w: Walkers; step(dt: number, now: Now, ambient?: boolean): void; burst(station: string, count: number): void;
};
export function walkerTarget(provider: DataProvider, now: Now, max: number): number;
```

테스트: `burst('합정', 20)` 직후 새 보행자 20명이 합정 출구 15m 안에 있다. 60초 뒤에도 전원이 보행 그래프 선에서 12m 안에 있다. 금요일 21시의 목표 인원이 화요일 04시보다 많다. 최대 인원을 넘지 않는다.

그리기: `render/walkers.ts`(흰 캐릭터, 뒤뚱 걸음), `render/rings.ts`(출구 링, 역 이름 바닥 글씨).

## 작업 9: 길고양이 (테스트 먼저)

```ts
// src/sim/cats.ts
export type Coat = 'cheese' | 'calico' | 'mackerel' | 'tuxedo';
export interface CatDef { id: number; dong: string; coat: Coat; loaf: [number, number]; route: Float32Array; cum: Float32Array; eats: boolean }
export interface CatState { x: number; z: number; yaw: number; pose: number; status: string }  // pose 0 = 식빵, 1 = 걷기
export function catName(c: CatDef): string;                       // "연남동 치즈냥"
export function catAt(c: CatDef, now: Now): CatState;
export function makeCats(spots: CatSpot[], g: WalkGraph, buildings: Building[]): CatDef[];
export function feeders(cats: CatDef[]): [number, number][];   // 급식소 자리
```

테스트: 13:00에는 18마리 모두 pose 0이고 식빵 자리에 있으며 상태가 "식빵 굽는 중"·"낮잠 중"·"그루밍 중" 가운데 하나. 23:00에는 절반 이상이 pose > 0이고 전원이 자기 경로에서 3m 안. 같은 시각은 같은 결과, 1초 사이 이동 거리 1.5m 이하. 이름은 "{동} {색}냥" 꼴. 네 가지 색이 모두 쓰인다.

그리기: `render/cats.ts`(고양이 인스턴스, 색 무늬, 급식소 소품).

## 작업 10: 사이드바와 조작

`ui/hud.ts`, `ui/hud.css`: PC 320px 사이드바, 모바일 82vh/18vh와 바닥 시트. 시계, 시점 버튼 3개, 붐비는 곳 목록, 선택 카드, 광고 자리, 출처. 랜드마크는 광선으로, 고양이는 화면 거리로 고른다. 랜드마크에 마우스를 올리면 솟는다.

## 작업 11: 검증과 배포

- [ ] `pnpm test`, `pnpm build`.
- [ ] 앱 브라우저 창에서 PC·폰 크기 × 08:30·13:00·18:00·23:00. 시점 버튼, 랜드마크, 고양이를 눌러 카드 확인. 콘솔 오류 0.
- [ ] 프레임 속도 측정.
- [ ] `deploy-pages.yml`에 mapo 테스트·빌드·복사 단계 추가, `~/apps/CLAUDE.md` 앱 목록 갱신.
- [ ] 커밋·푸시 후 배포 주소에서 같은 확인.
