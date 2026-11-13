// 렌더러·카메라·조작. 카메라는 판을 벗어나지 않고 땅 아래로 내려가지 않는다.
import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';
import { BOARD_R } from '../geo.ts';
import { env } from './env.ts';

export interface Preset {
  target: [number, number];
  /** 0이면 판 전체가 들어오는 거리 */
  dist: number;
  /** 수직에서 기운 각(도) */
  tilt: number;
  /** 북쪽을 위로 둔 상태에서 돌린 각(도) */
  turn: number;
}

export const PRESETS: Record<string, Preset> = {
  all: { target: [0, 120], dist: 0, tilt: 55, turn: -14 },
  hongdae: { target: [470, -640], dist: 1150, tilt: 58, turn: 28 },
  river: { target: [-140, 930], dist: 2300, tilt: 66, turn: -42 },
};

const FOV = 32;

export function makeView(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FOV, 1, 20, 40000);
  const controls = new MapControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.zoomToCursor = true;
  controls.minDistance = 70;
  controls.maxDistance = 16000;
  controls.maxPolarAngle = (80 * Math.PI) / 180;
  controls.rotateSpeed = 0.6;

  const fitDist = () => {
    const half = Math.atan(Math.tan((FOV * Math.PI) / 360) * camera.aspect);
    return Math.min(15000, (BOARD_R * 1.12) / Math.tan(half)); // 기울여 보면 앞쪽이 넓게 잡히므로 여유를 둔다
  };
  const place = (p: Preset, out: { target: THREE.Vector3; pos: THREE.Vector3 }) => {
    const d = p.dist || fitDist();
    const tilt = (p.tilt * Math.PI) / 180;
    const turn = (p.turn * Math.PI) / 180;
    out.target.set(p.target[0], 0, p.target[1]);
    out.pos.set(p.target[0] + d * Math.sin(tilt) * Math.sin(turn), d * Math.cos(tilt), p.target[1] + d * Math.sin(tilt) * Math.cos(turn));
  };

  let fly: { t: number; from: { target: THREE.Vector3; pos: THREE.Vector3 }; to: { target: THREE.Vector3; pos: THREE.Vector3 } } | null = null;
  const tmp = { target: new THREE.Vector3(), pos: new THREE.Vector3() };
  /** 따라가기: 매 프레임 대상 위치를 묻고, 보는 거리를 dist 로 천천히 맞춘다 */
  let follow: { get: () => THREE.Vector3 | null; dist: number; sync: boolean; t: number } | null = null;
  /** 따라가기를 시작하면 처음 3초 동안 이 각도(수직에서 기운 각)로 세워 건물에 덜 가리게 한다 */
  const FOLLOW_TILT = (26 * Math.PI) / 180;
  const sph = new THREE.Spherical();
  /** 드론 산책: 닫힌 곡선을 따라 보는 지점을 옮기고 카메라는 그 뒤에서 따라간다 */
  let drone: { curve: THREE.CatmullRomCurve3; u: number; t: number; turn: number; blend: number } | null = null;
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const ease = (rate: number, dt: number) => 1 - Math.exp(-rate * dt);

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    env.uProjK.value = h / (2 * Math.tan((FOV * Math.PI) / 360));
  }

  return {
    renderer,
    scene,
    camera,
    controls,
    resize,
    jumpTo(name: string) {
      place(PRESETS[name], tmp);
      controls.target.copy(tmp.target);
      camera.position.copy(tmp.pos);
      controls.update();
    },
    /** (x, z)를 보는 지점으로, 지금 돌린 방향은 그대로 두고 거리·기울기만 바꿔 날아간다 */
    flyAt(x: number, z: number, dist: number, tiltDeg: number) {
      const off = v1.subVectors(camera.position, controls.target);
      const turn = Math.atan2(off.x, off.z);
      const tilt = (tiltDeg * Math.PI) / 180;
      const to = { target: new THREE.Vector3(x, 0, z), pos: new THREE.Vector3(x + dist * Math.sin(tilt) * Math.sin(turn), dist * Math.cos(tilt), z + dist * Math.sin(tilt) * Math.cos(turn)) };
      fly = { t: 0, from: { target: controls.target.clone(), pos: camera.position.clone() }, to };
      follow = null;
      drone = null;
    },
    flyTo(name: string) {
      const to = { target: new THREE.Vector3(), pos: new THREE.Vector3() };
      place(PRESETS[name], to);
      fly = { t: 0, from: { target: controls.target.clone(), pos: camera.position.clone() }, to };
    },
    update(dt: number) {
      if (follow) {
        const p = follow.get();
        if (!p) follow = null;
        else {
          v1.copy(controls.target);
          controls.target.x += (p.x - controls.target.x) * ease(5, dt);
          controls.target.z += (p.z - controls.target.z) * ease(5, dt);
          camera.position.add(v2.subVectors(controls.target, v1));
          const off = v1.subVectors(camera.position, controls.target);
          if (follow.sync) (follow.dist = off.length()), (follow.sync = false);
          off.setLength(off.length() + (follow.dist - off.length()) * ease(1.6, dt));
          follow.t += dt;
          if (follow.t < 3) {
            sph.setFromVector3(off);
            sph.phi += (FOLLOW_TILT - sph.phi) * ease(2, dt);
            off.setFromSpherical(sph);
          }
          camera.position.copy(controls.target).add(off);
        }
      }
      if (drone) {
        const d = drone;
        d.t += dt;
        d.blend = Math.min(1, d.blend + dt / 4);
        d.u = (d.u + (20 * dt) / d.curve.getLength()) % 1;
        const p = d.curve.getPointAt(d.u, v1);
        const tan = d.curve.getTangentAt(d.u, v2);
        // 진행 방향 뒤에서, 조금씩 좌우로 흔들리며 본다
        const want = Math.atan2(-tan.x, -tan.z) + 0.45 * Math.sin(d.t * 0.045);
        let diff = want - d.turn;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        d.turn += diff * ease(0.35, dt);
        const dist = 720 + 260 * Math.sin(d.t * 0.06);
        const tilt = ((60 + 6 * Math.sin(d.t * 0.04)) * Math.PI) / 180;
        tmp.target.set(p.x, 0, p.z);
        tmp.pos.set(p.x + dist * Math.sin(tilt) * Math.sin(d.turn), dist * Math.cos(tilt), p.z + dist * Math.sin(tilt) * Math.cos(d.turn));
        const k = d.blend < 1 ? ease(1.2, dt) : 1;
        controls.target.lerp(tmp.target, k);
        camera.position.lerp(tmp.pos, k);
      }
      if (fly) {
        fly.t = Math.min(1, fly.t + dt / 1.5);
        const k = fly.t < 0.5 ? 4 * fly.t ** 3 : 1 - (-2 * fly.t + 2) ** 3 / 2;
        controls.target.lerpVectors(fly.from.target, fly.to.target, k);
        camera.position.lerpVectors(fly.from.pos, fly.to.pos, k);
        if (fly.t >= 1) fly = null;
      }
      controls.update();
      // 보는 지점이 판 밖으로 나가지 않게 한다
      const r = Math.hypot(controls.target.x, controls.target.z);
      if (r > BOARD_R) {
        const k = BOARD_R / r;
        const dx = controls.target.x * (k - 1);
        const dz = controls.target.z * (k - 1);
        controls.target.x += dx;
        controls.target.z += dz;
        camera.position.x += dx;
        camera.position.z += dz;
      }
      controls.target.y = 0;
      if (camera.position.y < 25) camera.position.y = 25;
      // 안개는 보는 거리에 맞춘다: 멀리서 전체를 볼 때도, 가까이서 볼 때도 먼 쪽만 살짝 흐려진다
      env.uFogK.value = 1 / (camera.position.distanceTo(controls.target) * 2.2 + 6000);
    },
    /** 사용자가 직접 움직이면 날아가던 것을 멈춘다 */
    cancelFly() {
      fly = null;
    },
    follow(get: () => THREE.Vector3 | null, dist: number) {
      fly = null;
      drone = null;
      follow = { get, dist, sync: false, t: 0 };
    },
    unfollow() {
      follow = null;
    },
    get following() {
      return !!follow;
    },
    /** 따라가는 중에 휠로 거리를 바꾸면 그 거리를 새 목표로 삼는다 */
    keepZoom() {
      if (follow) follow.sync = true;
    },
    startDrone(points: [number, number][]) {
      fly = null;
      follow = null;
      const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
      // 지금 보는 곳에서 가장 가까운 지점부터 시작한다
      let u = 0;
      let best = Infinity;
      for (let k = 0; k < 200; k++) {
        const d = curve.getPointAt(k / 200, v1).distanceTo(controls.target);
        if (d < best) (best = d), (u = k / 200);
      }
      const off = v2.subVectors(camera.position, controls.target);
      drone = { curve, u, t: 0, turn: Math.atan2(off.x, off.z), blend: 0 };
    },
    stopDrone() {
      drone = null;
    },
    get droning() {
      return !!drone;
    },
    /** 보는 지점까지의 거리 */
    viewDist: () => camera.position.distanceTo(controls.target),
  };
}

export type View = ReturnType<typeof makeView>;
