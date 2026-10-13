import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,sample,nearest,angleDiff,clamp,interpolatedCar,capturePoses} from '../src/core.js';
import {createWeather,advanceWeather} from '../src/weather.js';
const upgrades={engine:0,aero:0,tyres:0,crew:0};
function carRace(tyre='S',weather=createWeather('dry')) {
 const r=new Race({laps:12,fuel:14,tyre},upgrades);r.weather=weather;r.countdown=0;r.cars=[r.player];
 const p=r.player, loc=sample(500);Object.assign(p,{s:500,x:loc.x,y:loc.y,angle:loc.angle,speed:0,offset:0,wear:0,tyreAge:1000});
 return r;
}
function water(value){const w=createWeather('wetToDry');w.rain=value;w.wetness=value;w.sectors.fill(value);return w;}
test('a stationary fuelled car can drive back from far outside the track in dry and wet conditions',()=>{
 for(const distance of [220,450]) for(const wet of [false,true]) {
  const r=carRace('S',wet?water(1):createWeather('dry')), p=r.player,loc=sample(p.s);
  p.x-=Math.sin(loc.angle)*distance;p.y+=Math.cos(loc.angle)*distance;
  p.angle=loc.angle-Math.PI/2+.5;
  assert.ok(nearest(p.x,p.y).dist>190);
  let recovered=false;
  for(let i=0;i<60*40;i++) {
   const n=nearest(p.x,p.y),road=sample(n.s),wanted=Math.atan2(road.y-p.y,road.x-p.x);
   r.stepPlayer(p,1/60,{throttle:true,steer:clamp(angleDiff(wanted,p.angle)*2,-1,1)});
   if(nearest(p.x,p.y).dist<TRACK.width/2-5){recovered=true;break;}
  }
  assert.ok(recovered,`recover distance=${distance}, wet=${wet}`);assert.ok(p.fuel>0);
 }
});
test('lap progress reacquires after a long parallel excursion instead of remaining permanently frozen',()=>{
 const r=carRace(),p=r.player,loc=sample(p.s);
 p.x-=Math.sin(loc.angle)*250;p.y+=Math.cos(loc.angle)*250;
 for(let i=0;i<60*6;i++)r.stepPlayer(p,1/60,{throttle:true});
 let recovered=false;
 for(let i=0;i<60*30;i++) {
  const n=nearest(p.x,p.y),road=sample(n.s),desired=Math.atan2(road.y-p.y,road.x-p.x);
  r.stepPlayer(p,1/60,{throttle:true,steer:clamp(angleDiff(desired,p.angle)*2,-1,1)});
  if(nearest(p.x,p.y).dist<TRACK.width/2-5){recovered=true;break;}
 }
 assert.ok(recovered);assert.ok(Math.abs(nearest(p.x,p.y).s-p.s)<10);
});
test('all three slick compounds slide at high speed on a fully wet track, while wets retain control',()=>{
 for(const tyre of ['S','M','H','W']) {
  const r=carRace(tyre,water(1));r.player.speed=220;
  r.stepPlayer(r.player,.05,{throttle:true,steer:.8});
  if(tyre==='W')assert.ok(r.player.sliding<.2);
  else {assert.ok(r.player.sliding>.8,`${tyre} wet slide ${r.player.sliding}`);assert.ok(Math.abs(r.player.sideSpeed)>3);}
 }
});
test('slicks remain controllable at low speed in standing water',()=>{
 const r=carRace('M',water(1));r.player.speed=40;
 r.stepPlayer(r.player,.05,{throttle:true,steer:.3});
 assert.ok(r.player.sliding<1e-10);assert.ok(Math.abs(r.player.sideSpeed)<.01);
});
test('rain developing during a session gives the same slick grip and sliding as identical wet starting conditions',()=>{
 const changing=createWeather('lateRain');
 for(let i=0;i<3000;i++)advanceWeather(changing,.1);
 assert.ok(changing.wetness>.99);
 const start=water(changing.wetness);start.rain=changing.rain;start.sectors=[...changing.sectors];
 const a=carRace('S',changing),b=carRace('S',start);
 a.player.speed=b.player.speed=220;
 // A cached dry value must never override live surface water.
 a.player.trackWetness=0;b.player.trackWetness=1;
 a.stepPlayer(a.player,.05,{throttle:true,steer:.8});b.stepPlayer(b.player,.05,{throttle:true,steer:.8});
 assert.ok(a.player.sliding>.8);assert.equal(a.player.trackWetness,b.player.trackWetness);
 assert.equal(a.player.sliding,b.player.sliding);assert.equal(a.player.sideSpeed,b.player.sideSpeed);
});
test('render interpolation produces evenly spaced movement at 120 Hz between 60 Hz simulation steps',()=>{
 const c={x:0,y:0,s:0,angle:0,speed:330};let last=0;
 for(let step=0;step<20;step++) {
  capturePoses([c]);c.x+=330/60;c.s+=330/60;
  for(const alpha of [.5,1]) {
   const displayed=interpolatedCar(c,alpha);
   assert.ok(Math.abs(displayed.x-last-330/120)<1e-9);last=displayed.x;
  }
 }
});
test('render interpolation follows the shortest angle across the wrap boundary without altering physics',()=>{
 const c={x:10,y:20,s:30,speed:100,angle:-Math.PI+.05,previousPose:{x:5,y:10,s:20,speed:90,angle:Math.PI-.05}};
 const pose=interpolatedCar(c,.5);assert.ok(Math.abs(Math.abs(pose.angle)-Math.PI)<1e-8);
 assert.equal(c.x,10);assert.equal(c.angle,-Math.PI+.05);
});
