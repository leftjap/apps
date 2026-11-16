// 3D 화면 위에 겹치는 글자: 지붕 위에 뜬 역·랜드마크 이름표와 가까이 볼 때만 보이는 출구 번호.
// 건물에 가려지지 않도록 화면 좌표로 옮긴 HTML 로 그린다. 출구 번호는 건물 뒤로 가면 흐리게 한다.
import * as THREE from 'three';
import type { PlaceLabel } from '../render/landmarks.ts';
import type { SchoolLabel } from '../render/schools.ts';
import { NEAR_VIEW } from '../render/size.ts';
import type { StationLabel } from '../render/stations.ts';
import type { BoardRow } from '../sim/trains.ts';

const EXIT_NEAR = 1500; // 카메라가 보는 지점에서 이만큼(m) 안으로 들어오면 출구 번호를 보인다
const EXIT_FAR = 1800; // 카메라에서 이보다 먼 출구 번호는 감춘다(지평선 쪽 역)
const PLACE_FAR = 3200; // 카메라에서 이보다 먼 랜드마크 이름표는 감춘다
const SCHOOL_FAR = 2600; // 학교 이름은 동네 크기로 볼 때 보인다(판 전체를 볼 때는 감춘다)

/** 점이 외곽선 [x,z, ...] 안인가 */
function inside(x: number, z: number, p: Float32Array) {
  let c = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) if (p[i + 1] > z !== p[j + 1] > z && x < ((p[j] - p[i]) * (z - p[i + 1])) / (p[j + 1] - p[i + 1]) + p[i]) c = !c;
  return c;
}

/** 역 안내 표지의 노선 기호: 번호 노선은 노선 색 원에 번호, 이름 노선은 노선 색 둥근 네모에 짧은 이름(경의중앙선 → 경의중앙, 공항철도 → 공항) */
export function lineMark(name: string): { text: string; round: boolean } {
  const n = /^(\d+)호선$/.exec(name);
  return n ? { text: n[1], round: true } : { text: name.replace(/(선|철도)$/, ''), round: false };
}

/** 역 이름표에 붙일 도착 표시: 그 역에 서 있는 열차가 있으면 '도착', 90초 안에 서면 '곧 도착'(가장 먼저 오는 노선), 아니면 null */
export function arrivalBadge(rows: BoardRow[]): { text: string; line: string } | null {
  const live = rows.filter((r) => !r.state.startsWith('운행 종료'));
  const at = live.find((r) => r.state.startsWith('정차 중'));
  if (at) return { text: '도착', line: at.line };
  const soon = live.filter((r) => r.inSec < 90).sort((a, b) => a.inSec - b.inSec)[0];
  return soon ? { text: '곧 도착', line: soon.line } : null;
}

export function makeTags(
  stage: HTMLElement,
  stations: StationLabel[],
  lines: { name: string; color: string; stopNames: string[] }[],
  exits: { st: string; ref: string; x: number; y?: number; z: number; occ?: { pts: Float32Array; h: number }[] }[],
  places: PlaceLabel[],
  schools: SchoolLabel[],
  onStation: (name: string) => void,
  onPlace: (id: string) => void,
  onSchool: (i: number) => void,
) {
  const layer = document.createElement('div');
  layer.id = 'tags';
  stage.append(layer);
  const st = stations.map((s) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'st-tag';
    for (const l of lines.filter((l) => l.stopNames.includes(s.name))) {
      const m = lineMark(l.name);
      const i = document.createElement('i');
      i.className = m.round ? 'ln' : 'ln wide';
      i.style.setProperty('--c', l.color);
      i.textContent = m.text;
      el.append(i);
    }
    el.append(document.createElement('b'));
    el.querySelector('b')!.textContent = s.name;
    // 도착 표시: 가까운 보기에서만, 그 역에 서 있거나 곧 설 열차의 노선 색으로
    const arr = document.createElement('em');
    arr.hidden = true;
    el.append(arr);
    el.addEventListener('click', () => onStation(s.name));
    layer.append(el);
    return { el, x: s.x, y: s.y, z: s.z, name: s.name, arr };
  });
  const pl = places.map((p) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'lm-tag';
    el.style.setProperty('--c', p.color);
    el.textContent = p.name;
    el.addEventListener('click', () => onPlace(p.id));
    layer.append(el);
    return { el, x: p.x, y: p.y, z: p.z };
  });
  // 학교 이름: 배지 없이 흰 글씨로(역 배지보다 가볍게)
  const sc = schools.map((s) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'sc-tag';
    el.textContent = s.name;
    el.addEventListener('click', () => onSchool(s.i));
    layer.append(el);
    return { el, x: s.x, y: s.y, z: s.z };
  });
  const ex = exits.map((e) => {
    const el = document.createElement('span');
    el.className = 'ex-tag';
    el.textContent = e.ref;
    layer.append(el);
    return { el, x: e.x, y: e.y ?? 3, z: e.z, occ: e.occ ?? [], hid: false };
  });
  /** 출구 번호에서 카메라 쪽으로 2m 씩 가며, 그 자리 높이보다 높은 건물 외곽선 안에 들면 가려졌다 */
  function behind(it: (typeof ex)[number], cam: THREE.Camera) {
    const [dx, dy, dz] = [cam.position.x - it.x, cam.position.y - it.y, cam.position.z - it.z];
    const L = Math.hypot(dx, dy, dz);
    const top = it.occ.reduce((m, b) => Math.max(m, b.h), 0);
    for (let s = 2; s < L; s += 2) {
      const y = it.y + (dy * s) / L;
      if (y > top) return false;
      const [x, z] = [it.x + (dx * s) / L, it.z + (dz * s) / L];
      for (const b of it.occ) if (b.h > y && inside(x, z, b.pts)) return true;
    }
    return false;
  }
  let tick = 0;
  const v = new THREE.Vector3();

  function place(items: { el: HTMLElement; x: number; y: number; z: number }[], cam: THREE.Camera, w: number, h: number, show: boolean, far = Infinity) {
    for (const it of items) {
      v.set(it.x, it.y, it.z);
      const near = v.distanceTo(cam.position) < far;
      v.project(cam);
      const on = show && near && v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      it.el.style.display = on ? '' : 'none';
      if (on) it.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px)`;
    }
  }

  // 이름표가 겹치면 앞 순서(환승역 → 역 → 랜드마크)만 남긴다
  const order = [...[...st].sort((a, b) => b.el.childElementCount - a.el.childElementCount), ...pl, ...sc];
  const boxes: [number, number, number, number][] = [];
  function declutter() {
    boxes.length = 0;
    for (const it of order) {
      if (it.el.style.display === 'none') continue;
      const r = it.el.getBoundingClientRect();
      const box: [number, number, number, number] = [r.left - 2, r.top - 2, r.right + 2, r.bottom + 2];
      if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) it.el.style.display = 'none';
      else boxes.push(box);
    }
  }

  return {
    update(cam: THREE.Camera, w: number, h: number, viewDist: number, visible: boolean) {
      layer.hidden = !visible;
      if (!visible) return;
      for (const it of st) it.arr.hidden = viewDist >= NEAR_VIEW[1] || !it.arr.textContent;
      place(st, cam, w, h, true);
      place(pl, cam, w, h, true, PLACE_FAR);
      place(sc, cam, w, h, true, SCHOOL_FAR);
      declutter();
      place(ex, cam, w, h, viewDist < EXIT_NEAR, EXIT_FAR);
      // 가림 검사는 보이는 번호만, 프레임마다 여섯 개에 하나씩 돌아가며
      tick++;
      ex.forEach((it, i) => {
        if (it.el.style.display === 'none' || (i + tick) % 6) return;
        const hid = behind(it, cam);
        if (hid !== it.hid) it.el.style.opacity = (it.hid = hid) ? '0.22' : '';
      });
    },
    /** 역 name 이름표의 도착 표시(text 가 비면 없앤다). color 는 그 열차의 노선 색 */
    setArrival(name: string, text: string, color: string) {
      for (const it of st) {
        if (it.name !== name || it.arr.textContent === text) continue;
        it.arr.textContent = text;
        it.arr.style.setProperty('--c', color);
        it.arr.className = text === '도착' ? 'now' : '';
      }
    },
  };
}
