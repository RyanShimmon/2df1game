import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,sample,grip,accelerationGrip,resources} from '../src/core.js';
import {createWeather} from '../src/weather.js';
import {WEEKENDS} from '../src/weekend.js';
const upgrades={engine:0,aero:0,tyres:0,crew:0};
const car=(tyre,water=0)=>({tyre,trackWetness:water,tyreAge:1000,wear:0,offset:0,upgrades,fuel:14,drive:'balanced'});
test('dry intermediates and wets have strong longitudinal grip without gaining cornering grip',()=>{
 for(const tyre of ['I','W']) {
  const p=car(tyre);
  assert.ok(accelerationGrip(p)>.95);assert.ok(accelerationGrip(p)>grip(p)*1.3);
 }
 for(const [tyre,water] of [['W',1],['I',.5],['S',0],['M',0],['H',0]])
  assert.equal(accelerationGrip(car(tyre,water)),grip(car(tyre,water)));
});
test('dry wet tyres accelerate close to mediums through actual player inputs',()=>{
 const speeds={};
 for(const tyre of ['M','I','W']) {
  const r=new Race({laps:12,fuel:14,tyre,weather:'dry'},upgrades),p=r.player,loc=sample(500);
  r.weather=createWeather('dry');Object.assign(p,{s:500,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:20,tyreAge:1000});
  for(let i=0;i<30;i++)r.stepPlayer(p,1/60,{throttle:true});
  speeds[tyre]=p.speed-20;
 }
 assert.ok(speeds.I>speeds.M*.94);assert.ok(speeds.W>speeds.M*.94);
});
test('dry asphalt wears wets faster than intermediates and both faster than their intended conditions',()=>{
 const wear=(tyre,water)=>{const p=car(tyre,water);resources(p,0,TRACK.length);return p.wear;};
 assert.ok(wear('W',0)>wear('I',0));
 assert.ok(wear('W',0)>wear('W',1)*3.5);
 assert.ok(wear('I',0)>wear('I',.5)*2.3);
});
test('career calendar uses 32-lap Grands Prix and 12-lap Sprints and retains the sprint format',()=>{
 assert.equal(WEEKENDS.length,12);assert.equal(WEEKENDS.filter(w=>w.laps===32).length,11);
 assert.equal(WEEKENDS[0].laps,32);assert.equal(WEEKENDS[3].raceFormat,"sprint");
});
