import test from 'node:test';
import assert from 'node:assert/strict';
import {selectTrack,TRACK,angleDiff,Race,sample,grip,trackLayer} from '../src/core.js';
test.afterEach(()=>selectTrack('northline'));
test('Metro corner radii leave clear space inside the full road width',()=>{
 selectTrack('metro');
 for(let i=1;i<TRACK.pts.length-1;i++) {
  const a=TRACK.pts[i-1],b=TRACK.pts[i+1],curvature=Math.abs(angleDiff(b.angle,a.angle)/(b.s-a.s));
  assert.ok(1/curvature>TRACK.width/2+40,`Metro road boundary folds at ${TRACK.pts[i].s}`);
 }
});
test('the opened Metro bends can be driven for a complete lap',()=>{
 const r=new Race({track:'metro',laps:1,fuel:3,tyre:'M',weather:'dry'}),p=r.player,loc=sample(0);
 r.cars=[p];r.countdown=0;Object.assign(p,{s:0,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle});p.used.add('H');
 for(let i=0;i<60*300 && !r.done;i++) {
  const goal=sample(p.s+Math.max(35,Math.min(90,p.speed*.5))),desired=Math.atan2(goal.y-p.y,goal.x-p.x);
  const target=Math.min(180,Math.sqrt(225*grip(p)/Math.max(.001,Math.abs(angleDiff(sample(p.s+100).angle,sample(p.s).angle))/100))*.75);
  r.step(1/60,{steer:Math.max(-1,Math.min(1,angleDiff(desired,p.angle)*3.5)),throttle:p.speed<target,brake:p.speed>target+3});
 }
 assert.ok(r.done && !r.result.dnf);assert.ok(r.player.trackLimits<=1);
});

test('separate same-level Metro sections have enough room to prevent merged asphalt',()=>{
 selectTrack('metro');const points=TRACK.pts;
 for(let i=0;i<points.length-1;i+=4)for(let j=i+4;j<points.length-1;j+=4) {
  const gap=Math.min(points[j].s-points[i].s,TRACK.length-(points[j].s-points[i].s));
  if(gap<350 || trackLayer(points[i].s)!==trackLayer(points[j].s))continue;
  assert.ok(Math.hypot(points[i].x-points[j].x,points[i].y-points[j].y)>TRACK.width+50,'separate road sections merge');
 }
});
