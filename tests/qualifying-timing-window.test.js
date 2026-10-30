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
for(const phase of ['Q1','Q2','Q3'])test(`${phase} timing shows only the player and immediate neighbours`,()=>{
 const count=phase==='Q1'?22:phase==='Q2'?16:10;
 for(let position=1;position<=count;position++){
  const rows=qualifyingTimingWindow(session(phase,position));
  assert.deepEqual(rows.map(row=>row.rank),Array.from({length:Math.min(count,position+1)-Math.max(1,position-1)+1},(_,i)=>Math.max(1,position-1)+i));
  assert.equal(rows.find(row=>row.id===21).rank,position);
  assert.ok(rows.every(row=>Number.isFinite(row.time)));assert.ok(rows.length<=3);
  if(phase==='Q3')assert.ok(rows.every(row=>!row.cutoffBefore&&!row.cutoffAfter));
 }
});
for(const [phase,keep] of [['Q1',16],['Q2',10]])test(`${phase} shows the cutoff only when the nearby rows reach it`,()=>{
 for(const position of [1,keep-2,keep-1,keep,keep+1,keep+2,keep+3]){
  const rows=qualifyingTimingWindow(session(phase,position));
  const dividers=rows.filter(row=>row.cutoffBefore||row.cutoffAfter);
  assert.equal(dividers.length,position>=keep-1&&position<=keep+2 ? 1 : 0);
  for(const row of dividers)assert.equal(row.rank,row.cutoffBefore?keep+1:keep);
 }
});
test('an unset player lap stays visible without manufacturing a time or adding cutoff context',()=>{
 const w=session('Q1',22);w.results=w.results.filter(row=>row.id!==21);
 const rows=qualifyingTimingWindow(w);
 assert.equal(rows.length,2);assert.equal(rows.at(-1).id,21);assert.equal(rows.at(-1).time,null);
 assert.ok(rows.every(row=>!row.cutoffBefore&&!row.cutoffAfter));
 w.active=w.active.filter(id=>id!==21);assert.deepEqual(qualifyingTimingWindow(w),[]);
});
