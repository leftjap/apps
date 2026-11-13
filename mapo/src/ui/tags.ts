// 3D 화면 위에 겹치는 글자: 지붕 위에 뜬 역·랜드마크 이름표와 가까이 볼 때만 보이는 출구 번호.
// 건물에 가려지지 않도록 화면 좌표로 옮긴 HTML 로 그린다.
import * as THREE from 'three';
import type { PlaceLabel } from '../render/landmarks.ts';
import type { SchoolLabel } from '../render/schools.ts';
import type { StationLabel } from '../render/stations.ts';

const EXIT_NEAR = 1500; // 카메라가 보는 지점에서 이만큼(m) 안으로 들어오면 출구 번호를 보인다
const EXIT_FAR = 1800; // 카메라에서 이보다 먼 출구 번호는 감춘다(지평선 쪽 역)
const PLACE_FAR = 3200; // 카메라에서 이보다 먼 랜드마크 이름표는 감춘다
const SCHOOL_FAR = 2600; // 학교 이름은 동네 크기로 볼 때 보인다(판 전체를 볼 때는 감춘다)

export function makeTags(
  stage: HTMLElement,
  stations: StationLabel[],
  exits: { st: string; ref: string; x: number; z: number }[],
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
    el.innerHTML = `${s.colors.map((c) => `<i style="--c:${c}"></i>`).join('')}<b></b>`;
    el.querySelector('b')!.textContent = s.name;
    el.addEventListener('click', () => onStation(s.name));
    layer.append(el);
    return { el, x: s.x, y: s.y, z: s.z };
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
    return { el, x: e.x, y: 3, z: e.z };
  });
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
      place(st, cam, w, h, true);
      place(pl, cam, w, h, true, PLACE_FAR);
      place(sc, cam, w, h, true, SCHOOL_FAR);
      declutter();
      place(ex, cam, w, h, viewDist < EXIT_NEAR, EXIT_FAR);
    },
  };
}
