import * as THREE from 'three';
import { RED } from '../sim/intersection/signal.ts';
import type { SignalFrame, SignalTrial } from './hapjeong-signal-trial.ts';
import type { XZ } from './hapjeong-vehicles.ts';
import { env, updateEnv } from '../render/env.ts';
import { makeWalkerMesh } from '../render/walkers.ts';
import { decodeWalk } from '../sim/walknet.ts';
import { peoplePlayback, type PeopleRehearsal } from './hapjeong-people.ts';
import { vehicleTouchesPath, type HapjeongWalk } from './hapjeong-walk-signals.ts';
import type { Portal } from '../sim/people/index.ts';

type Leg = {path:XZ[]; crossing?:string};
type Walker = {id:string; label:string; legs:Leg[]; view:{at:XZ; width:number}};
export type PedestrianTrial = {radius:number; traffic:'straight'; platform:string; people:Walker[]};

const DT = 1/60;
const SPEED = 1.35;
const FOOT = .02;
const START_PHASE = 7;
const PHASE_SECONDS = 12;
const ENTRY_SECONDS = 3;

function track(path:XZ[]) {
  const lengths = [0];
  for (let i=1;i<path.length;i++) {
    lengths.push(lengths[i-1]+Math.hypot(path[i][0]-path[i-1][0],path[i][1]-path[i-1][1]));
  }
  return {
    length:lengths[lengths.length-1],
    at(distance:number) {
      let i = 1;
      while (i<path.length-1 && distance>lengths[i]) i++;
      const [x,z]=path[i-1], [nextX,nextZ]=path[i];
      const portion=Math.min(1,(distance-lengths[i-1])/(lengths[i]-lengths[i-1]));
      return {
        position:[x+(nextX-x)*portion,z+(nextZ-z)*portion] as XZ,
        direction:Math.atan2(nextX-x,nextZ-z),
      };
    },
  };
}

function entrySignal(path:XZ[], length:number, radius:number, traffic:SignalTrial, frames:SignalFrame[]) {
  const conflictGroups = new Set<number>();
  const occupied=[0];
  // Extra clearance also covers the distance a vehicle can move between 60 Hz samples.
  const margin=radius+.20;
  for (const frame of frames) {
    let blocked=false;
    frame.vehicles.forEach((pose,i)=>{
      const v=traffic.vehicles[i];
      if (vehicleTouchesPath(path,pose,v.width/2+margin,v.length/2+margin)) {
        blocked=true;
        conflictGroups.add(traffic.groups.indexOf(v.group));
      }
    });
    occupied.push(occupied[occupied.length-1]+Number(blocked));
  }
  const crossingFrames=Math.ceil(length/(SPEED*DT))+1;
  return frames.map((frame,i)=>{
    const end=i+crossingFrames;
    return end<occupied.length && frame.time>=START_PHASE &&
      (frame.time-START_PHASE)%PHASE_SECONDS<ENTRY_SECONDS &&
      occupied[end]===occupied[i] && [...conflictGroups].every(group=>frame.colors[group]===RED);
  });
}

type Status = 'walk'|'wait'|'cross'|'arrived';

export function pedestrianFrames(scene:PedestrianTrial, traffic:SignalTrial, frames:SignalFrame[]) {
  const routes=scene.people.map(p=>p.legs.map(leg=>{
    const line=track(leg.path);
    return {line, green:leg.crossing ? entrySignal(leg.path,line.length,scene.radius,traffic,frames) : null};
  }));
  const states=routes.map(route=>({
    leg:0, distance:0, travelled:0, done:0, heading:route[0].line.at(0).direction,
    status:(route[0].green ? 'wait' : 'walk') as Status,
  }));
  return frames.map((frame,i)=>{
    const people=states.map((s,j)=>{
      const route=routes[j];
      const leg=route[s.leg];
      const point=leg.line.at(s.distance);
      const delta=point.direction-s.heading;
      s.heading+=Math.max(-7*DT,Math.min(7*DT,Math.atan2(Math.sin(delta),Math.cos(delta))));
      const green=leg.green?.[i] ?? false;
      const pose={...s,green,position:point.position,y:FOOT};
      if (s.status==='arrived' || (s.status==='wait' && !green)) return pose;
      if (s.status==='wait') s.status='cross';
      const step=Math.min(SPEED*DT, leg.line.length-s.distance);
      s.travelled+=step;
      s.distance+=step;
      if (s.distance>=leg.line.length-1e-9) {
        if (leg.green) s.done++;
        if (s.leg===route.length-1) {
          s.status='arrived';
        } else {
          s.leg++;
          s.distance=0;
          s.status=route[s.leg].green?'wait':'walk';
        }
      }
      return pose;
    });
    return {...frame,people};
  });
}


export function attachHapjeongPeople(model: THREE.Scene, camera: THREE.PerspectiveCamera, canvas: HTMLCanvasElement,
                                    asset: HapjeongWalk & { portals: Portal[] }, rehearsal: PeopleRehearsal,
                                    traffic: SignalTrial, frames: SignalFrame[]) {
  const playback = peoplePlayback(asset, rehearsal, traffic, frames, true);
  const mesh = makeWalkerMesh(playback.max);
  const status = document.querySelector<HTMLOutputElement>('#pedestrian-status')!;
  const sky = document.createElement('div');
  const point = new THREE.Vector3();
  const lamps = decodeWalk(asset).links.flatMap(link => {
    if (!playback.signals[link.xw].left.some(seconds => seconds > 0)) return [];
    const material = new THREE.MeshBasicMaterial();
    const geometry = new THREE.SphereGeometry(.24, 8, 6);
    for (const [x, z] of [[link.pax, link.paz], [link.pbx, link.pbz]]) {
      const lamp = new THREE.Mesh(geometry, material);
      lamp.position.set(x, 1.6, z);
      model.add(lamp);
    }
    return [{ xw: link.xw, material }];
  });
  model.add(mesh.mesh, mesh.flash);
  status.hidden = false;

  return (index: number) => {
    const people = playback.at(index);
    const { w, MODES } = people;
    env.uProjK.value = canvas.clientHeight / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    updateEnv(playback.now(index), frames[index].time, sky);
    mesh.update(w, camera);
    for (const lamp of lamps) lamp.material.color.set(playback.signals[lamp.xw].left[index] > 0 ? '#53ed85' : '#fb5047');
    let visible = 0, waiting = 0, crossing = 0;
    for (let i = 0; i < w.n; i++) {
      point.set(w.x[i], .8, w.z[i]).project(camera);
      if (w.fade[i] < .2 || Math.abs(point.x) > 1 || Math.abs(point.y) > 1 || Math.abs(point.z) > 1) continue;
      visible++;
      const mode = people.stateOf(i).mode;
      if (mode === MODES.WAITX) waiting++;
      if (mode === MODES.CROSS) crossing++;
    }
    status.value = `화면에 ${visible}명 · 신호 대기 ${waiting}명 · 횡단 ${crossing}명`;
    Object.assign(status.dataset, { visible, waiting, crossing, total: w.n });
  };
}
