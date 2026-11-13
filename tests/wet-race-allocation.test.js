import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeekend,startRaceWeather,migrateWeekend,validWeekend,prepareRace} from '../src/weekend.js';
import {selectableSets} from '../src/tyre-stock.js';
import {createWeather,hasWetRaceConditions} from '../src/weather.js';
import {Race,resources,TRACK} from '../src/core.js';
import {beginRaceSession,restoreRaceSession} from '../src/race-session.js';
import {newCareer} from './career-fixture.js';
const profile={driverName:'Wet allocation',teamIndex:2};
function event(pattern){
 const career=newCareer(profile),w=createWeekend(career,{tyre:'M',aiSeed:42,weatherSeed:11});
 w.phase='R';w.grid=Array.from({length:22},(_,i)=>i);w.setup.weather=pattern;
 w.weather=createWeather('dry',{seed:11,duration:900});career.weekend=w;
 return {career,w};
}
const wetCounts=(inv,phase='R')=>['I','W'].map(compound=>selectableSets(inv,phase).filter(t=>t.compound===compound).length);
test('a completely dry race retains the usual allocation for every driver',()=>{
 const {w}=event('dry');startRaceWeather(w);
 assert.equal(hasWetRaceConditions(w.weather),false);
 for(const inv of w.inventories){assert.deepEqual(wetCounts(inv),[2,1]);assert.equal(inv.length,20);}
});
for(const pattern of ['lateRain','intermediate','sustainedRain','wetToDry','showers'])test(`${pattern}: every driver receives one additional Intermediate and Wet race set`,()=>{
 const {career,w}=event(pattern),qualifying=wetCounts(w.inventories[21],'Q1');startRaceWeather(w);
 for(const inv of w.inventories){assert.deepEqual(wetCounts(inv),[3,2]);assert.deepEqual(wetCounts(inv,'Q1'),qualifying);assert.ok(inv.find(t=>t.id==='W2').qualifyingOnly);}
 assert.ok(validWeekend(w,career));
 const before=structuredClone(w);startRaceWeather(w);migrateWeekend(w);assert.deepEqual(w,before);
});
test('wet qualifying carry-over grants reserves even if no more rain is expected',()=>{
 const {w}=event('dry');w.weather.wetness=.3;w.weather.sectors.fill(.3);startRaceWeather(w);
 assert.deepEqual(wetCounts(w.inventories[21]),[3,2]);
});
test('weather beyond the race horizon alone does not grant more tyres',()=>{
 const state=createWeather('dry',{duration:240});state.points=[[0,0],[250,0],[300,.8]];
 assert.equal(hasWetRaceConditions(state),false);state.points=[[0,0],[200,0],[300,.8]];
 assert.equal(hasWetRaceConditions(state),true,'interpolated rain reaches the race before its next forecast point');
});
test('reserve wear and eligibility survive race preparation, saved reload and repeated garage visits',()=>{
 const {career,w}=event('lateRain');startRaceWeather(w);
 const r=new Race(w.setup,{},'career',profile);prepareRace(r,w,'W3');
 resources(r.player,1,TRACK.length*2);const used=r.player.tyreSet.wear;assert.ok(used>0);
 const session=beginRaceSession(r,career),restored=restoreRaceSession(session,career);
 assert.ok(restored);assert.equal(restored.player.tyreSet.id,'W3');assert.equal(restored.player.wear,used);
 migrateWeekend(w);startRaceWeather(w);assert.equal(w.inventories[21].find(t=>t.id==='W3').wear,used);
 assert.deepEqual(wetCounts(w.inventories[21]),[3,2]);assert.ok(validWeekend(w,career));
 assert.ok(!selectableSets(w.inventories[21],'Q3').some(t=>t.raceOnly));
});

test('an older in-race checkpoint gains the reserves once without replacing its fitted set',()=>{
 const {career,w}=event('lateRain');startRaceWeather(w);
 const r=new Race(w.setup,{},'career',profile);prepareRace(r,w,'M1');
 resources(r.player,1,TRACK.length);const session=beginRaceSession(r,career);
 for(const saved of session.current.cars){
  saved.inventory=saved.inventory.filter(t=>t.id!=='W3');
  const inter=saved.inventory.find(t=>t.id==='I4');delete inter.raceOnly;inter.returned=true;
 }
 const restored=restoreRaceSession(session,career);
 for(const c of restored.cars)assert.deepEqual(wetCounts(c.tyreInventory),[3,2]);
 assert.equal(restored.player.tyreSet.id,'M1');assert.equal(restored.player.wear,r.player.wear);
});
