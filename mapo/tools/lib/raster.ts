// 마스크(RGBA, size×size)에 다각형과 굵은 선을 칠하고 PNG로 쓴다.
import { deflateSync } from 'node:zlib';

/**
 * 짝홀 규칙으로 채운다. paths의 각 줄은 [x,y, x,y, ...] 픽셀 좌표의 꺾은선이고, 이웃한 점 사이만 변으로 본다.
 * 줄 하나가 닫힌 고리일 필요는 없고(OSM 관계는 고리가 여러 조각으로 나뉘어 있다) 전체가 합쳐서 닫혀 있으면 된다.
 */
export function fillPolygon(mask: Uint8Array, size: number, rings: number[][], ch: number): void {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const r of rings)
    for (let i = 1; i < r.length; i += 2) {
      if (r[i] < y0) y0 = r[i];
      if (r[i] > y1) y1 = r[i];
    }
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(size - 1, Math.ceil(y1));
  const xs: number[] = [];
  for (let y = ya; y <= yb; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (const r of rings) {
      const n = r.length / 2;
      for (let i = 0; i + 1 < n; i++) {
        const j = i + 1;
        const ay = r[i * 2 + 1];
        const by = r[j * 2 + 1];
        if (ay <= yc === by <= yc) continue;
        const ax = r[i * 2];
        xs.push(ax + ((yc - ay) / (by - ay)) * (r[j * 2] - ax));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.ceil(xs[k] - 0.5));
      const xb = Math.min(size - 1, Math.floor(xs[k + 1] - 0.5));
      for (let x = xa; x <= xb; x++) mask[(y * size + x) * 4 + ch] = 255;
    }
  }
}

/** 굵기 widthPx의 선. line은 [x,y, x,y, ...] 픽셀 좌표. */
export function strokeLine(mask: Uint8Array, size: number, line: number[], widthPx: number, ch: number): void {
  const r = widthPx / 2;
  for (let i = 0; i + 3 < line.length; i += 2) {
    const ax = line[i];
    const ay = line[i + 1];
    const dx = line[i + 2] - ax;
    const dy = line[i + 3] - ay;
    const len2 = dx * dx + dy * dy || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, ax + dx) - r));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(ax, ax + dx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, ay + dy) - r));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(ay, ay + dy) + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / len2));
        if (Math.hypot(x - ax - dx * t, y - ay - dy * t) <= r) mask[(y * size + x) * 4 + ch] = 255;
      }
  }
}

/**
 * fillPolygon 과 같되 칸마다 덮인 비율(0~255)을 칠한다. 칸 하나를 가로줄 ss 개로 나눠 줄마다 덮인 길이를 재므로,
 * 선형 보간으로 읽어 문턱값을 주면 2m 칸보다 매끈한 경계가 된다. 이미 칠한 값보다 작게 덮어쓰지 않는다(합집합).
 */
export function fillPolygonAA(mask: Uint8Array, size: number, rings: number[][], ch: number, ss = 4): void {
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const r of rings)
    for (let i = 1; i < r.length; i += 2) {
      if (r[i] < y0) y0 = r[i];
      if (r[i] > y1) y1 = r[i];
    }
  const ya = Math.max(0, Math.floor(y0));
  const yb = Math.min(size - 1, Math.ceil(y1));
  const cov = new Float32Array(size);
  const xs: number[] = [];
  for (let y = ya; y <= yb; y++) {
    let lo = size;
    let hi = -1;
    for (let s = 0; s < ss; s++) {
      const yc = y + (s + 0.5) / ss;
      xs.length = 0;
      for (const r of rings)
        for (let i = 0; i + 3 < r.length; i += 2) {
          const ay = r[i + 1];
          const by = r[i + 3];
          if (ay <= yc === by <= yc) continue;
          xs.push(r[i] + ((yc - ay) / (by - ay)) * (r[i + 2] - r[i]));
        }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, xs[k]);
        const xb = Math.min(size, xs[k + 1]);
        for (let x = Math.floor(xa); x < xb && x < size; x++) {
          cov[x] += (Math.min(xb, x + 1) - Math.max(xa, x)) / ss;
          if (x < lo) lo = x;
          if (x > hi) hi = x;
        }
      }
    }
    for (let x = lo; x <= hi; x++) {
      const v = Math.round(Math.min(1, cov[x]) * 255);
      const i = (y * size + x) * 4 + ch;
      if (v > mask[i]) mask[i] = v;
      cov[x] = 0;
    }
  }
}

/** strokeLine 과 같되 칸마다 ss×ss 점 가운데 선 안에 든 비율을 칠한다(합집합) */
export function strokeLineAA(mask: Uint8Array, size: number, line: number[], widthPx: number, ch: number, ss = 4): void {
  const r = widthPx / 2;
  for (let i = 0; i + 3 < line.length; i += 2) {
    const ax = line[i];
    const ay = line[i + 1];
    const dx = line[i + 2] - ax;
    const dy = line[i + 3] - ay;
    const len2 = dx * dx + dy * dy || 1;
    const x0 = Math.max(0, Math.floor(Math.min(ax, ax + dx) - r));
    const x1 = Math.min(size - 1, Math.ceil(Math.max(ax, ax + dx) + r));
    const y0 = Math.max(0, Math.floor(Math.min(ay, ay + dy) - r));
    const y1 = Math.min(size - 1, Math.ceil(Math.max(ay, ay + dy) + r));
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        let n = 0;
        for (let sy = 0; sy < ss; sy++)
          for (let sx = 0; sx < ss; sx++) {
            const px = x + (sx + 0.5) / ss;
            const py = y + (sy + 0.5) / ss;
            const t = Math.min(1, Math.max(0, ((px - ax) * dx + (py - ay) * dy) / len2));
            if (Math.hypot(px - ax - dx * t, py - ay - dy * t) <= r) n++;
          }
        const v = Math.round((n / (ss * ss)) * 255);
        const k = (y * size + x) * 4 + ch;
        if (v > mask[k]) mask[k] = v;
      }
  }
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  let c = 0xffffffff;
  for (const b of body) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE((c ^ 0xffffffff) >>> 0, body.length + 4);
  return out;
}

export function encodePng(rgba: Uint8Array, size: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 채널당 비트
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) Buffer.from(rgba.buffer, rgba.byteOffset + y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
