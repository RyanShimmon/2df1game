import test from 'node:test';import assert from 'node:assert/strict';
import {newCareer} from '../src/core.js';
import {createWeekend,QualifyingRun,recordLap,finishQualifyingStage,finishRemainingQualifying,pendingFirstRuns} from '../src/weekend.js';
const profile={driverName:'Test',teamIndex:2},upgrades={engine:0,aero:0,tyres:0,crew:0};
function create(){return new QualifyingRun(createWeekend(newCareer(profile),{track:'northline',laps:24,fuel:28,tyre:'S'}),'S1',upgrades,profile);}
test('session advancement stays locked until every opponent has attempted a timed lap',()=>{
 const q=create();recordLap(q.weekend,21,1,0);assert.equal(pendingFirstRuns(q.weekend).length,21);assert.match(q.sessionAction(),/Waiting for 21/);assert.equal(q.endSession(),null);assert.equal(q.weekend.phase,'Q1');
 for(const c of q.cars.filter(c=>!c.player).slice(0,-1))recordLap(q.weekend,c.id,40,c.id);
 assert.equal(q.canEndSession(),false);const last=q.cars.filter(c=>!c.player).at(-1);last.qState='timed';last.qStart=0;last.qInvalid=true;q.time=40;q.crossLine(last);
 assert.equal(q.canEndSession(),true);assert.equal(q.sessionAction(),'Move to Q2');
});
test('ending early simulates multiple further opponent attempts and updates best times before cutoff',()=>{
 const q=create();for(const c of q.cars)recordLap(q.weekend,c.id,c.player?1:999,0);
 const result=q.endSession();assert.equal(result.phase,'Q2');const session=q.weekend.sessions[0];
 for(const c of q.cars.filter(c=>!c.player)){
  assert.ok(session.results.find(r=>r.id===c.id).time<999,`${c.id} time unchanged`);
  assert.ok(c.tyreInventory.reduce((sum,t)=>sum+t.distance,0)>3*5000,`${c.id} did not make multiple outings`);
 }
});
test('player must also complete an outing before a session can end',()=>{
 const q=create();for(const c of q.cars.filter(c=>!c.player))recordLap(q.weekend,c.id,40,c.id);
 assert.equal(q.canEndSession(),false);assert.match(q.sessionAction(),/Complete your first timed lap/);assert.equal(q.endSession(),null);
});
test('qualifying speed cycles 1x, 2x, 4x, 8x, then normal',()=>{
 const q=create();assert.equal(q.timeScale,1);assert.deepEqual(Array.from({length:4},()=>q.cycleTimeScale()),[2,4,8,1]);
});
test('used sets remain reusable after swapping compounds and after moving to Q2',()=>{
 const q=create(),p=q.player;q.cars=[p];const soft=p.tyreSet;soft.wear=.23;soft.used=true;p.wear=.23;
 assert.ok(q.selectGarageSet('W1'));for(let i=0;i<400 && !p.pit.serviced;i++)q.step(1/60,{});assert.equal(p.tyre,'W');
 assert.ok(q.selectGarageSet('S1'));for(let i=0;i<400 && !p.pit.serviced;i++)q.step(1/60,{});assert.equal(p.tyreSet,soft);assert.equal(p.wear,.23);
 for(const id of q.weekend.active)recordLap(q.weekend,id,id===21?1:40,0);finishQualifyingStage(q.weekend,upgrades,profile);
 const q2=new QualifyingRun(q.weekend,'S1',upgrades,profile);assert.equal(q2.player.tyreSet,soft);assert.equal(q2.player.wear,.23);
});

test('responsive session completion yields to the UI, prevents duplicate advancement and matches the blocking simulation',async()=>{
 const make=()=>{
  const q=new QualifyingRun(createWeekend(newCareer(profile),{track:'northline',laps:24,fuel:28,tyre:'S',aiSeed:42}),'S1',upgrades,profile);
  q.stage={...q.stage,duration:80};for(const c of q.cars)recordLap(q.weekend,c.id,c.player?1:999,0);
  return q;
 };
 const blocking=make(),responsive=make();const expected=blocking.endSession();let yields=0,clock=0;
 const actual=await responsive.endSessionAsync({budgetMs:2,now:()=>clock++,yieldControl:async()=>{
  yields++;assert.equal(responsive.sessionEnded,true);
  if(yields===1)assert.equal(await responsive.endSessionAsync(),null);
 }});
 assert.ok(yields>10,'must allow rendering and input between simulation chunks');
 assert.deepEqual(actual,expected);assert.equal(responsive.weekend.phase,'Q2');assert.equal(responsive.weekend.sessions.length,1);
 assert.deepEqual(responsive.weekend.sessions,blocking.weekend.sessions);
 assert.deepEqual(responsive.weekend.inventories,blocking.weekend.inventories);
});

test('late opponent improvements produce an explicit knockout and a reproducible grid, rather than a random start',()=>{
 function simulate(){
  const q=new QualifyingRun(createWeekend(newCareer(profile),{track:'northline',laps:24,fuel:28,tyre:'S',aiSeed:42}),'S1',upgrades,profile);
  q.stage={...q.stage,duration:220};for(const c of q.cars)recordLap(q.weekend,c.id,c.player?100:999,0);
  assert.equal(q.sessionAction(),'Move to Q2');const outcome=q.endSession();
  assert.equal(outcome.provisionalPosition,1);assert.equal(outcome.eliminated,true);assert.equal(outcome.stage,'Q1');assert.equal(outcome.keep,16);
  assert.equal(outcome.phase,'Q2');assert.equal(q.weekend.sessions.length,1);assert.ok(outcome.position>16);assert.equal(outcome.gridPosition,outcome.position);
  assert.ok(outcome.cutoffTime<outcome.playerTime);assert.equal(q.weekend.grid[outcome.gridPosition-1-q.weekend.active.length],21);
  assert.deepEqual(q.weekend.qualifyingOutcome,outcome);
  finishRemainingQualifying(q.weekend,upgrades,profile);
  assert.equal(q.weekend.grid[outcome.gridPosition-1],21);
  return {outcome,grid:q.weekend.grid};
 }
 assert.deepEqual(simulate(),simulate());
});
