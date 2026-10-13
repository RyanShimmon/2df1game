import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,resources,sample,grip,angleDiff,selectTrack} from '../src/core.js';
import {createWeather,advanceWeather,trackWater} from '../src/weather.js';
test.afterEach(()=>selectTrack('northline'));
function driedWeather(pattern){const w=createWeather(pattern);for(let i=0;i<600;i++)advanceWeather(w,1);return w;}
test('all slicks recover identical dry wear after a wet start or mid-race rain',()=>{
 for(const pattern of ['wetToDry','showers']){
  const w=driedWeather(pattern);assert.equal(w.wetness,0);assert.ok(w.sectors.every(x=>x===0));
  for(const tyre of ['S','M','H'])for(const effort of [.72,1,1.18])for(const upgrade of [0,3]){
   const a=new Race({laps:16,fuel:18,tyre,weather:'dry'},{tyres:upgrade}).player;
   const b={...a,used:new Set(a.used)};a.wear=b.wear=.2;
   for(let i=0;i<320;i++){
    a.trackWetness=0;b.trackWetness=trackWater(w,i/320*TRACK.length,TRACK.length,0);
    resources(a,1/60,TRACK.length/320,effort);resources(b,1/60,TRACK.length/320,effort);
   }
   assert.ok(Math.abs(a.wear-b.wear)<1e-12,`${pattern} ${tyre}: dry wear retained a weather-history difference`);
  }
 }
});
test('soft wear rises continuously as the same surface dries and reaches its original dry rate',()=>{
 const w=createWeather('wetToDry');advanceWeather(w,120);let previous=0;
 for(let t=120;t<=600;t++){
  if(t>120)advanceWeather(w,1);
  const p=new Race({laps:16,fuel:18,tyre:'S',weather:'dry'}).player;
  p.trackWetness=trackWater(w,1000,TRACK.length,0);resources(p,0,TRACK.length);
  assert.ok(p.wear>=previous-1e-12);previous=p.wear;
 }
 assert.ok(Math.abs(previous-1/9)<1e-12);
});
function drivenLap(weather){
 const r=new Race({track:'northline',laps:1,fuel:3,tyre:'S',weather:'dry'}),p=r.player,loc=sample(0);
 r.weather=weather;r.cars=[p];r.countdown=0;r.time=600;
 Object.assign(p,{s:0,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,lapStart:r.time});p.used.add('H');
 for(let i=0;i<60*300&&!r.done;i++){
  const goal=sample(p.s+Math.max(35,Math.min(90,p.speed*.5))),desired=Math.atan2(goal.y-p.y,goal.x-p.x);
  const target=Math.min(180,Math.sqrt(225*grip(p)/Math.max(.001,Math.abs(angleDiff(sample(p.s+100).angle,sample(p.s).angle))/100))*.75);
  r.step(1/60,{steer:Math.max(-1,Math.min(1,angleDiff(desired,p.angle)*3.5)),throttle:p.speed<target,brake:p.speed>target+3});
 }
 assert.ok(r.done&&!r.result.dnf);return r;
}
test('a complete soft-tyre player lap wears and drives identically on an originally dry and fully dried track',t=>{
 const dry=drivenLap(driedWeather('dry')),dried=drivenLap(driedWeather('wetToDry'));
 assert.ok(Math.abs(dry.player.wear-dried.player.wear)<1e-12);
 assert.ok(Math.abs(dry.result.bestLap-dried.result.bestLap)<1e-12);
 t.diagnostic(`Both laps: ${(dry.player.wear*100).toFixed(2)}% soft wear, ${dry.result.bestLap.toFixed(2)}s`);
});
