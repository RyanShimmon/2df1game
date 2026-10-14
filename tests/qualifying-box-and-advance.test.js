import test from 'node:test';
import assert from 'node:assert/strict';
import {newCareer,PIT_MARKERS,nearest} from '../src/core.js';
import {createWeekend,QualifyingRun,recordLap,finishQualifyingStage} from '../src/weekend.js';
const profile={driverName:'Alex',teamIndex:2},upgrades={engine:0,aero:0,tyres:0,crew:0};
function create(){const w=createWeekend(newCareer(profile),{track:'northline',laps:24,fuel:28,tyre:'S',weather:'dry'});return new QualifyingRun(w,'S1',upgrades,profile);}
test('an in lap captures the physical pit entrance without B, even after a cancellation',()=>{
 const q=create(),p=q.player,m=PIT_MARKERS.entry,n=nearest(m.x,m.y);q.cars=[p];
 Object.assign(p,{garage:false,pit:null,qState:'in',s:n.s,x:m.x,y:m.y,angle:m.angle,motionAngle:m.angle,speed:50});q.pitRequested=false;
 q.step(1/60,{});assert.ok(p.pit);assert.equal(p.pit.stage,'entry');
});
test('service has a minimum wait and then holds indefinitely; garage tyre choice gets fitted before departure',()=>{
 const q=create(),p=q.player;q.cars=[p];q.pitRandom=()=>0;
 p.garage=false;p.pit.serviced=false;p.pit.stage='service';p.pit.previousSet=p.tyreSet;p.pit.timer=2.3;p.qState='in';p.wear=.2;p.tyreSet.wear=.2;
 for(let i=0;i<60;i++)q.step(1/60,{throttle:true});assert.equal(p.pit.stage,'service');assert.equal(p.speed,0);assert.equal(q.launch(p),false);
 for(let i=0;i<100;i++)q.step(1/60,{throttle:true});assert.ok(p.garage);assert.ok(p.qNeedsRelease);
 const x=p.x,y=p.y,wear=p.wear;for(let i=0;i<600;i++)q.step(1/60,{throttle:true});assert.equal(p.x,x);assert.equal(p.y,y);assert.equal(p.wear,wear);
 assert.equal(q.selectGarageSet('M1'),true);assert.equal(p.pit.stage,'service');assert.equal(q.launch(p),false);assert.equal(p.tyreSet.id,'S1');
 for(let i=0;i<160;i++)q.step(1/60,{});assert.equal(p.tyreSet.id,'M1');assert.ok(p.garage);assert.equal(p.speed,0);
 q.step(1/60,{});q.step(1/60,{throttle:true});assert.equal(p.qState,'out');assert.equal(p.garage,false);
});
test('sets can be changed during the return service rather than committed before entry',()=>{
 const q=create(),p=q.player;q.cars=[p];p.garage=false;p.pit.stage='service';p.pit.serviced=false;p.pit.timer=2.3;p.pit.previousSet=p.tyreSet;
 assert.equal(q.selectGarageSet('I1'),true);for(let i=0;i<400&&!p.garage;i++)q.step(1/60,{});
 assert.equal(p.tyreSet.id,'I1');assert.ok(p.garage);assert.equal(p.speed,0);
});
test('ending a session completes AI outings and immediately advances a qualified driver',()=>{
 const q=create();recordLap(q.weekend,21,1,0);
 for(let i=0;i<60*250 && !q.canEndSession();i++)q.step(1/60,{});
 assert.equal(q.sessionAction(),'Move to Q2');
 const result=q.endSession();assert.equal(result.through,true);assert.equal(q.weekend.phase,'Q2');
 assert.equal(q.weekend.sessions[0].results.length,22);assert.ok(q.weekend.sessions[0].results.filter(r=>r.id!==21).every(r=>Number.isFinite(r.time)));
 assert.equal(q.weekend.runInProgress,false);
});
test('session labels and final grids respect knockout stages and final qualifying',()=>{
 const q=create();for(const id of q.weekend.active)recordLap(q.weekend,id,id===21?100:20+id*.1,id);
 assert.equal(q.sessionAction(),'End qualifying in P22');q.endSession();assert.equal(q.weekend.phase,'R');assert.equal(q.weekend.grid.indexOf(21)+1,22);
 const other=create();recordLap(other.weekend,21,1,0);finishQualifyingStage(other.weekend,upgrades,profile);
 const q2=new QualifyingRun(other.weekend,'S1',upgrades,profile);for(const id of q2.weekend.active)recordLap(q2.weekend,id,id===21?1:30,0);assert.equal(q2.sessionAction(),'Move to Q3');
 finishQualifyingStage(q2.weekend,upgrades,profile);const q3=new QualifyingRun(q2.weekend,'S1',upgrades,profile);for(const id of q3.weekend.active)recordLap(q3.weekend,id,id===21?1:30,0);assert.equal(q3.sessionAction(),'End qualifying in P1');
});
