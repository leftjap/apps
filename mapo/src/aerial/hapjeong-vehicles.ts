import * as THREE from 'three';

export type XZ = [number, number];
type Profile = { ramp: number; duration: number };
export type TrialVehicle = {
  kind: 'car' | 'bus';
  links: string[];
  path: XZ[];
  length: number;
  width: number;
  start: number;
  stop: number;
  end: number;
  exits: boolean;
  approach: Profile;
  departure: Profile;
  departAt: number;
};
export type Trial = { vehicles: TrialVehicle[]; duration: number };
export type Pose = {
  front: XZ;
  center: XZ;
  heading: number;
  distance: number;
  phase: 'approach' | 'stopped' | 'departure' | 'finished';
};

function pointOnPath(path: XZ[], lengths: number[], distance: number): XZ {
  if (distance <= 0) return path[0];
  if (distance >= lengths[lengths.length-1]) return path[path.length-1];
  let lo = 0, hi = lengths.length - 1;
  while (lo+1 < hi) {
    const mid = (lo+hi) >> 1;
    if (lengths[mid] <= distance) lo = mid;
    else hi = mid;
  }
  const [x,z] = path[lo];
  const [endX,endZ] = path[hi];
  const t = (distance-lengths[lo])/(lengths[hi]-lengths[lo]);
  return [x+(endX-x)*t,z+(endZ-z)*t];
}

function progress(time: number, { ramp, duration }: Profile) {
  const t = THREE.MathUtils.clamp(time,0,duration);
  const scale = duration-ramp;
  if (t < ramp) return t*t/(2*ramp*scale);
  if (t > duration-ramp) return 1-(duration-t)**2/(2*ramp*scale);
  return (t-ramp/2)/scale;
}

export function vehicleMotion(vehicle: TrialVehicle) {
  const lengths = [0];
  for (let i=1;i<vehicle.path.length;i++) {
    const [x,z] = vehicle.path[i-1];
    const [nextX,nextZ] = vehicle.path[i];
    lengths.push(lengths[i-1]+Math.hypot(nextX-x,nextZ-z));
  }
  return (time: number): Pose => {
    const after = time-vehicle.departAt;
    const phase = time < vehicle.approach.duration ? 'approach'
      : after < 0 ? 'stopped' : time < vehicle.departAt+vehicle.departure.duration ? 'departure' : 'finished';
    const distance = phase === 'approach'
      ? vehicle.start+(vehicle.stop-vehicle.start)*progress(time,vehicle.approach)
      : phase === 'stopped' ? vehicle.stop : phase === 'finished' ? vehicle.end
      : vehicle.stop+(vehicle.end-vehicle.stop)*progress(after,vehicle.departure);
    const front = pointOnPath(vehicle.path,lengths,distance);
    const behind = pointOnPath(vehicle.path,lengths,distance-vehicle.length);
    const dx = front[0]-behind[0], dz = front[1]-behind[1];
    const scale = vehicle.length/(2*Math.hypot(dx,dz));
    return {
      front, center:[front[0]-dx*scale,front[1]-dz*scale],
      heading:Math.atan2(dx,dz), distance, phase,
    };
  };
}

function vehicleShape({kind,length,width}: TrialVehicle, index: number) {
  const group = new THREE.Group();
  const bus = kind==='bus';
  const paint = bus ? '#77bc4c' : ['#fff1d6','#3fb4d8','#e85646','#f3bc45','#777de8'][index-1];
  const body = new THREE.MeshLambertMaterial({color:paint});
  const window = new THREE.MeshLambertMaterial({color:'#243945'});
  const wheel = new THREE.MeshLambertMaterial({color:'#283034'});
  const lamp = new THREE.MeshBasicMaterial({color:'#fff6cf'});
  function part(w: number, h: number, l: number, x: number, y: number, z: number, material: THREE.Material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w,h,l),material);
    mesh.position.set(x,y,z);
    group.add(mesh);
  }
  part(width,bus ? 1.0 : .72,length,0,bus ? .76 : .60,0,body);
  if (bus) {
    part(width*.99,1.15,length*.91,0,1.83,0,window);
    part(width,.27,length*.99,0,2.54,0,body);
    for (const z of [-.30,0,.30]) part(width,.98,.10,0,1.85,z*length,body);
  } else {
    part(width*.85,.58,length*.55,0,1.09,-length*.04,window);
    part(width*.84,.12,length*.51,0,1.43,-length*.05,body);
  }
  for (const x of [-1,1]) {
    for (const z of [-1,1]) part(.22,bus ? .75 : .53,bus ? .75 : .62,x*(width/2-.11),bus ? .40 : .30,z*length*.31,wheel);
    part(width*.18,.12,.025,x*width*.3,bus ? .78 : .61,length/2-.014,lamp);
  }
  return group;
}

export function attachTrial(scene: THREE.Scene, trial: Trial, render: () => void, autoplay: boolean) {
  const controls = document.querySelector<HTMLElement>('#trial-controls')!;
  const toggle = document.querySelector<HTMLButtonElement>('#trial-play')!;
  const replay = document.querySelector<HTMLButtonElement>('#trial-replay')!;
  const seek = document.querySelector<HTMLInputElement>('#trial-time')!;
  const status = document.querySelector<HTMLOutputElement>('#trial-status')!;
  const vehicles = trial.vehicles.map((vehicle,i) => {
    const object = vehicleShape(vehicle,i);
    scene.add(object);
    return {object, sample:vehicleMotion(vehicle)};
  });
  const names = {approach:'접근', stopped:'모의 정차', departure:'출발·주행', finished:'종료'};
  controls.hidden = false;
  seek.max = String(trial.duration);
  let time = 0;
  let playing = false;
  let frame: number | undefined;
  let last: number | undefined;

  function update() {
    const states = {approach:0,stopped:0,departure:0,finished:0};
    for (const {object,sample} of vehicles) {
      const pose = sample(time);
      states[pose.phase]++;
      object.position.set(pose.center[0],.08,pose.center[1]);
      object.rotation.y = pose.heading;
    }
    seek.value = String(time);
    status.value = `${time.toFixed(1)}초 · ${Object.entries(states).filter(([,n])=>n)
      .map(([key,n])=>`${names[key as keyof typeof names]} ${n}대`).join(' · ')}`;
    render();
  }

  function pause() {
    if (frame !== undefined) cancelAnimationFrame(frame);
    frame = undefined;
    last = undefined;
    playing = false;
    toggle.textContent = time >= trial.duration ? '다시 재생' : '재생';
  }

  function tick(now: number) {
    if (last !== undefined) time = Math.min(trial.duration,time+Math.min(.05,(now-last)/1000));
    last = now;
    update();
    if (time >= trial.duration) pause();
    else frame = requestAnimationFrame(tick);
  }

  function play() {
    if (time >= trial.duration) time = 0;
    playing = true;
    toggle.textContent = '일시정지';
    frame = requestAnimationFrame(tick);
  }

  toggle.addEventListener('click',()=>{ if (playing) pause(); else play(); });
  replay.addEventListener('click',()=>{
    pause();
    time = 0;
    update();
    play();
  });
  seek.addEventListener('input',()=>{
    pause();
    time = Number(seek.value);
    update();
    if (time >= trial.duration) pause();
  });
  update();
  if (autoplay) play();
}
