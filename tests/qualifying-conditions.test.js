import test from 'node:test';
import assert from 'node:assert/strict';
import {loadCareer} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {createWeekend,QualifyingRun,recordLap,stageOrder} from '../src/weekend.js';
const profile={driverName:'Velocity replay',teamIndex:2};
for(const saved of [false,true])test(`Velocity Q1: a leading 32.80 lap survives early completion (${saved?'saved garage':'live session'})`,async()=>{
 let c=newCareer(profile);c.round=2;
 let w=c.weekend=createWeekend(c,{tyre:'W',difficulty:'easy',aiSeed:42});
 let q=new QualifyingRun(w,'W1',c.upgrades,profile);
 // Replay the user's banked lap while every opponent completes its physical
 // first run on the wet second career circuit. No fabricated AI lap times.
 for(let i=0;i<60*300&&!q.canEndSession();i++){
  q.step(1/60,{});if(q.time>=90&&!w.results.some(r=>r.id===21))recordLap(w,21,32.8,q.time);
 }
 assert.equal(stageOrder(w)[0],21);assert.equal(q.sessionAction(),'Move to Q2');
 assert.ok(w.weather.wetness>.5);
 // A clearing arrives just as the player ends Q1. Further AI runs must not
 // receive the drying-track advantage that caused the reported knockout.
 w.weather.points=[[0,0],[5000,0]];w.weather.rain=0;
 if(saved){q.endRun();c=loadCareer({getItem:()=>JSON.stringify(c)});w=c.weekend;q=new QualifyingRun(w,'W1',c.upgrades,profile);}
 const weather=structuredClone(w.weather),banked=structuredClone(w.results.find(r=>r.id===21));
 const outcome=await q.endSessionAsync({yieldControl:async()=>{}});
 assert.equal(outcome.through,true);assert.equal(w.phase,'Q2');assert.equal(w.sessions.length,1);
 assert.equal(outcome.position,1);assert.deepEqual(w.sessions[0].results.find(r=>r.id===21),banked);
 assert.deepEqual(w.weather,weather,'early completion must not give opponents a drying-track advantage');
 assert.ok(q.cars.filter(c=>!c.player).some(c=>c.stops>=2),'opponents still make several real outings');
 assert.ok(w.inventories[0].some(set=>set.wear>0),'opponents pay the actual tyre wear');
 const next=new QualifyingRun(w,'W1',c.upgrades,profile);next.step(.05,{});
 assert.ok(w.weather.elapsed>weather.elapsed);assert.ok(w.weather.wetness<weather.wetness,'live Q2 weather resumes normally');
});
test('the weather continues evolving when the player stays in the live session',()=>{
 const c=newCareer(profile);c.round=2;const w=createWeekend(c,{tyre:'W',difficulty:'normal',aiSeed:42});
 const q=new QualifyingRun(w,'W1',c.upgrades,profile),before=w.weather.wetness;
 for(let i=0;i<20*200;i++)q.step(.05,{});
 assert.ok(w.weather.elapsed>199);assert.notEqual(w.weather.wetness,before);
});
