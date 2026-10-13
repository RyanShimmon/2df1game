import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,PIT_LANE,sample,nearest,grip,angleDiff} from '../src/core.js';
import {createWeather} from '../src/weather.js';
import {countdownPulse,NORTHLINE_BUILDING} from '../src/render.js';
const upgrades={engine:0,aero:0,tyres:0,crew:0};
function recovery(throttle,steer=-.5) {
 const r=new Race({laps:12,fuel:14,tyre:'S'},upgrades),p=r.player,loc=sample(500);
 r.weather=createWeather('wetToDry');r.weather.wetness=1;r.weather.rain=1;r.weather.sectors.fill(1);
 Object.assign(p,{s:500,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle-.35,speed:220,tyreAge:1000});
 for(let i=0;i<18;i++)r.stepPlayer(p,1/60,{throttle,steer});
 return Math.abs(angleDiff(p.motionAngle,p.angle));
}
test('countersteer reduces a slide, with throttle providing more recovery authority',()=>{
 const coast=recovery(false),powered=recovery(true),wrong=recovery(true,.5);
 assert.ok(coast<.35);assert.ok(powered<coast*.9,`${powered} vs ${coast}`);assert.ok(wrong>powered);
});
test('wet slick grip is hard > medium > soft, with a clear intermediate advantage',()=>{
 for(const water of [.2,.4,.7,1]) {
  const value=tyre=>grip({tyre,wear:0,tyreAge:1000,trackWetness:water,offset:0,upgrades});
  assert.ok(value('H')>value('M'));assert.ok(value('M')>value('S'));assert.ok(value('I')>value('H')*1.15);
 }
 const dry=tyre=>grip({tyre,wear:0,tyreAge:1000,trackWetness:0,offset:0,upgrades});
 assert.ok(dry('S')>dry('M'));assert.ok(dry('M')>dry('H'));
});
test('player identification pulses four times during countdown and vanishes at lights out',()=>{
 for(const c of [3.5,2.5,1.5,.5])assert.ok(countdownPulse(c)>.99);
 for(const c of [4,3,2,1,0,-1])assert.ok(countdownPulse(c)<1e-10);
});
test('Northline building footprint is clear of both the circuit and pit road',()=>{
 const b=NORTHLINE_BUILDING;
 for(let x=b.x;x<=b.x+b.width;x+=20)for(let y=b.y;y<=b.y+b.height;y+=20) {
  assert.ok(nearest(x,y).dist>TRACK.width/2+10);
  const pitDistance=Math.min(...PIT_LANE.pts.map(p=>Math.hypot(p.x-x,p.y-y)));
  assert.ok(pitDistance>PIT_LANE.width/2+10);
 }
});
