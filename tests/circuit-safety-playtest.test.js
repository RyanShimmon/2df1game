import test from 'node:test';
import assert from 'node:assert/strict';
import {CIRCUITS,selectTrack,TRACK,angleDiff,trackLayer,Race,sample,grip,PIT_MARKERS,nearest} from '../src/core.js';
test.afterEach(()=>selectTrack('northline'));
for(const circuit of CIRCUITS){
 test(`${circuit.name}: road and kerb boundaries have safe radii and separation`,()=>{
  selectTrack(circuit.id);const points=TRACK.pts;
  for(let i=0;i<points.length-1;i++){
   const a=points[(i+1399)%1400],b=points[(i+1)%1400];
   const distance=(b.s-a.s+TRACK.length)%TRACK.length;
   const radius=distance/Math.abs(angleDiff(b.angle,a.angle));
   assert.ok(radius>TRACK.width/2+40,`folded inside edge at ${points[i].s.toFixed(1)}m: radius ${radius.toFixed(1)}`);
  }
  for(let i=0;i<1400;i+=4)for(let j=i+4;j<1400;j+=4){
   const a=points[i],b=points[j],gap=Math.min(b.s-a.s,TRACK.length-(b.s-a.s));
   if(gap<350||trackLayer(a.s)!==trackLayer(b.s))continue;
   assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>TRACK.width+50,`separate road / kerb sections overlap at ${a.s.toFixed(1)}, ${b.s.toFixed(1)}m`);
  }
 });
 for(const [weather,tyre] of [['dry','M'],['wetToDry','W']])test(`${circuit.name}: ${weather==='dry'?'dry':'wet'} player lap and automatic pit stop play-test`,()=>{
  const r=new Race({track:circuit.id,laps:1,fuel:3,tyre,weather,aiSeed:42}),p=r.player,loc=sample(0);
  r.cars=[p];r.countdown=0;Object.assign(p,{s:0,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle});p.used.add('H');
  let previous=p.s;
  for(let i=0;i<60*400&&!r.done;i++){
   const goal=sample(p.s+Math.max(35,Math.min(90,p.speed*.5))),desired=Math.atan2(goal.y-p.y,goal.x-p.x);
   const target=Math.min(160,Math.sqrt(225*grip(p)/Math.max(.001,Math.abs(angleDiff(sample(p.s+100).angle,sample(p.s).angle))/100))*.7);
   r.step(1/60,{steer:Math.max(-1,Math.min(1,angleDiff(desired,p.angle)*3.5)),throttle:p.speed<target,brake:p.speed>target+3});
   assert.ok(p.s>=previous-1&&p.s-previous<8,'lap progress jumped or switched branches');previous=p.s;
  }
  assert.ok(r.done&&!r.result.dnf,'player did not complete lap');assert.ok(p.trackLimits<=1,'corner forced player beyond track limits');
  // Request the lane at its physical mouth, then let the regular simulation handle the stop.
  const pitRace=new Race({track:circuit.id,laps:8,fuel:10,tyre,weather,aiSeed:42}),c=pitRace.player,m=PIT_MARKERS.entry;
  pitRace.cars=[c];pitRace.countdown=0;pitRace.nextTyre='H';pitRace.pitRandom=()=>.5;
  const road=nearest(m.x,m.y);Object.assign(c,{s:road.s,x:m.x,y:m.y,angle:m.angle,motionAngle:m.angle,speed:50});pitRace.requestPit();
  pitRace.step(1/60,{});assert.ok(c.pit,'could not enter lane from physical entrance');
  let held=false;
  for(let i=0;i<60*100&&c.pit;i++){
   pitRace.step(1/60,{});
   if(c.pit?.stage==='service'){held=true;assert.equal(c.speed,0);}
  }
  assert.ok(held,'service was skipped');assert.equal(c.stops,1);assert.equal(c.tyre,'H');assert.equal(c.pit,null,'automatic exit failed');assert.ok(c.fuel>0);
 });
}
