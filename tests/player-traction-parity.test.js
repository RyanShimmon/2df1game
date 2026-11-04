import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,sample,leavesSkidMarks,grip,angleDiff} from '../src/core.js';
test('gentle steering does not impose a player-only engine power penalty',()=>{
 const run=steer=>{const r=new Race({track:'dunes',laps:12,fuel:15,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false}),c=r.player,p=sample(0);Object.assign(c,{s:0,x:p.x,y:p.y,angle:p.angle,motionAngle:p.angle,speed:150,throttleApplied:1});r.stepPlayer(c,1/60,{throttle:true,steer});return c;};
 const straight=run(0),corner=run(.3);assert.ok(Math.abs(straight.speed-corner.speed)<.001);
 assert.equal(grip({...corner,player:false}),grip(corner));
});
test('skid marks reflect real sideslip equally for both controllers',()=>{
 for(const player of [true,false]){const c={player,speed:220,angle:0,motionAngle:0,sliding:.6};assert.equal(leavesSkidMarks(c),false);c.motionAngle=.1;assert.equal(leavesSkidMarks(c),true);c.speed=0;assert.equal(leavesSkidMarks(c),false);}
});
test('straight braking does not draw skid marks without a slide',()=>{
 const r=new Race({track:'dunes',laps:12,fuel:15,tyre:'M',weather:'dry',tyreTemperatureEnabled:false}),c=r.player,p=sample(0);Object.assign(c,{s:0,x:p.x,y:p.y,angle:p.angle,motionAngle:p.angle,speed:220});r.stepPlayer(c,1/60,{brake:true});assert.equal(r.skids.length,0);
});
test('Dunes P1 with the real countdown and cold tyres clears a stationary player',()=>{
 const r=new Race({track:'dunes',laps:16,fuel:18.5,tyre:'M',weather:'dry',aiSeed:12,startingPosition:1});const start=r.player.s;
 for(let i=0;i<24*60;i++)r.step(1/60);
 assert.equal(r.player.s,start);assert.ok(r.cars.filter(c=>!c.player).every(c=>c.s>start+55));
});

test('Dunes traffic does not abruptly cut and restore path support at corner entry',()=>{
 const r=new Race({track:'dunes',laps:16,fuel:18.5,tyre:'M',weather:'dry',aiSeed:42,startingPosition:1});let worst=0;
 for(let i=0;i<14*60;i++){
  const previous=r.cars.map(c=>c.angle);r.step(1/60);
  for(const c of r.cars)if(!c.player&&!c.pit&&c.speed>150&&!c.contacts)worst=Math.max(worst,Math.abs(angleDiff(c.angle,previous[c.id])));
 }
 assert.ok(worst<.05,`abrupt direction change ${worst} radians`);
 assert.ok(r.cars.every(c=>!c.contacts));
});
