// Load the district overview and retain detailed meshes around the camera.
import * as THREE from 'three';
import { groundShape, makeSurveyFacadeMaterial, type Face } from './survey-buildings.ts';
import { makeYanghwaSurfaceMaterial, makeYanghwaTerrain, type YanghwaFloor } from './yanghwa-terrain.ts';

// At this ground resolution the legacy shader has already faded fine paint.
const DETAIL_METERS_PER_PIXEL = 1.3;
const FACADE_DETAIL_WIDTH = 360;
const MAX_PADDED_VIEW_TILES = 7;
const MAX_TILE_BYTES = 48 * 1024 * 1024;
const MAX_TILES = 24;
const MAX_REQUESTS = 2;

type Tile = {
  x: number; z: number; file: string; rawBytes: number;
  bounds: [number, number, number, number, number, number];
};
type TileIndex = {
  version: number; size: number; window: [number, number, number, number];
  ground: Face[]; corners: [number, number, number][];
  overview: { file: string }; tiles: Tile[];
};
type Box = [number, number, number, number, number, number, number, number];
type Outline = [height: number, roof: number, wall: number, footprint: Face];
type Overview = { floor: YanghwaFloor; boxes: Box[][]; outlines?: [number, Outline[]][] };
type TileHeader = { surfaces: [string, number, number, number, number][]; buildings: [number, number, number][] };
type BoundedMesh = { mesh: THREE.Mesh; bounds: THREE.Box3 };
type BuildingBatch = { close: THREE.Mesh; plain: THREE.Mesh; bounds: THREE.Box3 };
type TileMesh = { group: THREE.Group; surfaces: BoundedMesh[]; buildings: BuildingBatch[]; materials: Iterable<THREE.Material> };
type TileBuffer = ArrayBuffer & { transfer?: (newByteLength: number) => ArrayBuffer };

async function asset(base: string, file: string, signal?: AbortSignal) {
  const response = await fetch(base + file, { signal });
  if (!response.ok) throw Error(`${file} 자료 응답 ${response.status}`);
  if (file.endsWith('.gz') && !response.headers.get('content-encoding')?.includes('gzip')) {
    return new Response(response.body!.pipeThrough(new DecompressionStream('gzip')));
  }
  return response;
}

function makeOverview(data: Overview, index: TileIndex) {
  const group = makeYanghwaTerrain(data.floor, {
    window: index.window, ground: index.ground, buildings: [], parking: [],
  }, true, Number.MAX_VALUE);
  // One indexed mesh per cell. The overview camera sees roofs and walls, so
  // share wall corners, give each roof its own tint and omit the floor.
  const faces = [8,10,9, 8,11,10, 0,4,1, 1,4,5, 1,5,2, 2,5,6, 2,6,3, 3,6,7, 3,7,0, 0,7,4];
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const outlines = new Map(data.outlines);
  for (const [cell, boxes] of data.boxes.entries()) {
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const vertex = (x: number, y: number, z: number, color: number) => {
      positions.push(x,y,z);
      colors.push((color >> 16) & 255,(color >> 8) & 255,color & 255);
    };
    for (const [x,z,w,d,angle,height,roofColor,wallColor] of boxes) {
      const cos = Math.cos(angle), sin = Math.sin(angle);
      const start = positions.length / 3;
      for (let corner = 0; corner < 12; corner++) {
        const dx = (corner % 4 === 0 || corner % 4 === 3 ? -w : w) / 2;
        const dz = (corner % 4 < 2 ? -d : d) / 2;
        vertex(x + dx*cos - dz*sin, corner < 4 ? 0 : height,
          z + dx*sin + dz*cos, corner < 8 ? wallColor : roofColor);
      }
      for (const index of faces) indices.push(start + index);
    }
    for (const [height,roof,wall,footprint] of outlines.get(cell) ?? []) {
      const shape = new THREE.ShapeGeometry(groundShape(footprint));
      const roofVertices = shape.getAttribute('position');
      const roofIndices = shape.index!;
      const start = positions.length / 3;
      for (let i = 0; i < roofVertices.count; i++) vertex(roofVertices.getX(i),height,-roofVertices.getY(i),roof);
      for (let i = 0; i < roofIndices.count; i++) indices.push(start + roofIndices.getX(i));
      shape.dispose();

      // The packer winds the courtyard rings opposite the outer wall.
      for (const ring of footprint) {
        const base = positions.length / 3;
        for (const [x,z] of ring) {
          vertex(x,0,z,wall);
          vertex(x,height,z,wall);
        }
        for (let i = 0; i < ring.length; i++) {
          const a = base + i*2, b = base + (i+1) % ring.length*2;
          indices.push(a,a+1,b,b,a+1,b+1);
        }
      }
    }
    const color = new THREE.Uint8BufferAttribute(colors, 3, true);
    const geometry = new THREE.BufferGeometry()
      .setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
      .setAttribute('color', color)
      .setIndex(indices);
    group.add(new THREE.Mesh(geometry, material));
  }
  return group;
}

function makeTile(buffer: ArrayBuffer, facade: THREE.Material, plain: THREE.Material): TileMesh {
  const headerBytes = new DataView(buffer).getUint32(0, true);
  const header: TileHeader = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, headerBytes)));
  let offset = 4 + Math.ceil(headerBytes / 4) * 4;
  const floats = (length: number) => {
    const values = new Float32Array(buffer, offset, length);
    offset += values.byteLength;
    return values;
  };
  const group = new THREE.Group();
  const surfaces: BoundedMesh[] = [];
  const buildings: BuildingBatch[] = [];
  const materials = new Map<string, THREE.Material>();
  for (const [color,y,priority,width,count] of header.surfaces) {
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(floats(count*3), 3));
    const key = `${color},${priority},${width}`;
    let material = materials.get(key);
    if (!material) {
      material = makeYanghwaSurfaceMaterial(color, priority, width);
      materials.set(key, material);
    }
    const mesh = new THREE.Mesh(geometry, material);
    geometry.computeBoundingBox();
    mesh.position.y = y;
    const bounds = geometry.boundingBox!.clone().translate(mesh.position);
    surfaces.push({ mesh, bounds });
    group.add(mesh);
  }
  for (const [vertices,closeCount,plainCount] of header.buildings) {
    const position = new THREE.BufferAttribute(floats(vertices * 3), 3);
    const color = new THREE.BufferAttribute(floats(vertices * 3), 3);
    const normal = new THREE.BufferAttribute(floats(vertices * 3), 3);
    const facadeData = new THREE.BufferAttribute(floats(vertices * 4), 4);
    const Index = vertices > 65536 ? Uint32Array : Uint16Array;
    const makeGeometry = (count: number) => {
      const indices = new Index(buffer, offset, count);
      offset += Math.ceil(indices.byteLength / 4) * 4;
      // Decode once, in the owned tile buffer. Both meshes share their vertices.
      for (let i = 1; i < indices.length; i++) indices[i] += indices[i-1];
      return new THREE.BufferGeometry()
        .setAttribute('position', position)
        .setAttribute('color', color)
        .setAttribute('normal', normal)
        .setIndex(new THREE.BufferAttribute(indices, 1));
    };
    const geometry = makeGeometry(closeCount)
      .setAttribute('facade', facadeData);
    geometry.computeBoundingBox();
    const closeMesh = new THREE.Mesh(geometry, facade);
    const plainMesh = new THREE.Mesh(makeGeometry(plainCount), plain);
    buildings.push({ close: closeMesh, plain: plainMesh, bounds: geometry.boundingBox! });
    group.add(closeMesh, plainMesh);
  }
  return { group, surfaces, buildings, materials: materials.values() };
}

export async function loadDistrictTiles(base: string, requestDraw: () => void, canvas: HTMLCanvasElement) {
  const index: TileIndex = await (await asset(base, 'index.json')).json();
  if (index.version !== 3) throw Error('지원하지 않는 칸 자료 버전');
  const distant = makeOverview(await (await asset(base, index.overview.file)).json(), index);
  const detail = new THREE.Group();
  const group = new THREE.Group().add(distant, detail);
  const corners = index.corners.map(([x,y,z]) => new THREE.Vector3(x,y,z));
  const tiles = index.tiles.map(tile => {
    const [x0,y0,z0,x1,y1,z1] = tile.bounds;
    return { ...tile, box: new THREE.Box3(new THREE.Vector3(x0,y0,z0), new THREE.Vector3(x1,y1,z1)) };
  });

  const fade = { value: 1 };
  const facade = makeSurveyFacadeMaterial(fade);
  const plain = new THREE.MeshLambertMaterial({ vertexColors: true });
  const frustum = new THREE.Frustum();
  const matrix = new THREE.Matrix4();
  const resident = new Map<Tile, { model?: TileMesh; buffer: TileBuffer }>();
  const loading = new Map<Tile, AbortController>();
  const failed = new Set<Tile>();
  let active = 0;
  let lastStatus = '';

  async function fetchTile(tile: Tile, controller: AbortController) {
    try {
      const response = await asset(base, tile.file, controller.signal);
      const buffer = await response.arrayBuffer();
      if (controller.signal.aborted) return;
      if (buffer.byteLength !== tile.rawBytes) throw Error(`${tile.file} 자료 크기 불일치`);
      resident.set(tile, { buffer });
    } catch (error) {
      if (!controller.signal.aborted) {
        failed.add(tile);
        console.warn('칸 자료를 열 수 없습니다.', error);
      }
    } finally {
      if (loading.get(tile) === controller) loading.delete(tile);
      active--;
      requestDraw();
    }
  }

  function update(camera: THREE.Camera, width: number) {
    let visible: typeof tiles = [];
    let candidates: typeof tiles = [];
    if (width / canvas.clientWidth < DETAIL_METERS_PER_PIXEL) {
      frustum.setFromProjectionMatrix(matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      visible = tiles.filter(tile => frustum.intersectsBox(tile.box));
      candidates = visible;
      if (visible.length <= MAX_PADDED_VIEW_TILES) {
        const neighbors = new Set<string>();
        for (const tile of visible) for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
          neighbors.add(`${tile.x + dx},${tile.z + dz}`);
        }
        const visibleSet = new Set<Tile>(visible);
        const padding = tiles.filter(tile => !visibleSet.has(tile) && neighbors.has(`${tile.x},${tile.z}`));
        candidates = [...visible, ...padding];
      }
    }

    const wanted = new Set<Tile>();
    let bytes = 0;
    for (const tile of candidates) {
      if (wanted.size === MAX_TILES) break;
      if (bytes + tile.rawBytes > MAX_TILE_BYTES) continue;
      wanted.add(tile);
      bytes += tile.rawBytes;
    }
    for (const [tile, { model, buffer }] of resident) {
      if (wanted.has(tile)) continue;
      if (model) {
        for (const mesh of model.group.children as THREE.Mesh[]) mesh.geometry.dispose();
        for (const material of model.materials) material.dispose();
        model.group.removeFromParent();
      }
      resident.delete(tile);
      // WebGL has released the attributes. Detach their backing store where
      // supported so a rapid return need not wait for garbage collection.
      buffer.transfer?.(0);
    }
    for (const [tile, controller] of loading) {
      if (wanted.has(tile)) continue;
      controller.abort();
      loading.delete(tile);
    }
    for (const tile of failed) if (!wanted.has(tile)) failed.delete(tile);
    for (const tile of wanted) {
      if (active >= MAX_REQUESTS) break;
      if (resident.has(tile) || loading.has(tile) || failed.has(tile)) continue;
      const controller = new AbortController();
      loading.set(tile, controller);
      active++;
      void fetchTile(tile, controller);
    }

    // Prefetch the bytes in the surrounding ring without building WebGL models.
    for (const tile of visible) {
      const entry = resident.get(tile);
      if (!entry || entry.model) continue;
      try {
        entry.model = makeTile(entry.buffer, facade, plain);
        detail.add(entry.model.group);
      } catch (error) {
        resident.delete(tile);
        entry.buffer.transfer?.(0);
        failed.add(tile);
        console.warn('칸 자료를 열 수 없습니다.', error);
      }
    }
    // Swap the entire view. A triangle or facade may extend into a different
    // tile, so mixing levels tile by tile would put both versions on screen.
    detail.visible = visible.length > 0 && visible.every(tile => resident.has(tile));
    distant.visible = !detail.visible;
    fade.value = THREE.MathUtils.clamp((FACADE_DETAIL_WIDTH - width) / 90, 0, 1);
    if (detail.visible) {
      const visibleSet = new Set<Tile>(visible);
      const windows = width < FACADE_DETAIL_WIDTH;
      for (const [tile, { model }] of resident) {
        if (!model || !(model.group.visible = visibleSet.has(tile))) continue;
        for (const { mesh, bounds } of model.surfaces) mesh.visible = frustum.intersectsBox(bounds);
        for (const { close, plain, bounds } of model.buildings) {
          const visible = frustum.intersectsBox(bounds);
          close.visible = visible && windows;
          plain.visible = visible && !windows;
        }
      }
    }
    const status = {
      detail: detail.visible, visible: visible.length, loaded: resident.size, wanted: wanted.size,
      failed: failed.size, rawBytes: [...resident.keys()].reduce((total,tile) => total + tile.rawBytes, 0),
      pending: wanted.size - resident.size - failed.size,
    };
    const serialized = JSON.stringify(status);
    if (serialized !== lastStatus) {
      canvas.dataset.tiles = lastStatus = serialized;
      canvas.dataset.tilesPending = String(status.pending);
    }
  }

  return { group, corners, ground: index.ground, window: index.window, update };
}
