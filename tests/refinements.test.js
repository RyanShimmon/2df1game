import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,PIT_LANE,sample} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {createWeekend,recordLap,qualifyingProgress,qualifyingStatus} from '../src/weekend.js';
const upgrades={engine:0,aero:0,tyres:0,crew:0};
function race(){const r=new Race({laps:12,fuel:14,tyre:'M'},upgrades);r.countdown=0;return r;}
test('automatic limiter caps entry, stays on throughout lane and releases at exit',()=>{
 const r=race(),p=r.player;r.cars=[p];p.s=TRACK.pitEntry-80;
 const loc=sample(p.s);Object.assign(p,{x:loc.x,y:loc.y,angle:loc.angle,speed:160});
 r.pitRequested=true;r.stepPlayer(p,1/60,{throttle:true});assert.ok(p.speed>80);assert.equal(r.pitLimiter,false);
 r.enterPit(p);assert.equal(r.pitLimiter,true);assert.equal(p.penalties,0);
 r.togglePitLimiter();assert.equal(r.pitLimiter,true,'manual toggling cannot override auto mode');
 p.pit.serviced=true;p.pit.distance=PIT_LANE.length-1;
 r.stepPit(p,.05,{throttle:true});assert.equal(p.pit,null);assert.equal(r.pitLimiter,false);
 p.speed=90;r.stepPlayer(p,1/60,{throttle:true});assert.ok(p.speed>80);
});
test('manual limiter retains P control and pit-speed penalties',()=>{
 const r=race(),p=r.player;r.autoPitLimiter=false;p.speed=140;p.s=TRACK.pitEntry;
 r.enterPit(p);assert.equal(p.penalties,1);r.togglePitLimiter();assert.equal(r.pitLimiter,true);
 r.togglePitLimiter();assert.equal(r.pitLimiter,false);
});
test('qualifying cutoff compares safe drivers with first eliminated and outsiders with final advancing time',()=>{
 const w=createWeekend(newCareer({driverName:'Alex',teamIndex:0}),{laps:12,fuel:14,tyre:'S'});
 for(let i=0;i<21;i++)recordLap(w,i,20+i*.1,i);
 recordLap(w,21,22.5,99);
 let p=qualifyingProgress(w);assert.equal(p.keep,16);assert.equal(p.cutoffTime,21.5);
 assert.equal(p.rank,22);assert.equal(p.through,false);assert.equal(p.margin,1);
 recordLap(w,21,21.45,100);p=qualifyingProgress(w);
 assert.equal(p.rank,16);assert.equal(p.through,true);assert.ok(Math.abs(p.margin+.05)<1e-8);
});
test('qualifying statuses distinguish pits, out lap, timed lap and in lap',()=>{
 for(const [qState,label] of [['garage','PITS'],['out','OUT LAP'],['timed','TIMED LAP'],['in','IN LAP']])
 assert.equal(qualifyingStatus({qState,garage:qState==='garage',pit:null}),label);
 assert.equal(qualifyingStatus({qState:'in',pit:{stage:'service'}}),'PITS');
});
function contactPair(){
 const r=race(),a=r.player,b=r.cars[0],s=700,loc=sample(s);
 Object.assign(a,{s,x:loc.x,y:loc.y,angle:loc.angle,offset:0,pit:null,garage:false,speed:200,sideSpeed:0});
 const next=sample(s+32);Object.assign(b,{s:s+32,x:loc.x+32*Math.cos(loc.angle),y:loc.y+32*Math.sin(loc.angle),angle:loc.angle,offset:0,pit:null,garage:false,speed:100,sideSpeed:0});
 r.cars=[a,b];return {r,a,b};
}
test('rear contact transfers momentum to the car ahead instead of slowing both cars',()=>{
 const {r,a,b}=contactPair();const x=a.x,y=a.y;r.collisions();
 assert.ok(a.speed<200);assert.ok(b.speed>100);assert.ok(Math.abs(a.speed+b.speed-300)<1e-8);
 assert.ok(Math.hypot(a.x-x,a.y-y)<=1.51);
});
test('contact impulse does not depend on iteration order',()=>{
 const first=contactPair(),second=contactPair();second.r.cars.reverse();
 first.r.collisions();second.r.collisions();
 assert.ok(Math.abs(first.a.speed-second.a.speed)<1e-8);assert.ok(Math.abs(first.b.speed-second.b.speed)<1e-8);
});
test('AI retains sideways impact velocity and moves back to its line gradually',()=>{
 const r=race(),c=r.cars[0];c.s=600;c.offset=20;c.sideSpeed=30;
 r.cars=[c];r.traffic=[];const before=c.sideSpeed;
 r.stepAI(c,1/60);assert.ok(c.sideSpeed>0 && c.sideSpeed<before);assert.ok(c.offset>19.7);
});
