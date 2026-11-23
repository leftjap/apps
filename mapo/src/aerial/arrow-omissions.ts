import { Vector3, type Camera } from 'three';
import { groundPoint } from './map.ts';
import type { ArrowOmission } from './road-overlay.ts';

const KIND_NAMES: Partial<Record<number, string>> = {
  5: '좌회전', 6: '우회전', 7: '직진', 8: '직진·좌회전', 9: '직진·우회전', 10: '유턴',
};
const kindLabel = (kind: number) => {
  const code = String(kind).padStart(3, '0');
  return KIND_NAMES[kind] ? `${KIND_NAMES[kind]}(${code})` : `종류 ${code}`;
};

function describe(row: ArrowOmission): string {
  const reason = row.reason === 'lane-kind-conflict' ? '같은 칸의 종류 상충' : '같은 칸의 상류 반복';
  const adopted = row.adopted
    ? `채택 ${row.adopted.id} ${kindLabel(row.adopted.kind)}`
    : row.of ? `채택 ID ${row.of}, 종류 미확인` : '채택 자료 미확인';
  return `미표시 · ${reason} · 원자료 ${row.id} ${kindLabel(row.kind)} · ${adopted}`;
}

export function createOmissionMarkers(layer: HTMLDivElement, note: HTMLDivElement) {
  let current: readonly ArrowOmission[] | undefined;
  let markers: { button: HTMLButtonElement; at: Vector3 }[] = [];
  let selected: HTMLButtonElement | undefined;
  const projected = new Vector3();

  function clearNote() {
    selected?.setAttribute('aria-pressed', 'false');
    selected = undefined;
    note.hidden = true;
  }

  return {
    update(rows: readonly ArrowOmission[], camera: Camera) {
      if (rows !== current) {
        current = rows;
        clearNote();
        markers = rows.map(row => {
          const button = document.createElement('button');
          const description = describe(row);
          button.type = 'button';
          button.dataset.omission = row.id;
          button.textContent = row.id;
          button.title = description;
          button.setAttribute('aria-label', description);
          button.setAttribute('aria-pressed', 'false');
          button.addEventListener('click', () => {
            const active = selected === button;
            clearNote();
            if (!active) {
              selected = button;
              button.setAttribute('aria-pressed', 'true');
              note.textContent = description;
              note.hidden = false;
            }
          });
          const [x, z] = groundPoint(row.sourceAt);
          return { button, at: new Vector3(x, 0, z) };
        });
        layer.replaceChildren(...markers.map(({ button }) => button));
        layer.hidden = markers.length === 0;
      }

      for (const { button, at } of markers) {
        projected.copy(at).project(camera);
        button.hidden = Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || Math.abs(projected.z) > 1;
        if (button.hidden) {
          if (button === selected) clearNote();
          continue;
        }
        button.style.left = `${(projected.x + 1) * 50}%`;
        button.style.top = `${(1 - projected.y) * 50}%`;
      }
    },
  };
}
