import test from 'node:test';
import assert from 'node:assert/strict';
import {CIRCUITS,makeTrack,selectTrack,TRACK,trackLayer,Race,sample,angleDiff,grip} from '../src/core.js';
test.afterEach(()=>selectTrack('northline'));
function signature(circuit) {
 const t=makeTrack(circuit),xs=t.pts.map(p=>p.x),ys=t.pts.map(p=>p.y),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 return Array.from({length:64},(_,i)=>{
  const s=i/64*t.length,j=t.pts.findIndex(p=>p.s>=s),a=t.pts[Math.max(0,j-1)],b=t.pts[j],f=(s-a.s)/(b.s-a.s||1);
  return [(a.x+(b.x-a.x)*f-x)/w,(a.y+(b.y-a.y)*f-y)/h];
 });
}
test('circuit layouts remain distinct after normalising scale and shifting start positions',()=>{
 const shapes=CIRCUITS.map(signature);
 for(let i=0;i<shapes.length;i++)for(let j=i+1;j<shapes.length;j++) {
  let difference=Infinity;
  for(let shift=0;shift<64;shift++) difference=Math.min(difference,shapes[i].reduce((sum,p,k)=>sum+Math.hypot(p[0]-shapes[j][(k+shift)%64][0],p[1]-shapes[j][(k+shift)%64][1]),0)/64);
  assert.ok(difference>.09,`${CIRCUITS[i].id} resembles ${CIRCUITS[j].id}: ${difference}`);
 }
});
test('every geometric crossing is intentionally separated by a flyover',()=>{
 for(const t of CIRCUITS) {
  selectTrack(t.id);const p=TRACK.pts;
  for(let i=0;i<p.length-5;i+=5)for(let j=i+20;j<p.length-5;j+=5) {
   if(Math.min(p[j].s-p[i].s,TRACK.length-(p[j].s-p[i].s))<300)continue;
   const a=p[i],b=p[i+5],c=p[j],d=p[j+5],dx=b.x-a.x,dy=b.y-a.y,ex=d.x-c.x,ey=d.y-c.y,den=dx*ey-dy*ex;
   if(Math.abs(den)<1e-8)continue;
   const f=((c.x-a.x)*ey-(c.y-a.y)*ex)/den,u=((c.x-a.x)*dy-(c.y-a.y)*dx)/den;
   if(f>0&&f<1&&u>0&&u<1) assert.notEqual(trackLayer(a.s+f*(b.s-a.s)),trackLayer(c.s+u*(d.s-c.s)),`${t.id} unintended crossing`);
  }
 }
});
test('redesigned tracks remain driveable through player steering and pedals',()=>{
 for(const track of ['velocity','dunes','forest','riviera','canyon','aurora']) {
  const r=new Race({track,laps:1,fuel:3,tyre:'M',weather:'dry'}),p=r.player,loc=sample(0);r.countdown=0;r.cars=[p];
  Object.assign(p,{s:0,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:0});p.used.add('H');
  for(let i=0;i<60*400 && !r.done;i++) {
   const goal=sample(p.s+Math.max(35,Math.min(90,p.speed*.5))),desired=Math.atan2(goal.y-p.y,goal.x-p.x);
   const target=Math.min(160,Math.sqrt(225*grip(p)/Math.max(.001,Math.abs(angleDiff(sample(p.s+100).angle,sample(p.s).angle))/100))*.7);
   r.step(1/60,{steer:Math.max(-1,Math.min(1,angleDiff(desired,p.angle)*3.5)),throttle:p.speed<target,brake:p.speed>target+3});
  }
  assert.ok(r.done && !r.result.dnf,`${track}: player failed to finish`);
 }
});
