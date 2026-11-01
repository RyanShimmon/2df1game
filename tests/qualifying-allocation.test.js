import test from 'node:test';
import assert from 'node:assert/strict';
import {tyreAllocation,selectableSets,isQualifyingSet,WEEKEND_QUOTA} from '../src/tyre-stock.js';
import {createWeekend,migrateWeekend,beginQualifying,finishQualifyingStage,recordLap,prepareRace} from '../src/weekend.js';
import {Race} from '../src/core.js';
import {createWeather} from '../src/weather.js';
import {newCareer} from './career-fixture.js';
const profile={driverName:'Allocation',teamIndex:2};
const weekend=()=>{const w=createWeekend(newCareer(profile),{tyre:'S',aiSeed:42});w.weather=createWeather('dry');return w;};
test('one independent qualifying set per compound, eligible in every qualifying stage and never in the race',()=>{
 const inv=tyreAllocation();
 for(const [compound,quota] of Object.entries(WEEKEND_QUOTA)){
  const dedicated=inv.filter(t=>t.compound===compound&&isQualifyingSet(t));
  assert.equal(dedicated.length,1);
  for(const phase of ['Q1','Q2','Q3'])assert.equal(selectableSets(inv,phase).filter(t=>t.compound===compound).length,quota+1);
  assert.equal(selectableSets(inv,'R').filter(t=>t.compound===compound).length,quota);
  dedicated[0].wear=.38;dedicated[0].used=true;
  for(const phase of ['Q1','Q2','Q3'])assert.equal(selectableSets(inv,phase).find(t=>t.id===dedicated[0].id).wear,.38);
 }
 assert.deepEqual(inv.filter(isQualifyingSet).map(t=>t.id),['H2','M2','S3','I3','W2']);
});
test('a fresh dry qualifying start preserves race stock for the player and all AI',()=>{
 const w=weekend(),q=beginQualifying(w,{},profile);
 for(const c of q.cars)assert.equal(c.tyreSet.id,'S3');
});
test('dedicated tyres are returned for all drivers, including Q1 eliminations',()=>{
 const w=weekend();w.active=[0,21];w.phase='Q3';w.grid=Array.from({length:20},(_,i)=>i+1);
 w.elapsed=99999;recordLap(w,21,30,0);recordLap(w,0,31,1);finishQualifyingStage(w,{},profile);
 for(const inv of w.inventories){assert.equal(selectableSets(inv,'R').length,7);assert.ok(inv.filter(isQualifyingSet).every(t=>t.returned));}
});
test('legacy allocation migration adds only the dedicated stock, preserves history, and never refills it on reload',()=>{
 const w=weekend();w.allocationVersion=3;
 const oldIds=new Set(['H1','M1','S1','S2','S3','I1','I2','W1']);
 for(const inv of w.inventories)for(const t of inv){delete t.qualifyingOnly;t.returned=!oldIds.has(t.id);}
 const soft=w.inventories[21].find(t=>t.id==='S3');Object.assign(soft,{wear:.52,distance:12000,used:true});
 migrateWeekend(w);
 for(const inv of w.inventories)assert.equal(selectableSets(inv,'Q1').length,12);
 assert.equal(soft.wear,.52);assert.equal(soft.distance,12000);
 soft.wear=1.1;soft.returned=true;const saved=structuredClone(w);migrateWeekend(w);assert.deepEqual(w,saved);
});
test('a qualifying-only starting-set ID is rejected by race preparation, regardless of UI filtering',()=>{
 const w=weekend();w.phase='R';w.grid=Array.from({length:22},(_,i)=>i);
 for(const id of ['S3','M2','H2','I3','W2']){
  const r=new Race(w.setup,{},'career',profile);
  assert.throws(()=>prepareRace(r,w,id),/unavailable/);
 }
});
