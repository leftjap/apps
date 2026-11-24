import * as THREE from 'three';
import { insetEdges } from '../render/buildings.ts';

type Point = [number, number];
export type Face = Point[][];
type Paint = { roof: string; wall: string; style: 'low' | 'urban' | 'glass'; street?: number[] };
export type SurveyBuilding = { height: number; floors: number; faces: Face[]; appearance?: Paint[] };
type Batch = { positions: number[]; colors: number[]; facades?: number[] };
type BuildingOptions = { chunkSize?: number; detail?: boolean; facadeFade?: { value: number } };

const fallback: Paint = { roof: '#d9cbbc', wall: '#b2a79a', style: 'low' };
const PARAPET = .22;
const CHUNK = 96;
let sharedDistrictPatterns: THREE.DataArrayTexture | undefined;

export function groundShape([outer, ...holes]: Face) {
  const vector = (ring: Point[]) => ring.map(([x,z]) => new THREE.Vector2(x,-z));
  const shape = new THREE.Shape(vector(outer));
  shape.holes = holes.map(ring => new THREE.Path(vector(ring)));
  return shape;
}

function windowPatterns() {
  const size = 64;
  const shapes = [[.19,.32,.81], [.12,.20,.92], [.045,.14,.87]];
  const pixels = new Uint8Array(size*size*4*shapes.length);
  for (const [layer, [side,sill,head]] of shapes.entries()) {
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = (x+.5)/size, v = (y+.5)/size;
      const at = ((layer*size+y)*size+x)*4;
      pixels[at] = u >= side && u <= 1-side && v >= sill && v <= head ? 255 : 0;
      pixels[at+1] = Math.round(255*THREE.MathUtils.smoothstep(v,sill,head));
      pixels[at+3] = 255;
    }
  }
  const texture = new THREE.DataArrayTexture(pixels, size, size, shapes.length);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function material(facadeFade?: { value: number }) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const patterns = facadeFade ? sharedDistrictPatterns ??= windowPatterns() : windowPatterns();
  mat.onBeforeCompile = shader => {
    shader.uniforms.facadePatterns = { value: patterns };
    if (facadeFade) shader.uniforms.facadeFade = facadeFade;
    shader.vertexShader = 'attribute vec4 facade; varying vec4 vFacade;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvFacade = facade;');
    const fadeDeclaration = facadeFade ? 'uniform float facadeFade;\n' : '';
    shader.fragmentShader = fadeDeclaration + 'uniform highp sampler2DArray facadePatterns; varying vec4 vFacade;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>', `#include <color_fragment>
      ${facadeFade ? 'vec3 bareWall = diffuseColor.rgb;' : ''}
      // u counts bays, y counts storeys, z selects glass and the frontage.
      float glassTower = mod(vFacade.z, 2.0);
      float ground = 1.0 - step(1.0, vFacade.y);
      float shop = ground * step(2.0, vFacade.z);
      vec2 pattern = texture(facadePatterns, vec3(vFacade.xy,mix(glassTower,2.0,shop))).rg;
      if (vFacade.y >= 0.0) {
        vec3 glass = mix(vec3(0.075,0.107,0.125), vec3(0.12,0.19,0.22), glassTower);
        glass *= mix(0.84, 1.10, pattern.g);
        diffuseColor.rgb *= 1.0 - 0.16*shop;
        diffuseColor.rgb = mix(diffuseColor.rgb, glass, pattern.r*step(0.0,vFacade.x)*0.93);
        diffuseColor.rgb *= mix(0.80, 1.0, smoothstep(0.11,0.21,vFacade.w));
      }
      ${facadeFade ? 'diffuseColor.rgb = mix(bareWall, diffuseColor.rgb, facadeFade);' : ''}`);
  };
  if (facadeFade) mat.customProgramCacheKey = () => 'survey-fade';
  return mat;
}

function vertex(batch: Batch, [x,z]: Point, y: number, color: THREE.Color,
                bay = -1, level = -1, flag = 0, belowRoof = 0) {
  batch.positions.push(x,y,z);
  batch.colors.push(color.r,color.g,color.b);
  batch.facades?.push(bay,level,flag,belowRoof);
}

function roof(batch: Batch, face: Face, height: number, color: THREE.Color) {
  const geometry = new THREE.ShapeGeometry(groundShape(face));
  const pos = geometry.getAttribute('position');
  const idx = geometry.index!;
  for (let i = 0; i < idx.count; i++) {
    const at = idx.getX(i);
    vertex(batch, [pos.getX(at), -pos.getY(at)], height, color);
  }
  geometry.dispose();
}

function sides(batch: Batch, ring: Point[], outward: boolean, bottom: number, top: number,
               color: THREE.Color, floorHeight: number, pitch: number, flag: number, street: readonly number[] = []) {
  const corners = outward ? [0,2,1,1,2,3] : [0,1,2,1,3,2];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i+1)%ring.length];
    const length = Math.hypot(b[0]-a[0], b[1]-a[1]);
    if (length < .01) continue;
    const bays = length >= 1.45 ? Math.max(1, Math.round(length/pitch)) : -1;
    const style = flag + (street.includes(i) ? 2 : 0);
    for (const k of corners) {
      const far = k % 2 !== 0;
      const y = k >= 2 ? top : bottom;
      vertex(batch, far ? b : a, y, color, bays < 0 ? -1 : far ? bays : 0,
        floorHeight ? y/floorHeight : -1, style, top-y);
    }
  }
}

function unclose(ring: Point[]) {
  const [x,z] = ring[0], [lastX,lastZ] = ring[ring.length-1];
  return x === lastX && z === lastZ ? ring.slice(0,-1) : ring;
}

function areaTwice(ring: Point[]) {
  return ring.reduce((sum, [x,z], i) => {
    const [nextX,nextZ] = ring[(i+1)%ring.length];
    return sum + x*nextZ - z*nextX;
  }, 0);
}

function parapetInset(outer: Point[], signedArea: number) {
  if (Math.abs(signedArea) < 60) return null;
  const ccw = signedArea > 0 ? outer : [...outer].reverse();
  // Keep complex or narrow outlines on their existing plane. The original
  // inset helper makes the coping on roofs with a simple convex ring.
  if (ccw.some(([x,z], i) => {
    const [a,b] = ccw[(i+1)%ccw.length], [c,d] = ccw[(i+2)%ccw.length];
    return (a-x)*(d-b)-(b-z)*(c-a) < -1e-5 || Math.hypot(a-x,b-z) < PARAPET*2;
  })) return null;
  const inset = insetEdges(new Float32Array(ccw.flat()), Array(ccw.length).fill(PARAPET));
  return inset && ccw.map((_,i): Point => [inset[2*i],inset[2*i+1]]);
}

export function makeSurveyBuildings(buildings: SurveyBuilding[],
                                    { chunkSize = CHUNK, detail = true, facadeFade }: BuildingOptions = {}) {
  const mat = detail ? material(facadeFade) : new THREE.MeshLambertMaterial({ vertexColors: true });
  const batches = new Map<string, Batch>();
  for (const { height, floors, faces, appearance } of buildings) for (const [i, face] of faces.entries()) {
    const paint = appearance?.[i] ?? fallback;
    const rings = face.map(unclose);
    const [outer] = rings;
    const [x,z] = outer[0];
    const key = `${Math.floor(x/chunkSize)},${Math.floor(z/chunkSize)}`;
    let batch = batches.get(key);
    if (!batch) batches.set(key, batch = { positions: [], colors: [], facades: detail ? [] : undefined });
    const wall = new THREE.Color(paint.wall), top = new THREE.Color(paint.roof);
    const storey = height/(floors || Math.max(1, Math.round(height/3)));
    const pitch = paint.style === 'glass' ? 2.2 : paint.style === 'urban' ? 2.45 : 2.85;
    for (const [j, ring] of rings.entries()) {
      sides(batch, ring, (areaTwice(ring)>0) === (j===0), 0, height, wall,
        storey, pitch, Number(paint.style === 'glass'), j === 0 ? paint.street : undefined);
    }
    const inset = detail && rings.length === 1 && height >= 6 && parapetInset(outer, areaTwice(outer));
    if (inset) {
      roof(batch, [inset], height-PARAPET, top);
      roof(batch, [outer,inset], height, top.clone().lerp(wall,.22));
      sides(batch, inset, false, height-PARAPET, height, top, 0, 1, 0);
    } else {
      roof(batch, face, height, top);
    }
  }
  return [...batches.values()].map(({positions,colors,facades}) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
    if (facades) geometry.setAttribute('facade', new THREE.Float32BufferAttribute(facades,4));
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return new THREE.Mesh(geometry,mat);
  });
}
