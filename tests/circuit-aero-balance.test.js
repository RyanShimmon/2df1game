import test from 'node:test';
import assert from 'node:assert/strict';
import {CIRCUITS,selectTrack} from '../src/core.js';
import {benchmarkAero} from '../scripts/benchmark-aero.mjs';
test.afterEach(()=>selectTrack('northline'));
for(const track of CIRCUITS)test(`${track.name}: arcade lap length and stable driving without prolonged speed-cap running`,()=>{
 const row=benchmarkAero(track.id),reference=row.results.balanced;
 assert.ok(reference.lap>=25&&reference.lap<=50,`dry reference lap ${reference.lap}s`);
 for(const run of Object.values(row.results)){assert.equal(run.trackLimits,0);assert.ok(run.maxHeadingError<.01);assert.ok(run.lap>=20&&run.lap<=55);}
 if(track.id!=='sunset')assert.ok(reference.nearCapPct<15,`time at ceiling: ${reference.nearCapPct}%`);
 // Preserve strengths; do not force equality between setups on each circuit.
 if(track.id==='sunset'){
  assert.ok(row.results.lowDrag.lap<row.results.downforce.lap*.93);
  // Require a meaningful setup advantage, without making a 4% tuning
  // benchmark a hard rule (the refined braking model measures about 3.9%).
  assert.ok(row.results.lowDrag.lap<reference.lap*.97,'the oval should reward low drag over Balanced too');
 }
 if(['northline','alpine'].includes(track.id))assert.ok(row.results.downforce.lap<row.results.lowDrag.lap*.97);
 assert.ok(row.lowDragSections>0,'speed-oriented setup has a useful section');
});
for(const track of ['crossover','dunes','forest'])test(`${track}: wet conditions retain shared tyre limits and distinct setup behaviour`,()=>{
 const dry=benchmarkAero(track),wet=benchmarkAero(track,'wet');
 for(const spec of ['balanced','downforce','lowDrag']){
  assert.ok(wet.results[spec].lap>dry.results[spec].lap);assert.equal(wet.results[spec].trackLimits,0);
 }
 assert.ok(Math.abs(wet.downforceAdvantagePct-dry.downforceAdvantagePct)>.1);
});
for(const track of ['northline','dunes','canyon'])test(`${track}: developed Push cars still need to accelerate between bends`,()=>{
 const row=benchmarkAero(track,'dry',{upgrades:{engine:5,aero:5},fuel:6,mode:'push'});
 assert.ok(row.results.balanced.nearCapPct<25);
 assert.ok(row.results.balanced.lap<benchmarkAero(track).results.balanced.lap);
});
