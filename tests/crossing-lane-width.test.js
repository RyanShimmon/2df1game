import {crossingDistances} from './track-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,TRACK,sample,nearest,Race,updateRaceLaps} from '../src/core.js';
test.afterEach(()=>selectTrack('northline'));
test('both crossing levels retain route position across their full usable lane width',()=>{
 for(const [track,crossings] of [['metro',crossingDistances('metro')],['crossover',crossingDistances('crossover')]]) {
  selectTrack(track);
  for(const crossing of crossings)for(let delta=-80;delta<=80;delta+=10)for(const offset of [-55,-35,-20,0,20,35,55]) {
   const s=crossing+delta,p=sample(s),n=nearest(p.x-Math.sin(p.angle)*offset,p.y+Math.cos(p.angle)*offset,s);
   assert.ok(Math.abs(n.s-s)<3,`${track}: ${s} offset ${offset} switched to ${n.s}`);
   assert.ok(Math.abs(n.offset-offset)<.1);
  }
 }
});
test('Metro player progress continues through either level when taking an offset line',()=>{
 for(const crossing of crossingDistances('metro'))for(const offset of [-40,40]) {
  const r=new Race({track:'metro',laps:8,fuel:10,tyre:'M',weather:'dry'}),p=r.player;
  r.cars=[p];r.countdown=0;const start=crossing-45,loc=sample(start);
  Object.assign(p,{s:start,x:loc.x-Math.sin(loc.angle)*offset,y:loc.y+Math.cos(loc.angle)*offset,angle:loc.angle,motionAngle:loc.angle,speed:90});
  let last=p.s;
  for(let i=0;i<70;i++) {
   r.stepPlayer(p,1/60,{throttle:true});
   assert.ok(p.s>=last-1,'progress must not move backwards or jump levels');
   assert.ok(p.s-last<5,'progress must remain locally continuous');last=p.s;
  }
  assert.ok(p.s>crossing+35,`progress froze at ${p.s}`);
 }
});

test('a wide slide across either flyover keeps route progress and the next lap counts once',()=>{
 for(const [track,crossings] of [['metro',crossingDistances('metro')],['crossover',crossingDistances('crossover')]])for(const crossing of crossings)for(const side of [-1,1]){
  const r=new Race({track,laps:8,fuel:20,tyre:'M',weather:'dry',tyreTemperatureEnabled:false}),c=r.player;
  r.cars=[c];r.countdown=0;Object.assign(c,{s:crossing-200,completedLaps:0});let counted=0;
  // Feed consecutive physical poses through the real player projection/lap
  // code, including a 90 m excursion and a return to the painted road.
  for(let s=crossing-200;s<TRACK.length+60;s+=4){
   const offset=side*90*Math.max(0,1-Math.abs(s-crossing)/170),p=sample(s),old=c.s;
   Object.assign(c,{x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset,angle:p.angle,motionAngle:p.angle,speed:120});
   r.stepPlayer(c,1/60,{throttle:true});if(updateRaceLaps(c,old))counted++;
   assert.ok(Math.abs(c.s-(s+2))<12,`${track} ${crossing}: progress lost at ${s}, tracked ${c.s}`);
   assert.ok(c.s-old<20,'never credit a jump to the other road');
  }
  assert.equal(counted,1);assert.equal(c.completedLaps,1);
 }
});
test('teleporting between crossing branches cannot award skipped distance or a lap',()=>{
 const r=new Race({track:'metro',laps:8,fuel:20,tyre:'M',weather:'dry'}),c=r.player,p=sample(crossingDistances('metro')[1]);
 Object.assign(c,{s:crossingDistances('metro')[0],x:p.x,y:p.y,angle:p.angle,motionAngle:p.angle,speed:0,completedLaps:0});
 const before=c.s;r.stepPlayer(c,1/60,{});updateRaceLaps(c,before);
 assert.ok(Math.abs(c.s-before)<35);assert.equal(c.completedLaps,0);
});
