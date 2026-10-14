import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,CIRCUITS,TRACK,sample,targetSpeed,clamp,angleDiff} from '../src/core.js';
import {THERMAL,thermalGrip,prepareTyres} from '../src/tyre-temperature.js';

function pushLaps(tyre,water,track='northline',pitStart=false){
 const r=new Race({track,laps:8,fuel:12,tyre,weather:'dry',aiSeed:17});r.countdown=0;r.cars=[r.player];const p=r.player;p.drive='push';
 if(pitStart)prepareTyres(p);
 let peak=-Infinity,lap=0;const results=[];
 for(let i=0;i<60*600 && lap<2 && !r.done;i++){
  const wet=typeof water==='function' ? water(lap) : water;
  if(wet){r.weather.pattern='showers';r.weather.elapsed=90;r.weather.rain=.85;r.weather.sectors.fill(wet);r.weather.wetness=wet;}
  else {r.weather.pattern='dry';r.weather.sectors.fill(0);r.weather.wetness=0;}
  const goal=sample(p.s+clamp(p.speed*.55,35,100));
  const steer=clamp(angleDiff(Math.atan2(goal.y-p.y,goal.x-p.x),p.angle)*3.5,-1,1),target=targetSpeed(p)*.94;
  r.step(1/60,{steer,throttle:p.speed<target,brake:p.speed>target+3});peak=Math.max(peak,...p.tyreTemperatures);
  const next=Math.floor(p.s/TRACK.length);
  if(next>lap){lap=next;results.push({peak,grip:thermalGrip(p),wear:p.wear,temperature:[...p.tyreTemperatures]});peak=-Infinity;}
 }
 assert.equal(results.length,2,`${track} ${tyre}: complete two push laps`);
 return results;
}
for(const [tyre,water] of [['M',0],['H',0],['I',.18],['I',.4],['W',.65],['W',1]]){
 test(`${tyre} at ${Math.round(water*100)}% water retains useful grip through two push laps on all 12 circuits`,()=>{
  for(const track of CIRCUITS)for(const lap of pushLaps(tyre,water,track.id)){
   assert.ok(lap.grip>.985,`${track.id} ${tyre}: thermal grip ${lap.grip}`);
   assert.ok(lap.peak<THERMAL[tyre].high+12,`${track.id} ${tyre}: peak ${lap.peak}`);
   assert.ok(lap.wear<.3,`${track.id} ${tyre}: two-lap wear ${lap.wear}`);
  }
 });
}
test('Mediums and Hards can warm after a pit stop without needing artificial preheated grip',()=>{
 for(const tyre of ['M','H']){
  const laps=pushLaps(tyre,0,'northline',true);
  assert.ok(laps[1].grip>.985);assert.ok(laps[1].temperature.every(t=>t>=THERMAL[tyre].low-5));
 }
});
test('Intermediate and Wet temperatures respond to actual drying, while dry Wets wear faster',()=>{
 const inter=pushLaps('I',lap=>lap===0 ? .4 : 0),wet=pushLaps('W',lap=>lap===0 ? 1 : 0);
 for(const [tyre,laps] of [['I',inter],['W',wet]]){
  assert.ok(laps[0].grip>.985);
  assert.ok(laps[1].peak>laps[0].peak+35,`${tyre}: dry running must heat tyres`);
  assert.ok(laps[1].wear-laps[0].wear>laps[0].wear*1.5,`${tyre}: dry running accelerates wear`);
 }
 assert.ok(wet[1].wear-wet[0].wear>inter[1].wear-inter[0].wear);
});
