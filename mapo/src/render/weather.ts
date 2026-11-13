// 빗줄기. 카메라가 보는 지점 둘레의 상자 안에서 떨어지는 짧은 선들을 셰이더로 움직인다.
// 상자 크기는 보는 거리에 맞춰 바뀌므로 멀리서 보든 가까이서 보든 비슷한 밀도로 보인다.
import * as THREE from 'three';
import { material } from './env.ts';

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
  return {
    mesh,
    update(target: THREE.Vector3, viewDist: number) {
      mesh.visible = (mesh.material as THREE.ShaderMaterial).uniforms.uRain.value > 0.01;
      uniforms.uCenter.value.set(target.x, 0, target.z);
      uniforms.uSize.value = Math.max(60, viewDist * 0.42);
    },
  };
}
