import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,TRACK,sample,nearest,Race} from '../src/core.js';
test.afterEach(()=>selectTrack('northline'));
test('both crossing levels retain route position across their full usable lane width',()=>{
 for(const [track,crossings] of [['metro',[3697,7298]],['crossover',[3002,6162]]]) {
  selectTrack(track);
  for(const crossing of crossings)for(let delta=-80;delta<=80;delta+=10)for(const offset of [-55,-35,-20,0,20,35,55]) {
   const s=crossing+delta,p=sample(s),n=nearest(p.x-Math.sin(p.angle)*offset,p.y+Math.cos(p.angle)*offset,s);
   assert.ok(Math.abs(n.s-s)<3,`${track}: ${s} offset ${offset} switched to ${n.s}`);
   assert.ok(Math.abs(n.offset-offset)<.1);
  }
 }
});
test('Metro player progress continues through either level when taking an offset line',()=>{
 for(const crossing of [3697,7298])for(const offset of [-40,40]) {
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
