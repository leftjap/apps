import { RED } from '../sim/intersection/signal.ts';
import { BODY_R } from '../sim/people/index.ts';
import type { WalkGraph, WalkJson } from '../sim/walknet.ts';
import type { SignalFrame, SignalTrial } from './hapjeong-signal-trial.ts';
import type { XZ } from './hapjeong-vehicles.ts';

export type HapjeongWalk = WalkJson & { crossings: string[] };

// The trial cars already have a continuous pose trajectory. Test the full
// crossing corridor against their rectangles in each shared playback frame.
export function vehicleTouchesPath(path: XZ[], pose: SignalFrame['vehicles'][number], halfWidth: number, halfLength: number) {
  const sin = Math.sin(pose.heading), cos = Math.cos(pose.heading);
  const local = path.map(([x, z]) => {
    const dx = x - pose.center[0], dz = z - pose.center[1];
    return [dx * cos - dz * sin, dx * sin + dz * cos];
  });
  return local.slice(1).some(([x, z], i) => {
    const [a, b] = local[i];
    return Math.min(a, x) <= halfWidth && Math.max(a, x) >= -halfWidth &&
      Math.min(b, z) <= halfLength && Math.max(b, z) >= -halfLength &&
      Math.abs(a * z - b * x) <= halfWidth * Math.abs(z - b) + halfLength * Math.abs(x - a);
  });
}

export function walkSignals(graph: WalkGraph, ids: string[], rehearsed: ReadonlySet<string>, trial: SignalTrial, frames: SignalFrame[]) {
  return graph.links.map(link => {
    const path: XZ[] = [[link.pax, link.paz], [link.ax, link.az], [link.bx, link.bz], [link.pbx, link.pbz]];
    const length = path.slice(1).reduce((sum, [x, z], i) => sum + Math.hypot(x - path[i][0], z - path[i][1]), 0);
    const margin = Math.max(.2, link.wid / 2 - .3) + BODY_R + .20;
    const groups = new Set<number>();
    const occupied = Uint8Array.from(frames, frame => {
      let touches = 0;
      frame.vehicles.forEach((pose, i) => {
        const v = trial.vehicles[i];
        if (vehicleTouchesPath(path, pose, v.width / 2 + margin, v.length / 2 + margin)) {
          touches = 1;
          groups.add(trial.groups.indexOf(v.group));
        }
      });
      return touches;
    });
    const conflicts = [...groups];
    const left = new Float32Array(frames.length);
    if (conflicts.length || rehearsed.has(ids[link.xw])) {
      // Keep the first rehearsal window red to show the approach and wait.
      // Unoccupied red from every conflicting arm defines the whole window,
      // including clearance, for the original engine's seconds-left check.
      let end = frames.length - 1;
      for (let i = end - 1; i >= 0; i--) {
        const frame = frames[i];
        if (frame.time < 7 || occupied[i] || conflicts.some(group => frame.colors[group] !== RED)) {
          end = i;
        } else {
          left[i] = frames[end].time - frame.time;
        }
      }
      for (let i = 0; i < left.length; i++) {
        if (left[i] > length / 2.2 + 1) {
          while (left[i + 1]) i++;
        } else {
          left[i] = 0;
        }
      }
    }
    return { left, groups: conflicts, occupied };
  });
}
