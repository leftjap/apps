// Project scenario cameras and record vehicle lifetimes in screen space.
import { Frustum, Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { nearestOutlinePoint, type Outline } from '../../src/aerial/connected-traffic.ts';
import type { XZ } from '../../src/aerial/hapjeong-car-graph.ts';

export type Pose = { screen: XZ; center: XZ; width: number | 'overview'; bearing: number; tilt: number };
export type CameraSetup = {
  center: XZ; ground: Outline; corners: Vector3[];
  rules: { minWidth: number; minTilt: number; maxTilt: number; fitPadding: number };
};
export type Body = {
  uid: number; x: number; y: number; z: number; yaw: number;
  len: number; halfWidth: number; height: number; link: string;
};

const rad = Math.PI / 180;
const tan = Math.tan(17 * rad);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export class CameraView {
  camera = new PerspectiveCamera(34);
  frustum = new Frustum();
  matrix = new Matrix4();
  screen: XZ = [1, 1];
  private setup?: CameraSetup;
  private dir = new Vector3();
  private right = new Vector3();
  private up = new Vector3();
  private rel = new Vector3();
  private target = new Vector3();
  private endA = new Vector3();
  private endB = new Vector3();
  // Plane constants for points on the ground, in frame coordinates.
  private planes = this.frustum.planes;

  constructor(setup?: CameraSetup) { this.setup = setup; }

  set(pose: Pose) {
    const { camera, setup } = this;
    const { width, screen } = pose;
    this.screen = screen;
    camera.aspect = screen[0] / screen[1];
    const widthPerDepth = 2 * camera.aspect * tan;
    const polar = clamp(pose.tilt, setup?.rules.minTilt ?? .01, setup?.rules.maxTilt ?? 89) * rad;
    const bearing = pose.bearing * rad;
    const dir = this.dir.set(Math.sin(polar) * Math.sin(bearing), Math.cos(polar), Math.sin(polar) * Math.cos(bearing));
    let maxDistance = Infinity;
    const minDistance = (setup?.rules.minWidth ?? 1) / widthPerDepth;
    let center = pose.center;
    if (setup) {
      if (width === 'overview') center = setup.center;
      center = nearestOutlinePoint(setup.ground, center);
      const origin = this.target.set(setup.center[0], 0, setup.center[1]);
      const right = this.right.set(dir.z, 0, -dir.x).normalize();
      const up = this.up.crossVectors(dir, right);
      maxDistance = minDistance;
      for (const corner of setup.corners) {
        const rel = this.rel.subVectors(corner, origin);
        const span = Math.max(Math.abs(rel.dot(right)) / (tan * camera.aspect), Math.abs(rel.dot(up)) / tan);
        maxDistance = Math.max(maxDistance, rel.dot(dir) + setup.rules.fitPadding * span);
      }
    }
    const distance = width === 'overview' ? maxDistance : clamp(width / widthPerDepth, minDistance, maxDistance);
    if (!Number.isFinite(distance)) throw Error('Overview needs map bounds');
    const target = this.target.set(center[0], 0, center[1]);
    camera.position.copy(target).addScaledVector(dir, distance);
    camera.lookAt(target);
    let closest = Infinity, farthest = 0;
    for (const corner of setup?.corners ?? []) {
      const depth = this.rel.subVectors(camera.position, corner).dot(dir);
      closest = Math.min(closest, depth);
      farthest = Math.max(farthest, depth);
    }
    camera.near = setup ? Math.max(.1, closest * .75) : .1;
    camera.far = setup ? Math.max(camera.near + 1, farthest * 1.02 + 1) : distance * 8;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true);
    this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  }

  point(x: number, z: number, y = 0, margin = 0) {
    for (const { normal: n, constant } of this.planes)
      if (n.x * x + n.y * y + n.z * z + constant < -margin) return false;
    return true;
  }

  body(b: Body) {
    if (b.y < -2) return false;
    const { x, y, z, height, halfWidth, len } = b;
    const middle = y + height / 2;
    const radius = len / 2 + halfWidth + height / 2;
    if (!this.point(x, z, middle, radius)) return false;
    if (this.point(x, z, middle)) return true;
    const c = Math.cos(b.yaw), s = Math.sin(b.yaw);
    for (const { normal: n, constant } of this.planes) {
      const distance = n.x * x + n.y * middle + n.z * z + constant;
      const support = Math.abs(n.x * c + n.z * s) * len / 2
        + Math.abs(n.z * c - n.x * s) * halfWidth + Math.abs(n.y) * height / 2;
      if (distance + support < 0) return false;
    }
    // Clip the camera frustum in body-local coordinates to rule out diagonal corner misses.
    const center = [x, middle, z], half = [len / 2, height / 2, halfWidth];
    const planes = this.planes.map(({ normal: n, constant }) => [
      n.x * c + n.z * s, n.y, n.z * c - n.x * s,
      n.x * center[0] + n.y * center[1] + n.z * center[2] + constant,
    ]);
    for (let axis = 0; axis < 3; axis++) {
      for (const side of [-1, 1]) {
        let polygon = [[-1, -1], [-1, 1], [1, 1], [1, -1]].map(([a, b]) => {
          const vertex = [0, 0, 0];
          vertex[axis] = side * half[axis];
          vertex[(axis + 1) % 3] = a * half[(axis + 1) % 3];
          vertex[(axis + 2) % 3] = b * half[(axis + 2) % 3];
          return vertex;
        });
        for (const [a,b,c,d] of planes) {
          const next = [];
          for (let i = 0; i < polygon.length; i++) {
            const p = polygon[i], q = polygon[(i + 1) % polygon.length];
            const dp = a*p[0] + b*p[1] + c*p[2] + d, dq = a*q[0] + b*q[1] + c*q[2] + d;
            if (dp >= 0) next.push(p);
            if ((dp < 0) !== (dq < 0)) next.push(p.map((v, k) => v + (q[k] - v) * dp / (dp - dq)));
          }
          polygon = next;
          if (!polygon.length) break;
        }
        if (polygon.length) return true;
      }
    }
    return false;
  }

  pixels(b: Body) {
    const dx = Math.cos(b.yaw) * b.len / 2, dz = Math.sin(b.yaw) * b.len / 2;
    const a = this.endA.set(b.x - dx, b.y, b.z - dz).applyMatrix4(this.matrix);
    const f = this.endB.set(b.x + dx, b.y, b.z + dz).applyMatrix4(this.matrix);
    return Math.hypot((a.x - f.x) * this.screen[0] / 2, (a.y - f.y) * this.screen[1] / 2);
  }
}

type Event = {
  type: 'initial' | 'birth' | 'exit'; uid: number; time: number; x: number; z: number;
  link: string; cause: string; visible: boolean; pixels: number | null;
};
export class Lifecycle {
  events: Event[] = [];
  private previous = new Map<number, Event>();

  add(time: number, bodies: Iterable<Body & { visible?: boolean }>, view: CameraView, causes = new Map<number, string>()) {
    const now = new Map<number, Event>();
    for (const b of bodies) {
      const visible = b.visible ?? view.body(b);
      const event: Event = {
        type: time === 0 ? 'initial' : 'birth', time, uid: b.uid, x: b.x, z: b.z, link: b.link,
        cause: time === 0 ? 'initial-fill' : causes.get(b.uid) ?? 'unknown', visible,
        pixels: visible ? view.pixels(b) : null,
      };
      if (!this.previous.has(b.uid)) this.events.push(event);
      now.set(b.uid, event);
    }
    for (const [uid, old] of this.previous)
      if (!now.has(uid)) this.events.push({ ...old, type: 'exit', cause: causes.get(uid) ?? 'unknown' });
    this.previous = now;
  }
}

export function poseAt(frames: (Pose & { time: number })[], time: number): Pose {
  const right = frames.findIndex(frame => frame.time > time);
  if (right <= 0) return right < 0 ? frames.at(-1)! : frames[0];
  const a = frames[right - 1], b = frames[right], t = (time - a.time) / (b.time - a.time);
  const lerp = (x: number, y: number) => x + t * (y - x);
  return {
    screen: a.screen, center: [lerp(a.center[0], b.center[0]), lerp(a.center[1], b.center[1])],
    width: typeof a.width === 'number' && typeof b.width === 'number' ? lerp(a.width, b.width) : a.width,
    bearing: lerp(a.bearing, b.bearing), tilt: lerp(a.tilt, b.tilt),
  };
}
