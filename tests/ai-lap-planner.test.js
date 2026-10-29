import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,TRACK,AI_LINE} from '../src/core.js';
import {racingPoint,paceGeometry} from '../src/racecraft.js';
import {benchmarkAero} from '../scripts/benchmark-aero.mjs';

test.afterEach(()=>selectTrack('northline'));
test('Copper Canyon uses one continuous curve for planning, steering and braking, including the lap seam',()=>{
 selectTrack('canyon');
 for(let i=0;i<AI_LINE.points.length;i++){
  const s=i*AI_LINE.step,a=racingPoint(AI_LINE,s-.001),b=racingPoint(AI_LINE,s+.001);
  assert.ok(Math.abs(a.curvature-b.curvature)<.00001,'no artificial curvature spike at a spline join');
  for(const d of [0,AI_LINE.step*.5]){
   const actual=racingPoint(AI_LINE,s+d),forecast=paceGeometry(AI_LINE,s+d);
   assert.ok(Math.abs(actual.curvature-forecast.curvature)<1e-10);
   assert.ok(Math.abs(actual.distanceScale-forecast.distanceScale)<1e-10);
   assert.ok(Math.abs(actual.offset)<TRACK.width/2-14);
  }
 }
 assert.ok(AI_LINE.estimatedTime<AI_LINE.baselineTime*.98);
});
test('Copper Canyon flows through linked esses without extra grip or leaving the road',()=>{
 const run=benchmarkAero('canyon').results.balanced;
 // Matched v1.8 baseline: 48.0174s; these five esses bins averaged 216.38 km/h.
 assert.ok(run.lap<46.6,`lap ${run.lap}`);
 const speed=run.speeds.slice(2,7).reduce((a,b)=>a+b,0)/5;
 assert.ok(speed>228,`esses speed ${speed}`);
 assert.equal(run.trackLimits,0);assert.ok(run.maxHeadingError<.01);
});
