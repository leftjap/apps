// Assign the existing terrain triangles and facade meshes to static district tiles.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { Box3, Vector3 } from 'three';
import { ConvexHull } from 'three/addons/math/ConvexHull.js';
import { makeSurveyBuildings } from '../../src/aerial/survey-buildings.ts';
import { tileSurfaceCells, visitYanghwaLayers } from '../../src/aerial/yanghwa-terrain.ts';

const [areaPath, destination, cellArgument, overviewBytes] = process.argv.slice(2);
const size = Number(cellArgument);
const surfaceBatchSize = size / 4;
const { output } = JSON.parse(readFileSync(areaPath));
const read = suffix => {
  const path = join(output.directory, `${output.stem}-${suffix}.json`);
  return JSON.parse(output.gzip ? gunzipSync(readFileSync(path + '.gz')) : readFileSync(path));
};
const floor = read('a');
const area = read('buildings');
const paint = read('road-paint');
const cells = new Map();
function cellAt(key) {
  if (!cells.has(key)) cells.set(key, { bounds: new Box3(), surfaces: [], buildings: [], facades: [], buffers: [] });
  return cells.get(key);
}

// Clip already triangulated surfaces. Using the same intersection formula on
// both sides of an edge gives the neighboring tiles the same float vertices.
function clipAxis(polygon, axis, limit, keepAbove) {
  if (!polygon.length) return polygon;
  const inside = point => keepAbove ? point[axis] >= limit : point[axis] <= limit;
  const clipped = [];
  let from = polygon.at(-1);
  for (const to of polygon) {
    if (inside(from) !== inside(to) && from[axis] !== limit && to[axis] !== limit) {
      const [a,b] = from[axis] < to[axis] ? [from,to] : [to,from];
      const t = (limit - a[axis]) / (b[axis] - a[axis]);
      clipped.push(a.map((value, i) => i === axis ? limit : value + (b[i] - value) * t));
    }
    if (inside(to)) clipped.push(to);
    from = to;
  }
  return clipped;
}

function splitSurface(faces, splitBatches) {
  const result = new Map();
  function addTriangle(x,z,a,b,c) {
    const key = `${x},${z}`;
    if (!result.has(key)) result.set(key, new Map());
    const batches = result.get(key);
    const batch = splitBatches
      ? `${Math.floor((a[0]+b[0]+c[0]) / (3*surfaceBatchSize))},${Math.floor((a[2]+b[2]+c[2]) / (3*surfaceBatchSize))}`
      : "all";
    if (!batches.has(batch)) batches.set(batch, []);
    batches.get(batch).push(...a,...b,...c);
  }
  for (const vertices of tileSurfaceCells(faces, size).values()) {
    for (let i = 0; i < vertices.length; i += 9) {
      const minX = Math.floor(Math.min(vertices[i], vertices[i+3], vertices[i+6]) / size);
      const maxX = Math.floor(Math.max(vertices[i], vertices[i+3], vertices[i+6]) / size);
      const minZ = Math.floor(Math.min(vertices[i+2], vertices[i+5], vertices[i+8]) / size);
      const maxZ = Math.floor(Math.max(vertices[i+2], vertices[i+5], vertices[i+8]) / size);
      const triangle = [vertices.slice(i,i+3), vertices.slice(i+3,i+6), vertices.slice(i+6,i+9)];
      if (minX === maxX && minZ === maxZ) {
        addTriangle(minX,minZ,...triangle);
        continue;
      }
      for (let x = minX; x <= maxX; x++) {
        const column = clipAxis(clipAxis(triangle, 0, x * size, true), 0, (x+1) * size, false);
        for (let z = minZ; z <= maxZ; z++) {
          const polygon = clipAxis(clipAxis(column, 2, z * size, true), 2, (z+1) * size, false);
          for (let j = 1; j + 1 < polygon.length; j++) {
            const [a,b,c] = [polygon[0], polygon[j], polygon[j+1]];
            if ((b[0]-a[0]) * (c[2]-a[2]) !== (b[2]-a[2]) * (c[0]-a[0])) {
              addTriangle(x,z,a,b,c);
            }
          }
        }
      }
    }
  }
  return result;
}

const bytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const point = new Vector3();
visitYanghwaLayers(floor, area, paint, (faces, color, y, priority = 0, fineWidth = 0) => {
  // Dense road, paving and paint can span a tile but cover only a small
  // part of a close view. Keep sparse surfaces in larger batches.
  const splitBatches = y === .01 || y === .02 || fineWidth > 0;
  for (const [key, batches] of splitSurface(faces, splitBatches)) {
    const cell = cellAt(key);
    for (const vertices of batches.values()) {
      for (let i = 0; i < vertices.length; i += 3) {
        cell.bounds.expandByPoint(point.set(vertices[i], y + vertices[i+1], vertices[i+2]));
      }
      cell.surfaces.push([color, y, priority, fineWidth, vertices.length / 3]);
      cell.buffers.push(bytes(Float32Array.from(vertices)));
    }
  }
});

// Keep each footprint and its facade whole. Use the same 192 m mesh
// batching inside its owner tile, including the actual overhang in the index.
const buildingCell = 192;
const points = area.ground.flatMap(([outer]) => outer.map(([x,z]) => new Vector3(x,0,z)));
for (const { height, floors, faces, appearance } of area.buildings) {
  for (const [index, face] of faces.entries()) {
    for (const [x,z] of face[0]) points.push(new Vector3(x,height,z));
    const [x,z] = face[0][0];
    const cell = cellAt(`${Math.floor(x / size)},${Math.floor(z / size)}`);
    cell.facades.push({ height, floors, faces: [face], appearance: appearance && [appearance[index]] });
  }
}
// Both legacy zooms share exact wall vertices. The two index lists keep
// the original flat roofs at wider views and the parapets on close views.
function packBuildingBatch(close, plain) {
  const positions = [], colors = [], normals = [], facades = [];
  const byFacade = new Map();
  const bySurface = new Map();
  function indices(geometry, detailed) {
    const { position, color, normal, facade } = geometry.attributes;
    const result = [];
    for (let i = 0; i < position.count; i++) {
      const start = i * 3;
      const surface = [
        ...position.array.subarray(start,start+3), ...color.array.subarray(start,start+3),
        ...normal.array.subarray(start,start+3),
      ];
      const surfaceKey = surface.join(',');
      const vertex = surface.concat(detailed ? Array.from(facade.array.subarray(i*4,i*4+4)) : [-1,-1,0,0]);
      const key = detailed ? vertex.join(',') : surfaceKey;
      const table = detailed ? byFacade : bySurface;
      let index = table.get(key);
      if (index === undefined) {
        index = positions.length / 3;
        positions.push(...surface.slice(0,3));
        colors.push(...surface.slice(3,6));
        normals.push(...surface.slice(6,9));
        facades.push(...vertex.slice(9));
        table.set(key,index);
        if (!bySurface.has(surfaceKey)) bySurface.set(surfaceKey,index);
      }
      result.push(index);
    }
    return result;
  }

  const detailed = indices(close,true);
  const simple = indices(plain,false);
  const vertices = positions.length / 3;
  const Index = vertices > 65536 ? Uint32Array : Uint16Array;
  const buffer = values => {
    // Difference adjacent indices for gzip and keep subsequent arrays aligned.
    const data = bytes(Index.from(values, (value, i) => i ? value - values[i-1] : value));
    return data.byteLength % 4 ? Buffer.concat([data, Buffer.alloc(2)]) : data;
  };
  return {
    counts: [vertices, detailed.length, simple.length],
    buffers: [
      ...[positions, colors, normals, facades].map(values => bytes(Float32Array.from(values))),
      buffer(detailed), buffer(simple),
    ],
  };
}

for (const cell of cells.values()) {
  const close = makeSurveyBuildings(cell.facades, { chunkSize: buildingCell, facadeFade: { value: 1 } });
  const plain = makeSurveyBuildings(cell.facades, { chunkSize: buildingCell, detail: false });
  for (const [i, mesh] of close.entries()) {
    const simple = plain[i];
    cell.bounds.union(mesh.geometry.boundingBox);
    const batch = packBuildingBatch(mesh.geometry,simple.geometry);
    cell.buildings.push(batch.counts);
    cell.buffers.push(...batch.buffers);
    mesh.geometry.dispose();
    simple.geometry.dispose();
  }
  close[0]?.material.dispose();
  plain[0]?.material.dispose();
}

const hull = new ConvexHull().setFromPoints(points);
const corners = [...new Set(hull.faces.flatMap(({ edge }) => [
  edge.head().point, edge.next.head().point, edge.prev.head().point,
]))].map(vertex => vertex.toArray());
const tiles = [];
for (const [key, { bounds, surfaces, buildings, buffers }] of cells) {
  const [x,z] = key.split(',').map(Number);
  const file = `${x}_${z}.bin.gz`;
  const header = Buffer.from(JSON.stringify({ surfaces, buildings }));
  const prefix = Buffer.alloc(4 + Math.ceil(header.length / 4) * 4);
  prefix.writeUInt32LE(header.length);
  header.copy(prefix, 4);
  const raw = Buffer.concat([prefix, ...buffers]);
  const packed = gzipSync(raw, { level: 9 });
  writeFileSync(join(destination, file), packed);
  tiles.push({ x, z, file, bounds: [...bounds.min.toArray(), ...bounds.max.toArray()],
    bytes: packed.length, rawBytes: raw.length });
}
tiles.sort((a,b) => a.x - b.x || a.z - b.z);
writeFileSync(join(destination, 'index.json'), JSON.stringify({
  version: 3, size, window: area.window, ground: area.ground, corners,
  overview: { file: 'overview.json.gz', bytes: Number(overviewBytes) }, tiles,
}));
