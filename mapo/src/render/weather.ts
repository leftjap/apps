// 빗줄기와 눈송이. 카메라가 보는 지점 둘레의 상자 안에서 떨어지는 짧은 선(비)과 둥근 점(눈)을 셰이더로 움직인다.
// 상자 크기는 보는 거리에 맞춰 바뀌므로 멀리서 보든 가까이서 보든 비슷한 밀도로 보인다.
import * as THREE from 'three';
import { material, weather } from './env.ts';

export function makeRain(count = 6000) {
  const seed = new Float32Array(count * 2 * 4);
  for (let i = 0; i < count; i++) {
    const r = [Math.random(), Math.random(), Math.random(), 0];
    seed.set(r, i * 8);
    seed.set([r[0], r[1], r[2], 1], i * 8 + 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 6), 3));
  g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  const uniforms = { uCenter: { value: new THREE.Vector3() }, uSize: { value: 500 } };
  const mesh = new THREE.LineSegments(
    g,
    material({
      transparent: true,
      depthWrite: false,
      uniforms,
      vertex: /* glsl */ `
        attribute vec4 aSeed; uniform vec3 uCenter; uniform float uSize;
        varying float vA;
        void main() {
          float h = uSize * 1.2;
          float y = mod(aSeed.y * h - uTime * uSize * 0.9, h);
          vec3 p = vec3(uCenter.x + (aSeed.x - 0.5) * 2.0 * uSize, y, uCenter.z + (aSeed.z - 0.5) * 2.0 * uSize);
          p += aSeed.w * vec3(0.12, 1.0, 0.05) * uSize * 0.035;
          vA = smoothstep(0.0, 0.15, y / h) * (1.0 - smoothstep(0.8, 1.0, y / h));
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragment: /* glsl */ `
        varying float vA;
        void main() {
          vec3 c = mix(vec3(0.55, 0.62, 0.72), vec3(0.75, 0.82, 0.95), uNight);
          gl_FragColor = vec4(c, vA * 0.42 * uRain);
        }`,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 6;
  // 눈송이: 느리게 떨어지며 옆으로 흔들리는 흰 점. 화면에서 2px 보다 작아지지 않는다
  const flakes = Math.floor(count / 2);
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flakes * 3), 3));
  fg.setAttribute('aSeed', new THREE.BufferAttribute(seed.slice(0, flakes * 4), 4));
  const snowU = { uCenter: uniforms.uCenter, uSize: uniforms.uSize, uSnow: { value: 0 } };
  const snow = new THREE.Points(
    fg,
    material({
      transparent: true,
      depthWrite: false,
      uniforms: snowU,
      vertex: /* glsl */ `
        attribute vec4 aSeed; uniform vec3 uCenter; uniform float uSize;
        varying float vA;
        void main() {
          float h = uSize * 1.2;
          float y = mod(aSeed.y * h - uTime * uSize * 0.05, h);
          vec3 p = vec3(uCenter.x + (aSeed.x - 0.5) * 2.0 * uSize, y, uCenter.z + (aSeed.z - 0.5) * 2.0 * uSize);
          p.x += sin(uTime * 0.9 + aSeed.z * 40.0) * uSize * 0.012;
          p.z += cos(uTime * 0.7 + aSeed.x * 31.0) * uSize * 0.008;
          vA = smoothstep(0.0, 0.1, y / h) * (1.0 - smoothstep(0.85, 1.0, y / h));
          vec4 cv = viewMatrix * vec4(p, 1.0);
          gl_PointSize = clamp(uSize * 0.004 * uProjK / max(1.0, -cv.z), 2.0, 6.0);
          gl_Position = projectionMatrix * cv;
        }`,
      fragment: /* glsl */ `
        uniform float uSnow;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(vec3(0.97), vA * uSnow * smoothstep(0.5, 0.25, d));
        }`,
    }),
  );
  snow.frustumCulled = false;
  snow.renderOrder = 6;
  const group = new THREE.Group();
  group.add(mesh, snow);
  return {
    mesh: group,
    update(target: THREE.Vector3, viewDist: number) {
      mesh.visible = (mesh.material as THREE.ShaderMaterial).uniforms.uRain.value > 0.01;
      snow.visible = weather.snow > 0.01;
      snowU.uSnow.value = Math.min(1, weather.snow * 1.5);
      uniforms.uCenter.value.set(target.x, 0, target.z);
      uniforms.uSize.value = Math.max(60, viewDist * 0.42);
    },
  };
}
