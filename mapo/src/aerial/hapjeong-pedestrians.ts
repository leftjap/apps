import * as THREE from 'three';
import { RED } from '../sim/intersection/signal.ts';
import type { SignalFrame, SignalTrial } from './hapjeong-signal-trial.ts';
import type { XZ } from './hapjeong-vehicles.ts';
import { AERIAL_BEARING } from './road-overlay.ts';

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

function vehicleTouchesPath(path:XZ[], pose:SignalFrame['vehicles'][number], halfWidth:number, halfLength:number) {
  // Transform the walk line into the vehicle frame and use separating axes.
  const sin=Math.sin(pose.heading), cos=Math.cos(pose.heading);
  const local=path.map(([x,z])=>{
    const dx=x-pose.center[0], dz=z-pose.center[1];
    return [dx*cos-dz*sin,dx*sin+dz*cos];
  });
  return local.slice(1).some(([x,z],i)=>{
    const [a,b]=local[i];
    return Math.min(a,x)<=halfWidth && Math.max(a,x)>=-halfWidth &&
      Math.min(b,z)<=halfLength && Math.max(b,z)>=-halfLength &&
      Math.abs(a*z-b*x)<=halfWidth*Math.abs(z-b)+halfLength*Math.abs(x-a);
  });
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

const COLORS=['#52d4ff','#f095e8','#ffba55'];
const STATUS={walk:'보도 이동',wait:'적색 대기',cross:'횡단 중',arrived:'도착'};

function figure(color:string, number:number) {
  const group=new THREE.Group();
  const outfit=new THREE.MeshLambertMaterial({color});
  const trousers=new THREE.MeshLambertMaterial({color:'#243140'});
  const skin=new THREE.MeshLambertMaterial({color:'#eac1a1'});
  const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.145,.40,3,10),outfit);
  torso.scale.z=.70;
  torso.position.y=1.0;
  const head=new THREE.Mesh(new THREE.SphereGeometry(.14,12,10),skin);
  head.position.y=1.46;
  group.add(torso,head);
  const legs=[-.08,.08].map(x=>{
    const joint=new THREE.Group();
    joint.position.set(x,.62,0);
    const piece=new THREE.Mesh(new THREE.CapsuleGeometry(.052,.49,3,8),trousers);
    piece.position.y=-.324;
    joint.add(piece);
    group.add(joint);
    return joint;
  });
  const arms=[-.16,.16].map(x=>{
    const joint=new THREE.Group();
    joint.position.set(x,1.18,0);
    const piece=new THREE.Mesh(new THREE.CapsuleGeometry(.041,.27,3,8),outfit);
    piece.position.y=-.18;
    joint.add(piece);
    group.add(joint);
    return joint;
  });
  const canvas=document.createElement('canvas');
  canvas.width=canvas.height=96;
  const context=canvas.getContext('2d')!;
  context.fillStyle='#162229';
  context.beginPath();
  context.arc(48,48,37,0,Math.PI*2);
  context.fill();
  context.strokeStyle=color;
  context.lineWidth=7;
  context.stroke();
  context.fillStyle='white';
  context.font='bold 51px system-ui';
  context.textAlign='center';
  context.textBaseline='middle';
  context.fillText(String(number),48,50);
  const texture=new THREE.CanvasTexture(canvas);
  texture.colorSpace=THREE.SRGBColorSpace;
  const label=new THREE.Sprite(new THREE.SpriteMaterial({map:texture}));
  label.scale.set(1.65,1.65,1);
  return {group,label,legs,arms};
}

export function attachPedestrians(model:THREE.Scene, scene:PedestrianTrial, traffic:SignalTrial, frames:SignalFrame[]) {
  const playback=pedestrianFrames(scene,traffic,frames);
  const models=scene.people.map((_,i)=>figure(COLORS[i],i+1));
  const cues=models.map(()=>new THREE.Mesh(new THREE.SphereGeometry(.32,12,8),new THREE.MeshBasicMaterial()));
  model.add(...models.flatMap(p=>[p.group,p.label]),...cues);
  const display=document.querySelector<HTMLElement>('#pedestrian-status')!;
  display.hidden=false;
  const labels=scene.people.map((walker,i)=>{
    const row=document.createElement('li');
    const marker=document.createElement('span');
    marker.textContent=String(i+1);
    marker.style.color=COLORS[i];
    const label=document.createTextNode('');
    row.append(marker,label);
    display.append(row);
    return {walker,label,row};
  });
  return (index:number)=>{
    const frame=playback[index];
    frame.people.forEach((p,i)=>{
      const m=models[i];
      const swing=p.status==='walk'||p.status==='cross' ? Math.sin(p.travelled*Math.PI/.54)*.27 : 0;
      m.group.position.set(p.position[0],p.y,p.position[1]);
      m.group.rotation.y=p.heading;
      // Keep the tracking number beside the silhouette, independent of body heading.
      m.label.position.set(p.position[0]+1.55*Math.cos(AERIAL_BEARING),1.65,
                           p.position[1]-1.55*Math.sin(AERIAL_BEARING));
      m.legs.forEach((leg,j)=>leg.rotation.x=(j===0?1:-1)*swing);
      m.arms.forEach((arm,j)=>arm.rotation.x=(j===0?-1:1)*swing);
      const {walker,label,row}=labels[i];
      const leg=walker.legs[p.leg];
      const cue=cues[i];
      cue.visible=Boolean(leg.crossing) && p.status!=='arrived';
      if (cue.visible) {
        const [start,next]=leg.path;
        const angle=Math.atan2(next[0]-start[0],next[1]-start[1]);
        cue.position.set(start[0]+.8*Math.cos(angle),1.8,start[1]-.8*Math.sin(angle));
        cue.material.color.set(p.green?'#53fc96':'#ff645e');
      }
      row.dataset.state=p.status;
      row.dataset.signal=p.green?'green':'red';
      row.dataset.position=p.position.join(',');
      const step=p.status==='wait' && p.green ? '녹색 진입' : STATUS[p.status];
      const signal=p.status==='cross' ? (p.green?' · 녹색':' · 진입 적색') : '';
      label.data=` ${walker.label} · ${step}${signal} · ${p.done}/${walker.legs.filter(leg=>leg.crossing).length} 횡단`;
    });
  };
}
