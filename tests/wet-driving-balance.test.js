import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,sample,grip,angleDiff} from '../src/core.js';
import {createWeather,tyreWeatherGrip} from '../src/weather.js';
const upgrades={engine:0,aero:0,tyres:0,crew:0};
function turn({tyre='W',water=1,speed=220,steer=1,throttle=true}={}) {
 const r=new Race({laps:12,fuel:14,tyre},upgrades),p=r.player,loc=sample(500);
 r.weather=createWeather(water?'wetToDry':'dry');r.weather.rain=water;r.weather.wetness=water;r.weather.sectors.fill(water);
 Object.assign(p,{s:500,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed,tyreAge:1000});
 for(let i=0;i<30;i++) r.stepPlayer(p,1/60,{steer,throttle});
 return {slip:Math.abs(angleDiff(p.motionAngle,p.angle)),side:Math.abs(p.sideSpeed),speed:p.speed};
}
test('wets in standing water slide under aggressive steering and throttle, unlike dry slicks',()=>{
 const wet=turn(),dry=turn({tyre:'S',water:0});
 assert.ok(wet.slip>.1 && wet.side>20);assert.ok(dry.slip<.01);
 assert.ok(wet.speed>210,'sliding preserves momentum rather than abruptly slowing the car');
});
test('lifting throttle frees wet cornering grip and reduces the slide',()=>{
 const powered=turn(),lifted=turn({throttle:false});
 assert.ok(lifted.slip<powered.slip*.75,`${lifted.slip} versus ${powered.slip}`);
});
test('gentler steering or lower entry speed keeps wets controllable',()=>{
 assert.ok(turn({steer:.5}).slip<.01);
 assert.ok(turn({speed:140,steer:.7}).slip<.01);
});
test('wet surface grip preserves every compound suitability ratio and the dry balance',()=>{
 for(const water of [0,.25,.6,1]) {
  const factor=1-.28*water**.8;
  for(const tyre of ['S','M','H','I','W']) {
   const dryGrip=grip({tyre,trackWetness:0,wear:0,tyreAge:1000,offset:0,upgrades});
   const wetGrip=grip({tyre,trackWetness:water,wear:0,tyreAge:1000,offset:0,upgrades});
   assert.ok(Math.abs(wetGrip/dryGrip-tyreWeatherGrip(tyre,water)/tyreWeatherGrip(tyre,0)*factor)<1e-10);
  }
 }
});
