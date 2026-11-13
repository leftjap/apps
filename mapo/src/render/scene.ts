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
    flyTo(name: string) {
      const to = { target: new THREE.Vector3(), pos: new THREE.Vector3() };
      place(PRESETS[name], to);
      fly = { t: 0, from: { target: controls.target.clone(), pos: camera.position.clone() }, to };
    },
    update(dt: number) {
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
  };
}

export type View = ReturnType<typeof makeView>;
