import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,sample,nearest,angleDiff} from '../src/core.js';
import {createWeather} from '../src/weather.js';
import {engineSoundFrame} from '../src/sound.js';
import {pitBoundaryMark} from '../src/render.js';
function recover(steer,throttle) {
 const r=new Race({laps:12,fuel:14,tyre:'S'},{engine:0,aero:0,tyres:0,crew:0}),p=r.player,l=sample(500);
 r.weather=createWeather('wetToDry');r.weather.rain=1;r.weather.sectors.fill(1);
 Object.assign(p,{s:500,x:l.x,y:l.y,angle:l.angle,motionAngle:l.angle-1.1,speed:240,tyreAge:1000});
 let maxDirectionStep=0;
 for(let i=0;i<21;i++) {const old=p.motionAngle;r.stepPlayer(p,1/60,{steer,throttle});maxDirectionStep=Math.max(maxDirectionStep,Math.abs(angleDiff(p.motionAngle,old)));}
 return {slip:Math.abs(angleDiff(p.motionAngle,p.angle)),speed:p.speed,maxDirectionStep};
}
test('large slides respond to stronger countersteer and throttle without losing momentum',()=>{
 const powered=recover(-1,true),coast=recover(-1,false),weak=recover(-.2,true),wrong=recover(.8,true);
 assert.ok(powered.slip<.25);assert.ok(powered.slip<coast.slip*.5);assert.ok(powered.slip<weak.slip*.4);
 assert.ok(wrong.slip>1.1);assert.ok(powered.speed>230);assert.ok(powered.maxDirectionStep<.04);
});
test('engine sound is audible at idle throughout the red-light sequence, with launch revs',()=>{
 const r={player:{speed:0},countdown:3,done:false};
 const idle=engineSoundFrame(r,false,false),rev=engineSoundFrame(r,false,false,true);
 assert.equal(idle.active,true);assert.ok(idle.gain>0);assert.ok(rev.frequency>idle.frequency);
 for(const countdown of [4,2,.1,0]) assert.ok(engineSoundFrame({...r,countdown},false,false).gain>0);
});
test('muting, pausing, finishing and leaving the race silence the engine',()=>{
 const r={player:{speed:220},countdown:0,done:false};
 for(const frame of [engineSoundFrame(r,false,true),engineSoundFrame(r,true,false),engineSoundFrame({...r,done:true},false,false),engineSoundFrame(null,false,false)])
  assert.equal(frame.gain,0);
});
test('pit markings run along the track edge with their labels on the pit-lane side',()=>{
 for(const name of ['entry','exit']) {
  const mark=pitBoundaryMark(name);
  for(const p of mark.points) assert.ok(Math.abs(nearest(p.x,p.y).dist-(TRACK.width/2+1))<.03);
  assert.ok(nearest(mark.label.x,mark.label.y).offset>TRACK.width/2+10);
  const first=nearest(mark.points[0].x,mark.points[0].y),last=nearest(mark.points.at(-1).x,mark.points.at(-1).y);
  assert.ok(Math.abs(last.s-first.s)>105);
 }
});
