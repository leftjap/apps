// 바닥 원판. 마스크(빨강 = 물, 초록 = 녹지, 파랑 = 건물 그늘)를 읽어 칠한다. 옆면에 두께를 준다.
import * as THREE from 'three';
import { BOARD_R } from '../geo.ts';
import { material, pal } from './env.ts';

export function makeGround(mask: THREE.Texture): THREE.Group {
  mask.flipY = false;
  mask.colorSpace = THREE.NoColorSpace;
  mask.minFilter = THREE.LinearMipmapLinearFilter;
  mask.magFilter = THREE.LinearFilter;
  mask.anisotropy = 4;

  const top = new THREE.Mesh(
    new THREE.CircleGeometry(BOARD_R, 160).rotateX(-Math.PI / 2),
    material({
      uniforms: { uMask: { value: mask }, uLand: { value: pal.land }, uWater: { value: pal.water }, uGreen: { value: pal.green } },
      vertex: /* glsl */ `
        varying vec3 vW; varying float vDist;
        void main() {
          vW = position;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform sampler2D uMask; uniform vec3 uLand, uWater, uGreen;
        varying vec3 vW; varying float vDist;
        void main() {
          vec4 m = texture2D(uMask, (vW.xz + 2048.0) / 4096.0);
          float water = smoothstep(0.35, 0.65, m.r);
          float green = smoothstep(0.3, 0.7, m.g) * (1.0 - water);
          vec3 land = mix(uLand, uGreen, green);
          land *= 1.0 - 0.22 * m.b * (1.0 - 0.6 * green);
          // 물결: 느리게 흐르는 두 줄무늬의 곱
          float w1 = sin(vW.x * 0.021 + uTime * 0.55 + sin(vW.z * 0.013) * 2.4);
          float w2 = sin(vW.z * 0.034 - uTime * 0.4 + sin(vW.x * 0.009 + uTime * 0.08) * 3.0);
          float rip = w1 * w2;
          vec3 wat = uWater * (1.0 + 0.06 * rip);
          wat += uNight * vec3(0.55, 0.6, 0.8) * pow(max(rip, 0.0), 5.0) * 0.10;
          wat += uDusk * vec3(1.0, 0.55, 0.3) * pow(max(rip, 0.0), 3.0) * 0.16;
          // 물가에 얇은 그늘
          float bank = smoothstep(0.12, 0.5, m.r) * (1.0 - smoothstep(0.5, 0.88, m.r));
          vec3 col = mix(land, wat, water) * (1.0 - 0.14 * bank);
          col = lit(col, vec3(0.0, 1.0, 0.0));
          // 판 가장자리 테두리
          col *= 1.0 + 0.07 * smoothstep(${(BOARD_R - 16).toFixed(1)}, ${(BOARD_R - 9).toFixed(1)}, length(vW.xz));
          col = mix(col, col * 0.28 + vec3(0.012, 0.02, 0.035), focusIn(vW.xz) * 0.88);  // 지하 들여다보기: 땅을 어둡게
          gl_FragColor = vec4(fogged(col, vDist), 1.0);
        }`,
    }),
  );
  top.renderOrder = -10;

  const side = new THREE.Mesh(
    new THREE.CylinderGeometry(BOARD_R, BOARD_R * 0.988, 90, 160, 1, true).translate(0, -45, 0),
    material({
      uniforms: { uSkirt: { value: pal.skirt } },
      vertex: /* glsl */ `
        varying vec3 vN; varying float vY; varying float vDist;
        void main() {
          vN = normal; vY = position.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDist = -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragment: /* glsl */ `
        uniform vec3 uSkirt; varying vec3 vN; varying float vY; varying float vDist;
        void main() {
          vec3 col = uSkirt * mix(0.62, 1.0, smoothstep(-90.0, 0.0, vY));
          col *= 1.0 + 0.10 * step(-5.0, vY);
          gl_FragColor = vec4(fogged(lit(col, normalize(vN)), vDist), 1.0);
        }`,
    }),
  );
  const g = new THREE.Group();
  g.add(top, side);
  return g;
}
