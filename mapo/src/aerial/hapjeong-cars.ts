import * as THREE from 'three';
import { makeCarMeshes } from '../render/cars.ts';
import { makeWalkerMesh } from '../render/walkers.ts';
import { env, updateEnv } from '../render/env.ts';
import { pointAt } from '../poly.ts';
import { GREEN, LEFT, RED, RIGHT, STRAIGHT, YELLOW } from '../sim/intersection/index.ts';
import type { HapjeongCars } from './hapjeong-car-graph.ts';
import { carPlayback, type HapjeongDemand } from './hapjeong-car-playback.ts';
import type { HapjeongPeopleInput } from './hapjeong-people.ts';

const colors = [0x56eb8b, 0xffcb56, 0xff5656];
const names = ['초록', '노랑', '빨강'];

export function attachHapjeongSimulation(model: THREE.Scene, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement,
                                         data: HapjeongCars, render: () => void, query: URLSearchParams,
                                         carsEnabled: boolean, people?: HapjeongPeopleInput, demand?: HapjeongDemand) {
  const seeded = query.get('seeded') === '1';
  const run = carPlayback(data, !seeded, people, carsEnabled, demand);
  const { edges, inter: { X, S } } = run.graph;
  const mesh = carsEnabled ? makeCarMeshes(run.max) : undefined;
  const capacity = run.people()?.w.x.length;
  const walkers = capacity ? makeWalkerMesh(capacity) : undefined;
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
  if (mesh) model.add(mesh.group);
  if (walkers) model.add(walkers.mesh, walkers.flash);
  const walkBulb = new THREE.OctahedronGeometry(.47);
  const walkOutline = new THREE.EdgesGeometry(walkBulb);
  const white = new THREE.LineBasicMaterial({color:0xf3f9ff});
  const walkLamps = (run.crossings?.graph.links ?? []).flatMap(link => {
    if (!data.crosswalks[link.xw].sig) return [];
    const material = new THREE.MeshBasicMaterial();
    for (const [x, z] of [[link.pax, link.paz], [link.pbx, link.pbz]]) {
      const lamp = new THREE.Mesh(walkBulb, material);
      lamp.position.set(x, 1.6, z);
      lamp.add(new THREE.LineSegments(walkOutline,white));
      model.add(lamp);
    }
    return [{ xw: link.xw, material }];
  });

  const controls = document.querySelector<HTMLElement>('#trial-controls')!;
  const seek = document.querySelector<HTMLInputElement>('#trial-time')!;
  const status = document.querySelector<HTMLOutputElement>('#trial-status')!;
  const explanation = document.querySelector<HTMLElement>('#trial-explanation')!;
  const play = document.querySelector<HTMLButtonElement>('#trial-play')!;
  const replay = document.querySelector<HTMLButtonElement>('#trial-replay')!;
  const pedestrianStatus = document.querySelector<HTMLOutputElement>('#pedestrian-status')!;
  pedestrianStatus.hidden = !people;
  controls.hidden = false;
  seek.step = 'any';
  seek.max = String(run.duration);
  explanation.textContent = people?.signalTest ? '복합 신호 시험 · 차량 원형, 보행 흰 테두리 마름모'
    : people && carsEnabled ? '차와 사람 · 같은 시간과 모의 신호'
    : carsEnabled ? '승용차와 버스 · 합정 중앙 모의 신호' : '보행 · 합정 중앙 모의 신호';

  let t = Math.max(0, Math.min(run.duration, Number(query.get('at')) || 0));
  let playing = false;
  let animation = 0, last = 0;
  function refresh() {
    const state = run.at(t);
    const now = run.clock(t);
    updateEnv(now, t, shade);
    env.uProjK.value = canvas.height * camera.projectionMatrix.elements[5] / 2;
    mesh?.update(state.cars, 0, camera);
    const walk = run.people();
    if (walk) {
      walkers?.update(walk.w, camera);
      let waiting = 0, crossing = 0;
      for (let i = 0; i < walk.w.n; i++) {
        const { mode } = walk.stateOf(i);
        waiting += Number(mode === walk.MODES.WAITX);
        crossing += Number(mode === walk.MODES.CROSS);
      }
      pedestrianStatus.value = `보행 ${walk.w.n}명 · 횡단 대기 ${waiting}명 · 횡단 중 ${crossing}명`;
      Object.assign(pedestrianStatus.dataset, { total: walk.w.n, waiting, crossing });
    }
    for (const lamp of walkLamps) lamp.material.color.setHex(colors[S.walkState(lamp.xw, now.tod)]);
    const byGroup = [RED, RED] as number[];
    const green = new Set<string>();
    for (const { a, light, movement } of lamps) {
      const state = S.moveState(a, movement, now.tod);
      light.material.color.setHex(colors[state]);
      byGroup[a.group] = Math.min(byGroup[a.group], state);
      if (state===GREEN) green.add(`${a.group ? '교차축' : '양화로'} ${movement===LEFT?'좌회전':movement===RIGHT?'우회전':'직진'}`);
    }
    seek.value = String(t);
    status.value = `${t.toFixed(1)}초 · 차량 ${state.cars.n}대 · 신호 0 ${names[byGroup[0]]} / 신호 1 ${names[byGroup[1]]}`;
    status.dataset.cars = String(state.cars.n);
    status.dataset.vehicleGreen = [...green].sort().join(' · ') || '없음';
    status.dataset.walkGreen = [...new Set(walkLamps.filter(l=>S.walkState(l.xw,now.tod)===GREEN)
      .map(l=>data.crosswalks[l.xw].id.slice(-4)))].sort().join(' · ') || '없음';
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
