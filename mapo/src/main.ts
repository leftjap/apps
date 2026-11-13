import * as THREE from 'three';
import { loadBoard } from './data/board.ts';
import { makeBuildings } from './render/buildings.ts';
import { makeCarMeshes } from './render/cars.ts';
import { makeCatMeshes } from './render/cats.ts';
import { updateEnv } from './render/env.ts';
import { makeGround } from './render/ground.ts';
import { LANDMARKS, LM_COLORS, makeLandmarks } from './render/landmarks.ts';
import { makeRails } from './render/rails.ts';
import { makeGroundLabels, makeRings, type GroundLabel } from './render/rings.ts';
import { makeRoads } from './render/roads.ts';
import { makeView } from './render/scene.ts';
import { makeTrees } from './render/trees.ts';
import { makeWalkerMesh } from './render/walkers.ts';
import { makeCars } from './sim/cars.ts';
import { CAT_SPOTS, catAt, catName, feeders, makeCats } from './sim/cats.ts';
import { makeClock } from './sim/clock.ts';
import { buildCarGraph, buildWalkGraph } from './sim/graph.ts';
import { makeSimProvider } from './sim/provider.ts';
import { arrivals, trainsAt } from './sim/trains.ts';
import { makeWalkers } from './sim/walkers.ts';
import { makeHud, type Card } from './ui/hud.ts';
import './ui/hud.css';

const BASE = import.meta.env.BASE_URL;
const query = new URLSearchParams(location.search);
const canvas = document.querySelector<HTMLCanvasElement>('#view')!;
const sky = document.querySelector<HTMLElement>('#sky')!;
const small = matchMedia('(max-width: 760px)').matches;

const view = makeView(canvas);
const clock = makeClock(location.search);
const provider = makeSimProvider();
const loading = document.querySelector<HTMLElement>('#loading')!;
const [board, mask] = await Promise.all([loadBoard(BASE), new THREE.TextureLoader().loadAsync(`${BASE}data/mask.png`)]).catch((e) => {
  loading.textContent = '자료를 불러오지 못했습니다. 새로고침해 주세요.';
  throw e;
});

// ── 시뮬레이션 ──
const start = clock.now();
const walkGraph = buildWalkGraph(board.roads);
const cars = makeCars(buildCarGraph(board.roads), provider, 11, small ? 900 : 1500);
cars.fill(cars.target(start));
const walkers = makeWalkers(walkGraph, board.exits, provider, 5, small ? 800 : 1500);
for (let i = 0; i < 260; i++) walkers.step(0.2, start); // 처음부터 길에 사람이 있도록 미리 돌려 둔다
const cats = makeCats(CAT_SPOTS, walkGraph, board.buildings);

// ── 장면 ──
const roads = makeRoads(board.roads, LM_COLORS);
const landmarks = makeLandmarks(board, roads.glow);
const rails = makeRails(board.lines);
const rings = makeRings(board.exits);
const carMeshes = makeCarMeshes(small ? 900 : 1500);
const walkerMesh = makeWalkerMesh(small ? 800 : 1500);
const catMeshes = makeCatMeshes(cats, feeders(cats));
const labels: GroundLabel[] = [
  ...board.stations.map((s) => ({ text: `${s.name}역`, x: s.x, z: s.z + 30, size: 17 })),
  { text: '한강', x: -260, z: 1560, size: 130, turn: -0.05 },
  { text: '밤섬', x: 1010, z: 1600, size: 44 },
  { text: '선유도', x: -1290, z: 1250, size: 44 },
];
view.scene.add(
  makeGround(mask),
  roads.group,
  rails.group,
  rings.mesh,
  makeGroundLabels(labels),
  makeBuildings(board.buildings),
  landmarks.group,
  makeTrees(board.trees, start.doy),
  carMeshes.group,
  walkerMesh.mesh,
  catMeshes.group,
);

// ── 사이드바 ──
const hud = makeHud({
  live: clock.live,
  onPreset: (name) => view.flyTo(name),
  onClose: () => select(null),
});

hud.setClock(start);
hud.setAreas(provider.areas(start));

type Target = { kind: 'landmark'; id: string } | { kind: 'cat'; i: number };
let selected: Target | null = null;
function select(t: Target | null) {
  selected = t;
  landmarks.setSelected(t?.kind === 'landmark' ? t.id : '');
  catMeshes.setPicked(t?.kind === 'cat' ? t.i : -1);
  refreshCard();
}
const SPEED = ['막힘', '느림', '조금 느림', '원활'];
function refreshCard() {
  if (!selected) return hud.setCard(null);
  const now = clock.now();
  let card: Card;
  if (selected.kind === 'cat') {
    const c = cats[selected.i];
    card = { tag: '길고양이', title: catName(c), color: '#f2b35d', lines: [catAt(c, now).status], note: '고양이는 연출입니다. 실제 급식소 위치와는 관계없습니다.' };
  } else {
    const id = selected.id;
    const info = LANDMARKS.find((l) => l.id === id)!;
    const lines: string[] = [];
    if (info.station) lines.push(`최근 5분 하차 약 ${provider.alighting(now, info.station).toLocaleString('ko-KR')}명`);
    else if (info.kind === '한강 다리') {
      const k = provider.roadSpeed(now, 1, info.n * 31);
      lines.push(`차량 흐름 ${SPEED[k < 0.45 ? 0 : k < 0.65 ? 1 : k < 0.85 ? 2 : 3]}`);
    } else {
      const a = provider.areas(now).find((a) => a.id === 'hongdae')!;
      lines.push(`홍대 일대 ${a.label} · 약 ${a.pplMin.toLocaleString('ko-KR')}~${a.pplMax.toLocaleString('ko-KR')}명`);
    }
    card = { tag: info.kind, title: info.name, color: info.color, lines, note: info.desc };
  }
  hud.setCard(card);
}

// ── 고르기: 랜드마크는 광선으로, 고양이는 화면에서의 거리로 ──
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const proj = new THREE.Vector3();
let catStates = cats.map((c) => catAt(c, start));
function pickAt(clientX: number, clientY: number): Target | null {
  const r = canvas.getBoundingClientRect();
  const px = clientX - r.left;
  const py = clientY - r.top;
  let best = -1;
  let bd = small ? 34 : 26;
  catStates.forEach((s, i) => {
    proj.set(s.x, 1, s.z).project(view.camera);
    if (proj.z > 1) return;
    const d = Math.hypot(((proj.x + 1) / 2) * r.width - px, ((1 - proj.y) / 2) * r.height - py);
    if (d < bd) (bd = d), (best = i);
  });
  if (best >= 0) return { kind: 'cat', i: best };
  ndc.set((px / r.width) * 2 - 1, 1 - (py / r.height) * 2);
  ray.setFromCamera(ndc, view.camera);
  const hit = ray.intersectObjects(landmarks.pickables, false)[0];
  return hit ? { kind: 'landmark', id: hit.object.userData.id } : null;
}
let downAt: [number, number] | null = null;
canvas.addEventListener('pointerdown', (e) => {
  downAt = [e.clientX, e.clientY];
  view.cancelFly();
});
canvas.addEventListener('wheel', () => view.cancelFly(), { passive: true });
canvas.addEventListener('pointerup', (e) => {
  // 끌지 않고 뗀 것만 누른 것으로 본다
  if (downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) < 6) select(pickAt(e.clientX, e.clientY));
  downAt = null;
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse' || e.buttons) return;
  const t = pickAt(e.clientX, e.clientY);
  landmarks.setHover(t?.kind === 'landmark' ? t.id : '');
  canvas.style.cursor = t ? 'pointer' : '';
});
canvas.addEventListener('pointerleave', () => landmarks.setHover(''));

// 개발 중 화면 확인용 손잡이(배포본에는 들어가지 않는다)
if (import.meta.env.DEV) Object.assign(window, { __dbg: { view, cats, states: () => catStates, cars, walkers, board, select } });

// ── 프레임 ──
view.resize();
view.jumpTo(query.get('view') ?? 'all');
new ResizeObserver(() => view.resize()).observe(canvas);

loading.remove();
let last = performance.now();
let time = 0;
let prevTod = start.tod;
let hudAge = Infinity;
let frames = 0;
let fpsAt = last;
function frame(t: number) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  time += dt;
  clock.tick(dt);
  const now = clock.now();

  // 열차가 역에 서면 출구에서 사람들이 나온다
  for (const a of arrivals(board.lines, prevTod, now.tod)) {
    walkers.burst(a.name, Math.max(1, Math.min(14, Math.round(provider.alighting(now, a.name) / 150))));
    rings.flash(a.name);
  }
  prevTod = now.tod;
  cars.step(dt, now);
  walkers.step(dt, now);
  catStates = cats.map((c) => catAt(c, now));

  updateEnv(now, time, sky);
  rails.update(trainsAt(board.lines, now.tod));
  carMeshes.update(cars.cars);
  walkerMesh.update(walkers.w);
  catMeshes.update(catStates);
  rings.update(dt);
  landmarks.update(dt);
  view.update(dt);
  view.renderer.render(view.scene, view.camera);

  hudAge += dt;
  if (hudAge > 1) {
    hudAge = 0;
    hud.setClock(now);
    hud.setAreas(provider.areas(now));
    refreshCard();
  }
  if (import.meta.env.DEV) {
    frames++;
    if (t - fpsAt > 2000) {
      Object.assign(window, { __mapo: { fps: (frames * 1000) / (t - fpsAt), cars: cars.cars.n, walkers: walkers.w.n } });
      frames = 0;
      fpsAt = t;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
