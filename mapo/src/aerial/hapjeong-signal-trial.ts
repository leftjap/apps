import * as THREE from 'three';
import { GREEN, RED, YELLOW } from '../sim/intersection/signal.ts';
import { capStopSpeed, followingAcceleration, integrateSpeed, limitAcceleration } from '../sim/longitudinal.ts';
import { vehiclePlacement, vehicleShape, type TrialVehicle, type XZ } from './hapjeong-vehicles.ts';

type Vehicle = Pick<TrialVehicle,'kind'|'links'|'path'|'length'|'width'|'stop'|'start'|'end'|'exits'> &
  {group:number; speed:number; clearAt:number};
export type SignalTrial = {
  mode:'straight'|'left'; duration:number; clipSeconds:number; vehicles:Vehicle[]; groups:number[];
  labels:Record<number,string>; signalAnchors:Record<number,XZ>;
  view:{at:XZ;width:number};
};
const DT = 1/60;
const OPEN_AFTER = 7;
const MIN_GREEN = 6;
const AMBER = 3;
const ALL_RED = 2;
type LampColor = typeof GREEN | typeof YELLOW | typeof RED;

type State = {distance:number; speed:number; admitted:boolean; leader:number; followingBrake:boolean};

export function signalFrames(scene: SignalTrial) {
  const vehicles = scene.vehicles;
  const place = vehicles.map(vehiclePlacement);
  const same = vehicles.map(a => vehicles.map(b => a.links.every((id,i)=>id===b.links[i]) && a.links.length===b.links.length));
  const frames = [];
  let states: State[] = vehicles.map(v=>({distance:v.start,speed:v.speed,admitted:false,leader:-1,followingBrake:false}));
  let groupIndex = 0;
  let color: LampColor = RED;
  let changedAt = 0;
  for (let frame=0; frame<=scene.duration/DT; frame++) {
    const time = frame*DT;
    const group = scene.groups[groupIndex];
    const cleared = states.every(({admitted,distance,speed},i) => !admitted ||
      distance >= vehicles[i].clearAt || (vehicles[i].end-distance<.001 && speed<.02));
    if (color===RED && group!==undefined && time >= OPEN_AFTER &&
        time-changedAt >= ALL_RED && cleared) {
      color = GREEN;
      changedAt = time;
    } else if (color===GREEN && time-changedAt >= MIN_GREEN &&
               states.every((row,i)=>vehicles[i].group!==group || row.admitted)) {
      color = YELLOW;
      changedAt = time;
    } else if (color===YELLOW && time-changedAt >= AMBER) {
      color = RED;
      changedAt = time;
      groupIndex++;
    }
    const permitted = color===GREEN ? scene.groups[groupIndex] : -1;
    const colors = scene.groups.map<LampColor>(g => g===scene.groups[groupIndex] ? color : RED);
    frames.push({time,colors, vehicles:states.map((s,i)=>({...s,...place[i](s.distance)}))});
    if (groupIndex===scene.groups.length && time-changedAt>=ALL_RED && cleared) break;
    states = states.map((s,i)=>{
      const vehicle = vehicles[i];
      const stop = s.admitted || vehicle.group===permitted ? vehicle.end : vehicle.stop;
      const barrierGap = Math.max(0,stop-s.distance)+2;
      let gap = barrierGap;
      let lead = -1;
      for (let j=0;j<states.length;j++) {
        if (i===j || !same[i][j] || states[j].distance<=s.distance) continue;
        const bumperGap = states[j].distance-vehicles[j].length-s.distance;
        if (bumperGap<gap) {
          lead = j;
          gap = bumperGap;
        }
      }
      const free = vehicle.kind==='bus' ? 8 : 11;
      const a = followingAcceleration(s.speed,free,s.speed-(lead<0 ? 0 : states[lead].speed),gap,true);
      const bounded = limitAcceleration(a,s.speed,gap,lead<0);
      const integrated = integrateSpeed(s.speed,bounded,DT);
      const speed = lead<0 ? capStopSpeed(integrated,gap,DT) : integrated;
      const distance = Math.min(stop,s.distance+speed*DT);
      return {distance,speed,admitted:s.admitted || distance>vehicle.stop+1e-7,
              leader:lead,followingBrake:lead>=0 && bounded<-.05};
    });
  }
  return frames;
}

export type SignalFrame = ReturnType<typeof signalFrames>[number];

const lamps = { [GREEN]:'#59f29c', [YELLOW]:'#ffcd64', [RED]:'#ff685f' };
const names = { [GREEN]:'초록', [YELLOW]:'노랑', [RED]:'빨강' };

export function attachSignalTrial(model:THREE.Scene, scene:SignalTrial, render:()=>void, autoplay:boolean,
                                  setupOverlay?:(frames:SignalFrame[])=>(index:number)=>void, initialTime = 0) {
  const frames=signalFrames(scene);
  const drawOverlay=setupOverlay?.(frames);
  const duration=frames[frames.length-1].time;
  const controls=document.querySelector<HTMLElement>('#trial-controls')!;
  const toggle=document.querySelector<HTMLButtonElement>('#trial-play')!;
  const replay=document.querySelector<HTMLButtonElement>('#trial-replay')!;
  const seek=document.querySelector<HTMLInputElement>('#trial-time')!;
  const status=document.querySelector<HTMLOutputElement>('#trial-status')!;
  document.querySelector<HTMLElement>('#trial-explanation')!.textContent='승용차 5대와 버스 1대 · 접근 방향별 모의 신호 · 앞범퍼는 A2 진입 링크 끝에서 정차';
  const cars=scene.vehicles.map((v,i)=>vehicleShape(v,i));
  const signals=scene.groups.map(g=>{
    const material=new THREE.MeshBasicMaterial();
    const pole=new THREE.Mesh(new THREE.SphereGeometry(.95,16,12),material);
    const [x,z]=scene.signalAnchors[g];
    pole.position.set(x,4.7,z);
    return pole;
  });
  model.add(...cars,...signals);
  controls.hidden=false;
  seek.max=String(duration);
  let position=Math.min(duration, Math.max(0, initialTime)), frame:number|undefined, last:number|undefined;

  function draw() {
    const index=Math.round(position/DT);
    const state=frames[index];
    state.vehicles.forEach(({center,heading},i)=>{
      cars[i].position.set(center[0],.08,center[1]);
      cars[i].rotation.y=heading;
    });
    state.colors.forEach((color,i)=>signals[i].material.color.set(lamps[color]));
    seek.value=String(position);
    status.value=`${position.toFixed(1)}초 · ${scene.groups.map((g,i)=>`${scene.labels[g]} ${names[state.colors[i]]}`).join(' · ')}`;
    drawOverlay?.(index);
    render();
  }
  function pause() {
    if (frame!==undefined) cancelAnimationFrame(frame);
    frame=last=undefined;
    toggle.textContent=position>=duration ? '다시 재생' : '재생';
  }
  function loop(now:number) {
    if (last!==undefined) position=Math.min(duration,position+Math.min(.05,(now-last)/1000));
    last=now;
    draw();
    if (position>=duration) pause();
    else frame=requestAnimationFrame(loop);
  }
  function play() {
    if (position>=duration) position=0;
    toggle.textContent='일시정지';
    frame=requestAnimationFrame(loop);
  }
  seek.oninput=()=>{pause(); position=Number(seek.value); draw();};
  toggle.onclick=()=>{if(frame===undefined)play();else pause();};
  replay.onclick=()=>{pause(); position=0;draw();play();};
  draw();
  if(autoplay)play();
}
