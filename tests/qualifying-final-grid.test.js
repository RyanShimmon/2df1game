import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,loadCareer} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {WEEKENDS,createWeekend,QualifyingRun,recordLap,stageOrder,qualifyingProgress,qualifyingClassification,finishQualifyingStage,migrateWeekend,prepareRace} from '../src/weekend.js';
const profile={driverName:'Grid regression',teamIndex:2};
function makeQ3(round,playerQ2=10){
 const c=newCareer(profile);c.round=round;const w=c.weekend=createWeekend(c,{tyre:'S',aiSeed:42});
 for(let phase=1;phase<=2;phase++){
  for(const [i,id] of w.active.entries())recordLap(w,id,id===21 ? phase===2 ? 30+playerQ2-.5 : 25 : 30+i,10+i);
  finishQualifyingStage(w,c.upgrades,profile);
 }
 return {c,w,q:new QualifyingRun(w,'S3',c.upgrades,profile)};
}
for(const [index,track] of WEEKENDS.entries())test(`${track.track}: final Q3, saved grid and race grid agree when Q3 order differs from Q2`,()=>{
 const {c,w,q}=makeQ3(index+1);
 assert.equal(w.active.indexOf(21),9,'player enters Q3 tenth');
 for(const [i,id] of w.active.entries())recordLap(w,id,id===21?25:30+i,10+i);
 w.elapsed=q.stage.duration;q.endRun();
 // Expired sessions cannot run further laps after presenting final results.
 w.elapsed=q.stage.duration;
 const outcome=q.endSession();
 assert.equal(outcome.position,1);assert.equal(outcome.gridPosition,1);
 assert.equal(q.order()[0].id,21,'completed display must not fall back to Q2 order');
 assert.equal(qualifyingProgress(w,21,'Q3').rank,1);
 assert.equal(qualifyingProgress(w,21,'Q3').playerTime,25);
 assert.equal(qualifyingClassification(w,'Q3').order[0],21);
 assert.equal(stageOrder(w)[0],21);assert.equal(w.grid.length,22);assert.equal(new Set(w.grid).size,22);
 const before=structuredClone(w.sessions);q.step(1/60,{});q.endSession();recordLap(w,0,1,0);
 assert.deepEqual(w.sessions,before);assert.deepEqual(w.results,[]);
 const saved=loadCareer({getItem:()=>JSON.stringify(c)});migrateWeekend(saved.weekend);
 const race=new Race(saved.weekend.setup,saved.upgrades,'career',profile);prepareRace(race,saved.weekend,'M1');
 assert.equal(race.player.gridPosition,1);assert.equal(race.order()[0].id,21);
 assert.deepEqual(saved.weekend.sessions,before);
});
test('a stale P1 from Q2 cannot be shown after a final Q3 P10',()=>{
 const {c,w,q}=makeQ3(4,1);for(const [i,id] of w.active.entries())recordLap(w,id,id===21?40:25+i*.1,10+i);
 w.elapsed=q.stage.duration;q.endRun();w.elapsed=q.stage.duration;
 const outcome=q.endSession();assert.equal(outcome.position,10);assert.equal(q.order().findIndex(car=>car.player)+1,10);
 assert.equal(qualifyingProgress(w,21,'Q3').rank,10);assert.equal(w.grid.indexOf(21)+1,10);
});
test('a saved race grid is repaired from archived stage classifications without changing the laps',()=>{
 const {w,c,q}=makeQ3(4);for(const [i,id] of w.active.entries())recordLap(w,id,id===21?25:30+i,10+i);
 w.elapsed=q.stage.duration;q.endRun();w.elapsed=q.stage.duration;q.endSession();
 const original=structuredClone(w.sessions),grid=[...w.grid];[w.grid[0],w.grid[9]]=[w.grid[9],w.grid[0]];
 migrateWeekend(w);assert.deepEqual(w.grid,grid);assert.deepEqual(w.sessions,original);
 const r=new Race(w.setup,c.upgrades,'career',profile);[w.grid[0],w.grid[9]]=[w.grid[9],w.grid[0]];
 prepareRace(r,w,'M1');assert.equal(r.player.gridPosition,1);
});
test('advancing Q1 keeps its archived display separate from the new empty Q2 timing table',()=>{
 const c=newCareer(profile),w=createWeekend(c,{tyre:'S',aiSeed:1}),q=new QualifyingRun(w,'S1',c.upgrades,profile);
 for(const [i,id] of w.active.entries())recordLap(w,id,id===21?25:30+i,10+i);
 finishQualifyingStage(w,c.upgrades,profile);
 assert.equal(w.phase,'Q2');assert.deepEqual(w.results,[]);
 assert.equal(qualifyingClassification(w,'Q1').results.find(r=>r.id===21).time,25);
 assert.equal(qualifyingClassification(w,'Q2').results.length,0);
 assert.equal(q.order()[0].id,21);
});
