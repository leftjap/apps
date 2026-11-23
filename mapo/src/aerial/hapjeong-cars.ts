import * as THREE from 'three';
import { makeCarMeshes } from '../render/cars.ts';
import { env, updateEnv } from '../render/env.ts';
import { pointAt } from '../poly.ts';
import { GREEN, LEFT, RED, RIGHT, STRAIGHT, YELLOW } from '../sim/intersection/index.ts';
import type { HapjeongCars } from './hapjeong-car-graph.ts';
import { carPlayback } from './hapjeong-car-playback.ts';

const colors = [0x56eb8b, 0xffcb56, 0xff5656];
const names = ['초록', '노랑', '빨강'];

export function attachHapjeongCars(model: THREE.Scene, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement,
                                   data: HapjeongCars, render: () => void, query: URLSearchParams) {
  const seeded = query.get('seeded') === '1';
  const run = carPlayback(data, !seeded);
  const { edges, inter: { X, S } } = run.graph;
  const mesh = makeCarMeshes(run.max);
  const shade = document.createElement('div');
  const bulb = new THREE.SphereGeometry(.75, 12, 8);
  const lamps = [...S.approach].filter(([id, a]) => X.exits.get(id)?.length && a.moves).map(([id, a]) => {
    const e = edges[id];
    const xyz = [0, 0, 0];
    pointAt(e.p, e.cum, e.len - a.setback, xyz);
    const light = new THREE.Mesh(bulb, new THREE.MeshBasicMaterial());
    light.position.set(xyz[0], 4.5, xyz[2]);
    model.add(light);
    const movement = [STRAIGHT, LEFT, RIGHT].find(m => a.moves & m) ?? STRAIGHT;
    return { a, light, movement };
  });
  model.add(mesh.group);

  const controls = document.querySelector<HTMLElement>('#trial-controls')!;
  const seek = document.querySelector<HTMLInputElement>('#trial-time')!;
  const status = document.querySelector<HTMLOutputElement>('#trial-status')!;
  const explanation = document.querySelector<HTMLElement>('#trial-explanation')!;
  const play = document.querySelector<HTMLButtonElement>('#trial-play')!;
  const replay = document.querySelector<HTMLButtonElement>('#trial-replay')!;
  controls.hidden = false;
  seek.step = 'any';
  seek.max = String(run.duration);
  explanation.textContent = seeded ? '승용차와 버스 지정 출발 · 합정 중앙 모의 신호'
    : '승용차와 버스 · 12초부터 자동 진입 · 합정 중앙 모의 신호';

  let t = Math.max(0, Math.min(run.duration, Number(query.get('at')) || 0));
  let playing = false;
  let animation = 0, last = 0;
  function refresh() {
    const state = run.at(t);
    const now = run.clock(t);
    updateEnv(now, t, shade);
    env.uProjK.value = canvas.height * camera.projectionMatrix.elements[5] / 2;
    mesh.update(state.cars, 0, camera);
    const byGroup = [RED, RED] as number[];
    for (const { a, light, movement } of lamps) {
      const state = S.moveState(a, movement, now.tod);
      light.material.color.setHex(colors[state]);
      byGroup[a.group] = Math.min(byGroup[a.group], state);
    }
    seek.value = String(t);
    status.value = `${t.toFixed(1)}초 · 차량 ${state.cars.n}대 · 신호 0 ${names[byGroup[0]]} / 신호 1 ${names[byGroup[1]]}`;
    render();
  }
  function pause() {
    cancelAnimationFrame(animation);
    playing = false;
    play.textContent = '재생';
  }
  function tick(stamp: number) {
    if (last) t = Math.min(run.duration, t + (stamp - last) / 1000);
    last = stamp;
    refresh();
    if (t >= run.duration) pause();
    else animation = requestAnimationFrame(tick);
  }
  function start() {
    if (t >= run.duration) t = 0;
    playing = true;
    last = 0;
    play.textContent = '일시정지';
    animation = requestAnimationFrame(tick);
  }
  seek.oninput = () => { pause(); t = Number(seek.value); refresh(); };
  play.onclick = () => playing ? pause() : start();
  replay.onclick = () => { pause(); t = 0; refresh(); start(); };
  refresh();
  if (query.get('paused') !== '1') start();
  return refresh;
}
