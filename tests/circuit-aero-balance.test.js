import test from 'node:test';
import assert from 'node:assert/strict';
import {CIRCUITS,selectTrack} from '../src/core.js';
import {benchmarkAero} from '../scripts/benchmark-aero.mjs';
test.afterEach(()=>selectTrack('northline'));
const special=new Set(['sunset','velocity','harbour','riviera']);
for(const track of CIRCUITS)test(`${track.name}: measured aero gains match its circuit character`,()=>{
 const row=benchmarkAero(track.id);
 for(const run of Object.values(row.results)){assert.equal(run.trackLimits,0);assert.ok(run.lap>0);assert.ok(run.maxHeadingError<.01);}
 if(!special.has(track.id)){
  assert.ok(Math.abs(row.downforceAdvantagePct)<3,`whole-lap imbalance: ${row.downforceAdvantagePct}%`);
  assert.ok(row.downforceSections>=7&&row.lowDragSections>=7,'both packages need substantial winning sections');
 }else if(track.id==='sunset')assert.ok(row.downforceAdvantagePct<-8,'oval rewards straight-line speed');
 else if(track.id==='velocity')assert.ok(row.downforceAdvantagePct<-2&&row.downforceSections>=5,'fast circuit still has useful downforce corners');
 else assert.ok(row.downforceAdvantagePct>4&&row.lowDragSections>=2,'technical circuit still gives low drag a straight-line advantage');
});
for(const track of ['crossover','dunes','forest'])test(`${track}: rain reverses the specialist setup preference`,()=>{
 const dry=benchmarkAero(track),wet=benchmarkAero(track,'wet');
 assert.ok(dry.downforceAdvantagePct<0&&wet.downforceAdvantagePct>2);
 assert.ok(wet.lowDragSections>=7,'wet conditions must not erase all speed-package opportunities');
});
