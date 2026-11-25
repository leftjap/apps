// Check the camera census on small, deterministic replays.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { LaneUse } from './camera_car_metrics.mts';
import type { HapjeongCars, XZ } from '../../src/aerial/hapjeong-car-graph.ts';
import { CameraView, Lifecycle } from './camera_car_view.mts';

const view = new CameraView();
const pose = { screen: [400, 400] as [number, number], center: [0, 0] as [number, number],
  width: 100, bearing: 0, tilt: 15 };
const car = (uid: number, x: number, len = 4) =>
  ({ uid, x, y: 0, z: 0, yaw: 0, len, halfWidth: 1, height: 1.5, link: 'lane' });

test('lifecycle uses the last observed camera and excludes initial fill and the recording end', () => {
  const audit = new Lifecycle();
  view.set(pose);
  audit.add(0, [car(1, 0), car(2, 200)], view);
  audit.add(1, [car(1, 0), car(2, 200), car(3, 48)], view);
  view.set({ ...pose, center: [200, 0] });
  audit.add(2, [car(2, 200), car(3, 48)], view);
  audit.add(3, [car(2, 200)], view);
  assert.deepEqual(audit.events.filter(e => e.visible).map(e => [e.type, e.uid, e.time]), [
    ['initial', 1, 0], ['birth', 3, 1], ['exit', 1, 1],
  ]);
  assert.equal(audit.events.filter(e => e.type === 'exit').length, 2);
});

test('a bumper crossing the screen edge counts and pixel length uses the projected car axis', () => {
  view.set(pose);
  assert.equal(view.body(car(1, 51)), true);
  assert.equal(view.body(car(1, 53)), false);
  assert.ok(Math.abs(view.pixels(car(1, 0)) - 16) < .01);
  view.set({ ...pose, width: 1900 });
  assert.ok(view.pixels(car(1, 0)) < 2);
  assert.equal(view.point(0, 0), true);
});


test('coverage includes visible source lanes which the current route graph never drives', () => {
  const lane = (id: string, z: number, duplicateOf: string | null = null): HapjeongCars['links'][number] =>
    ({id,kind:'6',rank:2,points:[[-10,z],[10,z]] as XZ[],len:20,next:[],stop:null,duplicateOf});
  const used = lane('used',0);
  const use = new LaneUse({links:[used,lane('unrouted',8),lane('duplicate',0,'used')]},
    {links:[used],edges:[{len:20}]},{used:'양화로'});
  view.set(pose);
  const row = {...car(1,-10),edge:0,lane:0,model:0,speed:4,at:0,visible:true};
  use.add([row],view,true);
  use.add([{...row,x:10,at:20}],view,false);
  const result = use.result();
  assert.equal(result.visibleM,40);
  assert.equal(result.usedM,20);
  assert.equal(result.coveragePct,50);
  assert.equal(result.byRoad['양화로'].coveragePct,100);
});
