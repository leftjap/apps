import * as THREE from 'three';
import { groundPoint, PILOT_SITES } from './map';

export type SurfaceMode = 'photo' | 'road' | 'overlay';
type DrawnSurface = Exclude<SurfaceMode, 'photo'>;
type TextureState = 'idle' | 'loading' | 'ready' | 'error';

export const AERIAL_BEARING = -42 * Math.PI / 180;
export const ROAD_OVERLAY_ASSETS = {
  road: 'data/v2/seogyo-road.svg',
  overlay: 'data/v2/seogyo-lines.svg',
};

export function createRoadOverlay(onChange: () => void, anisotropy = 1) {
  const group = new THREE.Group();
  const [x, z] = groundPoint(PILOT_SITES.seogyo);
  group.position.set(x, 0, z);
  // Both SVGs cover the same 156m square, with their vertical axis pointing towards the camera.
  const geometry = new THREE.PlaneGeometry(156, 156).rotateX(-Math.PI / 2).rotateY(AERIAL_BEARING);
  const meshes = {
    road: new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
    overlay: new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    })),
  };
  const states: Record<DrawnSurface, TextureState> = { road: 'idle', overlay: 'idle' };
  const loader = new THREE.TextureLoader();
  let active: SurfaceMode = 'photo';
  group.add(meshes.road, meshes.overlay);

  function updateVisibility() {
    meshes.road.visible = active === 'road' && states.road === 'ready';
    meshes.overlay.visible = active === 'overlay' && states.overlay === 'ready';
  }

  async function load(mode: DrawnSurface) {
    states[mode] = 'loading';
    try {
      const map = await loader.loadAsync(`${import.meta.env.BASE_URL}${ROAD_OVERLAY_ASSETS[mode]}`);
      map.colorSpace = THREE.SRGBColorSpace;
      map.anisotropy = anisotropy;
      meshes[mode].material.map = map;
      meshes[mode].material.needsUpdate = true;
      states[mode] = 'ready';
    } catch {
      states[mode] = 'error';
    }
    updateVisibility();
    onChange();
  }

  updateVisibility();
  return {
    group,
    setMode(mode: SurfaceMode) {
      if (mode === active) return;
      active = mode;
      updateVisibility();
      if (mode !== 'photo' && (states[mode] === 'idle' || states[mode] === 'error')) void load(mode);
    },
    state: () => active === 'photo' ? 'ready' : states[active],
  };
}
