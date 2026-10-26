import test from 'node:test';import assert from 'node:assert/strict';
import {Race} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {createWeekend,migrateWeekend,selectableSets,QualifyingRun,prepareRace} from '../src/weekend.js';
const profile={driverName:'Test',teamIndex:2},setup={track:'northline',laps:24,fuel:28,tyre:'S',aiSeed:42};
function legacy(){
 const w=createWeekend(newCareer(profile),setup);delete w.softSetNumbering;
 for(const inv of w.inventories){for(const t of inv)if(t.compound==='S'){t.reserved=t.id==='S4';t.returned=!['S1','S2','S4'].includes(t.id);}}
 return w;
}
test('soft stock is S1, S2 and reserved S3 for every driver, with no extra tyre allowance',()=>{
 const w=createWeekend(newCareer(profile),setup);
 for(const inv of w.inventories){
  assert.deepEqual(inv.filter(t=>t.compound==='S'&&!t.returned).map(t=>t.id),['S1','S2','S3']);
  assert.equal(selectableSets(inv,'Q1').some(t=>t.id==='S3'),false);assert.equal(selectableSets(inv,'Q3').some(t=>t.id==='S3'),true);
 }
});
test('legacy numbering migrates selected physical sets, wheel wear, history and eligibility once',()=>{
 const w=legacy(),inv=w.inventories[21],reserved=inv.find(t=>t.id==='S4');
 Object.assign(reserved,{wear:.27,wheelWear:[.24,.26,.28,.30],distance:14000,used:true});
 w.phase='Q3';w.selectedSetId='S4';w.startSetId='S4';const reference=structuredClone(reserved);
 migrateWeekend(w);assert.equal(reserved.id,'S3');assert.equal(w.selectedSetId,'S3');assert.equal(w.startSetId,'S3');
 for(const key of ['wear','wheelWear','distance','used','reserved','returned'])assert.deepEqual(reserved[key],reference[key]);
 for(const stock of w.inventories)assert.equal(new Set(stock.map(t=>t.id)).size,stock.length);
 const before=JSON.stringify(w);migrateWeekend(w);assert.equal(JSON.stringify(w),before);
});
test('a qualifying constructor follows an old selected ID to the same physical set after renumbering',()=>{
 const w=legacy();w.phase='Q3';const physical=w.inventories[21].find(t=>t.id==='S4');physical.wear=.31;
 const q=new QualifyingRun(w,'S4',{},profile);assert.equal(q.player.tyreSet,physical);assert.equal(q.player.tyreSet.id,'S3');assert.equal(q.player.wear,.31);
});

test('race preparation follows an old selected ID to the same worn physical set',()=>{
 const w=legacy();w.phase='R';w.grid=Array.from({length:22},(_,i)=>i);
 const physical=w.inventories[21].find(t=>t.id==='S4');physical.wear=.16;
 const r=new Race(w.setup,{},'career',profile);prepareRace(r,w,'S4');
 assert.equal(r.player.tyreSet,physical);assert.equal(physical.id,'S3');assert.equal(r.player.wear,.16);
});
