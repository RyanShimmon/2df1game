import test from 'node:test';
import assert from 'node:assert/strict';
import {newCareer} from './career-fixture.js';
import {CIRCUITS,selectTrack,TRACK,AI_LINE} from '../src/core.js';
import {createWeekend,QualifyingRun} from '../src/weekend.js';
import {createWeather} from '../src/weather.js';
import {paceGeometry,laneGeometry,brakingTarget} from '../src/racecraft.js';
test('cached pace geometry matches exact steering geometry, including joins and road-edge offsets',()=>{
 for(const track of CIRCUITS){
  selectTrack(track.id);
  for(let s=0;s<TRACK.length;s+=17.3)for(const shift of [-60,-8,0,8,60]){
   const exact=laneGeometry(AI_LINE,s,shift),fast=paceGeometry(AI_LINE,s,shift);
   assert.ok(Math.abs(exact.curvature-fast.curvature)<1e-9,`${track.id} curvature at ${s}`);
   assert.ok(Math.abs(exact.distanceScale-fast.distanceScale)<1e-9,`${track.id} distance at ${s}`);
  }
 }
});
for(const [round,water] of [[1,0],[2,.8],[11,0],[11,.8]])test(`20 Hz completion preserves physical qualifying pace and tyre consumption: round ${round}, water ${water}`,()=>{
 function outing(dt){
  const career=newCareer({driverName:'Time tester',teamIndex:2});career.round=round;
  const w=createWeekend(career,{aiSeed:42,tyre:'S',difficulty:'normal'});w.weather=createWeather('dry');w.weather.rain=0;w.weather.wetness=water;w.weather.sectors=w.weather.sectors.map(()=>water);
  const q=new QualifyingRun(w,'S1',career.upgrades,career.profile,{freezeWeather:true}),car=q.cars[0];q.cars=[car];
  while(!w.results.length && q.time<600)q.step(dt,{});
  assert.ok(w.results.length,'a real timed lap must finish');
  return {time:w.results[0].time,wear:car.wear,distance:car.tyreSet.distance};
 }
 const live=outing(1/60),fast=outing(.05);
 assert.ok(Math.abs(fast.time/live.time-1)<.01,`pace ${JSON.stringify({live,fast})}`);
 assert.ok(Math.abs(fast.wear-live.wear)<.01,`wear ${JSON.stringify({live,fast})}`);
 assert.ok(Math.abs(fast.distance/live.distance-1)<.01,'same physical route must be charged');
});

test('a lower out-lap or pit speed ceiling gives the same braking result as limiting the full projection',()=>{
 for(const id of ['northline','harbour','canyon']){
  selectTrack(id);
  for(let s=0;s<TRACK.length;s+=177)for(const waterGrip of [.25,1,1.3])for(const cap of [80,210/.82]){
   const args=[AI_LINE,s,waterGrip,220*waterGrip,360,.94,20];
   assert.ok(Math.abs(Math.min(cap,brakingTarget(...args))-brakingTarget(...args,cap))<1e-9);
  }
 }
});
