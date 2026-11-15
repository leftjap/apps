// 돌발정보(사고·공사·통제) 표시: 핀·말풍선 없이 도로 위 작은 점멸등과, 공사면 라바콘 몇 개만 둔다.
// 한 차로 막기는 주황 점멸등 하나(공사면 그 앞에 라바콘 넷이 비스듬히 차로를 막는다), 통제는 차로들을 가로지르는 빨간 점멸등 셋.
// 점멸은 1.2초에 한 번 천천히 밝아졌다 어두워지며, 자리마다 박자를 조금씩 어긋나게 한다.
import * as THREE from 'three';
import { material } from './env.ts';

export interface IncidentMark {
  id: string;
  x: number;
  z: number;
  /** 진행 방향 */
  yaw: number;
  /** 차로를 가로지르는 폭(m, 통제 점멸등을 늘어놓는 너비) */
  width: number;
  effect: 'close' | 'lane';
  /** 공사면 라바콘을 둔다 */
  cones: boolean;
}

const MAX_LIGHTS = 96;
const MAX_CONES = 96;

export function makeIncidents() {
  const group = new THREE.Group();
  // 점멸등: 화면에서 6~14px 의 둥근 빛
  const lg = new THREE.BufferGeometry();
  const pos = new Float32Array(MAX_LIGHTS * 3);
  const col = new Float32Array(MAX_LIGHTS * 4); // rgb + 박자
  lg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  lg.setAttribute('aCol', new THREE.BufferAttribute(col, 4));
  lg.setDrawRange(0, 0);
  const lights = new THREE.Points(
    lg,
    material({
      transparent: true,
      additive: true,
      depthWrite: false,
      vertex: /* glsl */ `
        attribute vec4 aCol;
        varying vec3 vC; varying float vB;
        void main() {
          vC = aCol.rgb;
          float t = fract(uTime / 1.2 + aCol.a);
          vB = 0.35 + 0.65 * smoothstep(0.0, 0.25, t) * (1.0 - smoothstep(0.45, 0.8, t));
          vec4 cv = viewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(1.4 * uProjK / max(1.0, -cv.z), 6.0, 14.0);
          gl_Position = projectionMatrix * cv;
        }`,
      fragment: /* glsl */ `
        varying vec3 vC; varying float vB;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float core = smoothstep(0.45, 0.2, d);
          float halo = smoothstep(1.0, 0.3, d) * 0.45;
          gl_FragColor = vec4(mix(vC, vec3(1.0), core * 0.5) * vB, (core + halo) * vB);
        }`,
    }),
  );
  lights.frustumCulled = false;
  lights.renderOrder = 7;
  // 라바콘: 주황 원뿔(위쪽에 흰 띠)
  const cone = new THREE.ConeGeometry(0.3, 0.9, 10).translate(0, 0.45, 0);
  const cones = new THREE.InstancedMesh(
    cone,
    material({
      vertex: /* glsl */ `
        varying vec3 vN; varying vec3 vW; varying float vH;
        void main() {
          vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
          vW = w.xyz; vH = position.y;
          vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragment: /* glsl */ `
        varying vec3 vN; varying vec3 vW; varying float vH;
        void main() {
          vec3 alb = (vH > 0.5 && vH < 0.65) ? vec3(0.95) : vec3(0.98, 0.42, 0.08);
          vec3 c = lit(alb, normalize(vN)) + alb * 0.25 * uNight;
          gl_FragColor = vec4(fogged(c, distance(vW, cameraPosition)), 1.0);
        }`,
    }),
    MAX_CONES,
  );
  cones.count = 0;
  cones.frustumCulled = false;
  group.add(lights, cones);

  const m = new THREE.Matrix4();
  const AMBER = [1.0, 0.62, 0.12];
  const RED = [1.0, 0.22, 0.16];
  /** 고를 수 있는 자리(돌발 하나에 한 점) */
  let spots: { x: number; y: number; z: number; id: string }[] = [];

  function set(list: IncidentMark[]) {
    let n = 0;
    let c = 0;
    spots = [];
    const light = (x: number, z: number, rgb: number[], phase: number) => {
      if (n >= MAX_LIGHTS) return;
      pos.set([x, 1.1, z], n * 3);
      col.set([...rgb, phase], n * 4);
      n++;
    };
    for (const q of list) {
      const fx = Math.cos(q.yaw);
      const fz = Math.sin(q.yaw);
      // 오른쪽 방향(−sin, cos)
      const rx = -fz;
      const rz = fx;
      const phase = (q.x * 0.013 + q.z * 0.007) % 1;
      if (q.effect === 'close') {
        for (const k of [-1, 0, 1]) light(q.x + rx * k * q.width * 0.35, q.z + rz * k * q.width * 0.35, RED, phase + k * 0.17);
      } else {
        light(q.x, q.z, AMBER, phase);
        if (q.cones)
          for (let k = 0; k < 4 && c < MAX_CONES; k++) {
            // 뒤쪽 12m 의 바깥 가장자리에서 시작해 점멸등 자리의 안쪽 가장자리까지 차로를 비스듬히 가로지른다
            const back = 12 - k * 4;
            const side = 1.4 - k * 0.93;
            m.makeTranslation(q.x - fx * back + rx * side, 0, q.z - fz * back + rz * side);
            cones.setMatrixAt(c++, m);
          }
      }
      if (!spots.some((s) => s.id === q.id)) spots.push({ x: q.x, y: 1.1, z: q.z, id: q.id });
    }
    lg.setDrawRange(0, n);
    (lg.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (lg.getAttribute('aCol') as THREE.BufferAttribute).needsUpdate = true;
    cones.count = c;
    cones.instanceMatrix.needsUpdate = true;
    group.visible = n > 0;
  }
  return {
    group,
    set,
    get spots() {
      return spots;
    },
  };
}
