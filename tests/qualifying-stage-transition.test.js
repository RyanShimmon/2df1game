import test from 'node:test';
import assert from 'node:assert/strict';
import {newCareer,loadCareer} from '../src/core.js';
import {createWeather} from '../src/weather.js';
import {createWeekend,ensureWeekend,QualifyingRun,recordLap,stageOrder,finishQualifyingStage} from '../src/weekend.js';
import {driveQualifyingOuting} from './qualifying-driver.js';

const profile={driverName:'Test',teamIndex:2};
const setup={track:'northline',laps:24,fuel:28,tyre:'S',aiSeed:42,difficulty:'easy'};
function create(){
 const career=newCareer(profile);
 // This regression concerns advancement of a competitive, physically driven
 // lap; give the test driver a developed car against the improved AI lines.
 Object.assign(career.upgrades,{engine:5,aero:5,brakes:5});
 const w=createWeekend(career,setup);
 career.weekend=w;w.weather=createWeather('dry');
 return {career,q:new QualifyingRun(w,'S1',career.upgrades,profile)};
}

for(const path of ['live track','saved garage'])test(`a driven, valid P1 lap advances only to Q2 from the ${path}`,()=>{
 let {career,q}=create();
 driveQualifyingOuting(q,180,{pace:.98});
 for(let i=0;i<60*180&&!q.canEndSession()&&!q.done;i++)q.step(1/60,{});
 const banked={...q.weekend.results.find(r=>r.id===21)};
 assert.ok(banked.time>20&&banked.time<25,'use a physically driven lap, not a fabricated one-second result');
 assert.equal(q.player.qInvalid,false);assert.equal(q.player.stops,1);
 assert.equal(stageOrder(q.weekend)[0],21);assert.equal(q.sessionAction(),'Move to Q2');
 if(path==='saved garage'){
  q.endRun();const saved=JSON.stringify(career);
  career=loadCareer({getItem:()=>saved});const w=ensureWeekend(career,setup);
  assert.deepEqual(w.results.find(r=>r.id===21),banked);
  q=new QualifyingRun(w,'S1',career.upgrades,profile);
  assert.equal(q.sessionAction(),'Move to Q2');
 }
 const outcome=q.endSession(),w=q.weekend;
 assert.equal(outcome.through,true);assert.equal(outcome.position,1);assert.equal(outcome.phase,'Q2');
 assert.equal(w.phase,'Q2');assert.equal(w.sessions.length,1);assert.equal(w.sessions[0].name,'Q1');
 assert.deepEqual(w.sessions[0].results.find(r=>r.id===21),banked);assert.equal(w.sessions[0].order[0],21);
 assert.ok(w.active.includes(21));assert.equal(w.grid.includes(21),false);
 assert.equal(q.endSession(),null);assert.equal(w.phase,'Q2');
 const reloaded=loadCareer({getItem:()=>JSON.stringify(career)});
 assert.equal(ensureWeekend(reloaded,setup).phase,'Q2');
 assert.deepEqual(reloaded.weekend.sessions[0].results.find(r=>r.id===21),banked);
});

test('a stale Q1 run cannot step, end or overwrite a Q2 session',()=>{
 const {career,q}=create(),w=q.weekend;
 for(const id of w.active)recordLap(w,id,id===21?22:28,id);
 finishQualifyingStage(w,career.upgrades,profile);
 new QualifyingRun(w,'S1',career.upgrades,profile);
 for(const id of w.active)recordLap(w,id,id===21?22:28,id);
 const before=JSON.stringify(w);
 assert.equal(q.canEndSession(),false);assert.equal(q.endSession(),null);
 q.step(.05,{});q.endRun();
 assert.equal(JSON.stringify(w),before);
});

test('final position comes from the completed classification when missing AI times are filled',()=>{
 const {career,q}=create(),w=q.weekend;
 q.launch(q.player);q.time=10;q.crossLine(q.player);q.time=37;q.crossLine(q.player);
 for(const id of w.active)if(id!==21)w.attempts[id]=1; // Deleted first laps, but all have attempted.
 q.endRun();
 assert.equal(q.sessionAction(),'Move to Q2');
 const outcome=q.endSession(),session=w.sessions[0];
 assert.equal(session.results.length,22);
 assert.equal(outcome.position,session.order.indexOf(21)+1);
 assert.equal(outcome.playerTime,27);assert.equal(outcome.eliminated,true);
 assert.equal(outcome.cutoffTime,session.results.find(r=>r.id===session.order[15]).time);
 assert.equal(w.phase,'Q2');assert.equal(w.sessions.length,1);
 assert.equal(outcome.gridPosition,session.order.indexOf(21)+1);
});
