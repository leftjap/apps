import * as THREE from 'three';
import { loadBuildings } from './buildings';
import { AERIAL_DEV_ORIGIN, CORRIDOR_VIEWS, groundPoint, PILOT_SITES, TILE_METRES, tileAtGround, tileBounds, vworldTileUrl } from './map';
import type { Tile } from './map';
import { AERIAL_BEARING, createRoadOverlay } from './road-overlay';
import type { GroundVariant, SurfaceMode } from './road-overlay';
import { createOmissionMarkers } from './arrow-omissions.ts';
import './style.css';

type TileSource = (tile: Tile) => string;
type TileMesh = {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  state: 'loading' | 'ready' | 'error';
};

function initMap(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#46555a');
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 1_000);
  const buildings = new THREE.Group();
  const photos = new THREE.Group();
  const roads = createRoadOverlay(updateSurfaceStatus, Math.min(8, renderer.capabilities.getMaxAnisotropy()));
  const tileGeometry = new THREE.PlaneGeometry(TILE_METRES, TILE_METRES).rotateX(-Math.PI / 2);
  const tiles = new Map<string, TileMesh>();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const ray = new THREE.Raycaster();
  const sun = new THREE.DirectionalLight('#fff0d8', 1.35);
  sun.position.set(-200, 300, 100);
  scene.add(photos, roads.group, buildings, sun, new THREE.HemisphereLight('#dceafa', '#5c5751', 2));

  const omissionMarkers = createOmissionMarkers(
    document.querySelector<HTMLDivElement>('#arrow-omission-markers')!,
    document.querySelector<HTMLDivElement>('#arrow-omission-note')!,
  );
  const surfaceStatus = document.querySelector<HTMLParagraphElement>('#surface-status')!;
  const surfaceOptions = document.querySelector<HTMLFieldSetElement>('.surface-options')!;
  const surfaceInputs = surfaceOptions.querySelectorAll<HTMLInputElement>('input[name="surface"]');
  const imageryStatus = document.querySelector<HTMLParagraphElement>('#imagery-status')!;
  const buildingStatus = document.querySelector<HTMLParagraphElement>('#building-status')!;
  const buildingControl = document.querySelector<HTMLInputElement>('#buildings')!;
  const widthControl = document.querySelector<HTMLSelectElement>('#width')!;
  const variants = document.querySelector<HTMLSelectElement>('#ground-variant')!;
  const locationOptions = document.querySelector<HTMLFieldSetElement>('.locations')!;
  const corridorControls = document.querySelector<HTMLDivElement>('#corridor-controls')!;
  const corridorView = document.querySelector<HTMLSelectElement>('#corridor-view')!;
  for (const [id, { label }] of Object.entries(CORRIDOR_VIEWS)) corridorView.add(new Option(label, id));
  const imageryForm = document.querySelector<HTMLFormElement>('#imagery-form')!;
  const keyControl = document.querySelector<HTMLInputElement>('#imagery-key')!;
  buildings.visible = buildingControl.checked;
  let site: keyof typeof PILOT_SITES = 'seogyo';
  const query = new URLSearchParams(location.search);
  const localInspection = import.meta.env.DEV && query.has('inspect');
  const requestedVariant = query.get('ground');
  if (requestedVariant === 'rules' || requestedVariant === 'corridor') variants.value = requestedVariant;
  const requestedView = query.get('view');
  if (requestedView && Object.hasOwn(CORRIDOR_VIEWS, requestedView)) corridorView.value = requestedView;
  const requestedWidth = query.get('width');
  if (requestedWidth && ['60', '80', '100'].includes(requestedWidth)) widthControl.value = requestedWidth;
  const requestedSurface = query.get('surface');
  let preferredSurface: SurfaceMode = requestedSurface === 'road' || requestedSurface === 'overlay' ? requestedSurface : 'photo';
  let surfaceMode: SurfaceMode = 'photo';
  let source: TileSource | undefined;
  let requests = new AbortController();
  let visibleTiles: TileMesh[] = [];
  let frame: number | undefined;

  function render() {
    if (frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      renderer.render(scene, camera);
      omissionMarkers.update(roads.omissions(), camera);
    });
  }

  function updateSurfaceStatus() {
    const state = roads.state();
    surfaceStatus.dataset.mode = surfaceMode;
    surfaceStatus.dataset.state = state;
    if (surfaceMode === 'photo') {
      surfaceStatus.textContent = '항공사진 원본';
    } else {
      const label = surfaceMode === 'road' ? '도로 그림' : surfaceMode === 'hand' ? '손 도면' : '겹쳐 보기';
      if (state === 'error') {
        surfaceStatus.textContent = `${label}용 도면을 불러오지 못했습니다.`;
      } else if (state === 'loading') {
        surfaceStatus.textContent = `${label}용 도면을 불러오는 중입니다.`;
      } else {
        surfaceStatus.textContent = surfaceMode === 'road'
          ? variants.value === 'corridor'
            ? '회색 바닥은 실폭도로 자료의 도로구역입니다. 민트색은 서울시 길가 선입니다.'
            : '도로 그림 · 베이지색은 차도 밖 배경입니다. 보행 가능 여부는 미확인입니다.'
          : surfaceMode === 'hand'
            ? '항공사진을 보고 그린 손 도면입니다. 주황 점선은 가려진 부분의 추정 위치입니다.'
            : variants.value !== 'calibrated'
              ? variants.value === 'corridor'
                ? '민트색은 서울시 길가 선, 하늘색은 노면 표시, 황토색 면은 서울시 안전지대입니다.'
                : '민트색은 서울시 길가 선에서 계산한 연석, 하늘색은 노면 표시입니다.'
              : '민트색은 연석, 하늘색은 노면 표시입니다. 주황색은 사진 미확인입니다. 주황 횡단보도 줄은 가린 곳의 추정 위치입니다. 분홍색은 위치 차이나 도색 충돌을 표시합니다.';
      }
    }
    if (roads.omissions().length) {
      surfaceStatus.textContent += ' 보라색 ID는 도색에서 빠진 화살표의 원자료 위치입니다.';
    }
    render();
  }

  function showSurface() {
    const variant = variants.value as GroundVariant;
    const handAvailable = variant === 'calibrated' && site === 'seogyo';
    const available = variant !== 'calibrated' || site === 'seogyo' || localInspection;
    surfaceMode = available && (preferredSurface !== 'hand' || handAvailable) ? preferredSurface : 'photo';
    surfaceOptions.hidden = !available;
    surfaceStatus.hidden = !available;
    surfaceOptions.querySelector<HTMLLabelElement>('label:has([value="hand"])')!.hidden = !handAvailable;
    locationOptions.hidden = variant !== 'calibrated';
    corridorControls.hidden = variant !== 'corridor';
    imageryStatus.hidden = surfaceMode === 'road';
    for (const input of surfaceInputs) input.checked = input.value === surfaceMode;
    photos.visible = surfaceMode !== 'road';
    roads.setMode(surfaceMode, site, variant);
    updateSurfaceStatus();
  }

  function updateImageryStatus() {
    if (!source) return;
    const loaded = visibleTiles.filter(tile => tile.state === 'ready').length;
    if (visibleTiles.some(tile => tile.state === 'loading')) {
      imageryStatus.dataset.state = 'loading';
      imageryStatus.textContent = '항공사진을 불러오는 중입니다.';
    } else if (loaded === visibleTiles.length) {
      imageryStatus.dataset.state = 'ready';
      imageryStatus.textContent = '항공사진 표시 중';
    } else if (loaded > 0) {
      imageryStatus.dataset.state = 'partial';
      imageryStatus.textContent = `항공사진 일부를 불러오지 못했습니다. 타일 ${loaded}/${visibleTiles.length}개 표시 중`;
    } else {
      imageryStatus.dataset.state = 'error';
      imageryStatus.textContent = '항공사진을 불러오지 못했습니다. 인증키와 등록 도메인을 확인하세요.';
    }
  }

  async function loadTile(tile: TileMesh, url: string, signal: AbortSignal) {
    try {
      const response = await fetch(url, {
        cache: 'no-store',
        credentials: 'omit',
        signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
      });
      if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error('Invalid tile');
      const objectUrl = URL.createObjectURL(await response.blob());
      const image = new Image();
      try {
        image.src = objectUrl;
        await image.decode();
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
      if (signal.aborted) return;
      const texture = new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      texture.needsUpdate = true;
      tile.mesh.material.map = texture;
      tile.mesh.material.color.set('#ffffff');
      tile.mesh.material.needsUpdate = true;
      tile.state = 'ready';
    } catch {
      if (signal.aborted) return;
      tile.state = 'error';
      tile.mesh.material.color.set('#48575b');
    }
    updateImageryStatus();
    render();
  }

  function fitTiles(targetX: number, targetZ: number) {
    const corners: THREE.Vector3[] = [];
    for (const x of [-1, 1]) {
      for (const y of [-1, 1]) {
        ray.setFromCamera(new THREE.Vector2(x, y), camera);
        const point = ray.ray.intersectPlane(ground, new THREE.Vector3());
        if (point) corners.push(point);
      }
    }
    const nw = tileAtGround(Math.min(targetX, ...corners.map(c => c.x)), Math.min(targetZ, ...corners.map(c => c.z)));
    const se = tileAtGround(Math.max(targetX, ...corners.map(c => c.x)), Math.max(targetZ, ...corners.map(c => c.z)));
    for (const tile of visibleTiles) tile.mesh.visible = false;
    visibleTiles = [];
    for (let y = nw.y; y <= se.y; y++) {
      for (let x = nw.x; x <= se.x; x++) {
        const id = `${x}/${y}`;
        let tile = tiles.get(id);
        if (!tile) {
          const { west, east, north, south } = tileBounds({ x, y });
          const mesh = new THREE.Mesh(tileGeometry, new THREE.MeshBasicMaterial({ color: '#566467' }));
          mesh.position.set((west + east) / 2, 0, (north + south) / 2);
          tile = { mesh, state: 'loading' };
          photos.add(mesh);
          tiles.set(id, tile);
          if (source) void loadTile(tile, source({ x, y }), requests.signal);
        }
        tile.mesh.visible = true;
        visibleTiles.push(tile);
      }
    }
    updateImageryStatus();
  }

  function fitCamera() {
    const { clientWidth, clientHeight } = canvas;
    if (!clientWidth || !clientHeight) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    const view = CORRIDOR_VIEWS[corridorView.value as keyof typeof CORRIDOR_VIEWS];
    const centre = variants.value === 'corridor' ? view.at
      : variants.value === 'rules' ? PILOT_SITES.seogyo : PILOT_SITES[site];
    const [x, z] = groundPoint(centre);
    const radians = Math.PI / 180;
    const tilt = 34 * radians;
    const turn = AERIAL_BEARING;
    // The chosen width is measured left to right through the point the camera looks at.
    const distance = Number(widthControl.value) / (2 * camera.aspect * Math.tan(camera.fov * radians / 2));
    camera.position.set(
      x + distance * Math.sin(tilt) * Math.sin(turn),
      distance * Math.cos(tilt),
      z + distance * Math.sin(tilt) * Math.cos(turn),
    );
    camera.lookAt(x, 0, z);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    fitTiles(x, z);
    render();
  }

  function setSource(newSource: TileSource) {
    requests.abort();
    requests = new AbortController();
    source = newSource;
    for (const { mesh } of tiles.values()) {
      mesh.material.map?.dispose();
      mesh.material.dispose();
      photos.remove(mesh);
    }
    visibleTiles = [];
    tiles.clear();
    fitCamera();
  }

  for (const input of document.querySelectorAll<HTMLInputElement>('input[name="site"]')) {
    input.addEventListener('change', () => {
      site = input.value as typeof site;
      showSurface();
      fitCamera();
    });
  }
  for (const input of surfaceInputs) {
    input.addEventListener('change', () => {
      preferredSurface = input.value as SurfaceMode;
      showSurface();
    });
  }
  variants.addEventListener('change', () => {
    showSurface();
    fitCamera();
  });
  corridorView.addEventListener('change', fitCamera);
  showSurface();
  widthControl.addEventListener('change', fitCamera);
  buildingControl.addEventListener('change', () => {
    buildings.visible = buildingControl.checked;
    render();
  });
  imageryForm.addEventListener('submit', event => {
    event.preventDefault();
    const key = keyControl.value.trim();
    if (!key) return;
    keyControl.value = '';
    setSource(tile => vworldTileUrl(key, tile));
  });

  const localTiles = document.querySelector<HTMLMetaElement>('meta[name="local-aerial-tiles"]')?.content;
  if (import.meta.env.DEV && location.origin === AERIAL_DEV_ORIGIN && localTiles) {
    imageryForm.hidden = true;
    setSource(({ x, y }) => `${localTiles}${y}/${x}.jpeg`);
  }

  new ResizeObserver(fitCamera).observe(canvas);
  fitCamera();
  void loadBuildings(buildings).then(({ recorded, estimated, outlines }) => {
    buildingStatus.dataset.state = 'ready';
    buildingStatus.textContent = `시범 구간 건물 ${recorded}개 높이 기록 · 청회색 ${estimated}개 층당 3 m 추정 · 노란 외곽선 ${outlines}개 높이·층수 미상`;
    render();
  }).catch(() => {
    buildingStatus.dataset.state = 'error';
    buildingStatus.textContent = '건물 자료를 불러오지 못했습니다.';
    buildingControl.disabled = true;
  });

}

try {
  initMap(document.querySelector<HTMLCanvasElement>('#map')!);
} catch {
  const status = document.querySelector<HTMLParagraphElement>('#graphics-status')!;
  status.textContent = '3D 지도를 시작할 수 없습니다. 브라우저의 WebGL 사용 설정을 확인하세요.';
  status.hidden = false;
  document.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>('input, button, select').forEach(control => {
    control.disabled = true;
  });
}
