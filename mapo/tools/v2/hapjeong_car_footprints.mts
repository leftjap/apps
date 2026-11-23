// Project the native vehicle geometry into the same metre frame as A2.
import { SHAPES } from '../../src/render/cars.ts';

console.log(JSON.stringify(Object.fromEntries(Object.entries(SHAPES).map(([name, make]) => {
  const geometry = make(), vertices = geometry.getAttribute('position');
  const footprint = Array.from({length:vertices.count}, (_,i)=>[vertices.getX(i),vertices.getZ(i)]);
  geometry.dispose();
  return [name, footprint];
}))));
