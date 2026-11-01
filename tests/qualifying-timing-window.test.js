import test from 'node:test';
import assert from 'node:assert/strict';
import {newCareer} from './career-fixture.js';
import {createWeekend,recordLap,qualifyingTimingWindow} from '../src/weekend.js';
function session(phase,position){
 const w=createWeekend(newCareer({driverName:'Timing',teamIndex:2}),{tyre:'S',weather:'dry'});
 w.phase=phase;const count=phase==='Q1'?22:phase==='Q2'?16:10;
 w.active=Array.from({length:count-1},(_,i)=>i).concat(21);
 const order=w.active.filter(id=>id!==21);order.splice(position-1,0,21);
 for(const [i,id] of order.entries())recordLap(w,id,30+i/10,i);
 return w;
}
for(const phase of ['Q1','Q2','Q3'])test(`${phase} timing shows five drivers including the player at every position`,()=>{
 const count=phase==='Q1'?22:phase==='Q2'?16:10;
 for(let position=1;position<=count;position++){
  const rows=qualifyingTimingWindow(session(phase,position));
  assert.deepEqual(rows.map(row=>row.rank),Array.from({length:5},(_,i)=>Math.max(1,Math.min(position-2,count-4))+i));
  assert.equal(rows.find(row=>row.id===21).rank,position);
  assert.ok(rows.every(row=>Number.isFinite(row.time)));assert.ok(rows.length===5);
  if(phase==='Q3')assert.ok(rows.every(row=>!row.cutoffBefore&&!row.cutoffAfter));
 }
});
for(const [phase,keep] of [['Q1',16],['Q2',10]])test(`${phase} shows the cutoff only when the nearby rows reach it`,()=>{
 for(const position of [1,keep-2,keep-1,keep,keep+1,keep+2,keep+3]){
  const rows=qualifyingTimingWindow(session(phase,position));
  const dividers=rows.filter(row=>row.cutoffBefore||row.cutoffAfter);
  assert.equal(dividers.length,position>=keep-2&&position<=keep+3 ? 1 : 0);
  for(const row of dividers)assert.equal(row.rank,row.cutoffBefore?keep+1:keep);
 }
});
test('an unset player lap stays visible without manufacturing a time or adding cutoff context',()=>{
 const w=session('Q1',22);w.results=w.results.filter(row=>row.id!==21);
 const rows=qualifyingTimingWindow(w);
 assert.equal(rows.length,5);assert.equal(rows.at(-1).id,21);assert.equal(rows.at(-1).time,null);
 assert.ok(rows.every(row=>!row.cutoffBefore&&!row.cutoffAfter));
 w.active=w.active.filter(id=>id!==21);assert.deepEqual(qualifyingTimingWindow(w),[]);
});
