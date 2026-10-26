import test from 'node:test';
import assert from 'node:assert/strict';
import {newCareer,loadCareer,settleCareer} from '../src/core.js';
import {WEEKENDS,careerSchedule,ensureSeasonOrder,shuffledSeasonOrder,validSeasonOrder} from '../src/calendar.js';
import {createWeekend,migrateWeekend} from '../src/weekend.js';
const profile={driverName:'Calendar tester',teamIndex:2};
const seed=initial=>{let n=initial;return()=>((n=(Math.imul(n,1664525)+1013904223)>>>0)/2**32);};
test('new careers receive independent twelve-event orders, each retained across reloads',t=>{
 t.mock.method(Math,'random',seed(42));
 const a=newCareer(profile),b=newCareer(profile);
 assert.ok(validSeasonOrder(a.seasonOrder));assert.ok(validSeasonOrder(b.seasonOrder));assert.notDeepEqual(a.seasonOrder,b.seasonOrder);
 const saved=loadCareer({getItem:()=>JSON.stringify(a)});assert.deepEqual(saved.seasonOrder,a.seasonOrder);
 for(let round=1;round<=12;round++){
  saved.round=round;assert.equal(careerSchedule(saved).track,a.seasonOrder[round-1]);
  const w=createWeekend(saved,{tyre:'M',aiSeed:42});migrateWeekend(w);
  const event=WEEKENDS.find(e=>e.track===a.seasonOrder[round-1]);
  assert.equal(w.setup.track,event.track);assert.equal(w.setup.laps,event.laps);assert.equal(w.setup.raceFormat,event.raceFormat || 'grandPrix');assert.equal(w.setup.weather,event.weather);
 }
});
test('a season rollover reshuffles once, with no duplicate or missing circuits',t=>{
 t.mock.method(Math,'random',seed(7));
 const c=newCareer(profile),before=[...c.seasonOrder];c.round=12;
 settleCareer(c,{position:5,legal:true,dnf:false,raceFormat:'grandPrix'});
 assert.equal(c.season,2);assert.equal(c.round,1);assert.ok(validSeasonOrder(c.seasonOrder));assert.notDeepEqual(c.seasonOrder,before);
 const after=[...c.seasonOrder];for(let i=0;i<5;i++)assert.deepEqual(ensureSeasonOrder(c),after);
 const identity=shuffledSeasonOrder([],()=>.999);
 assert.notDeepEqual(shuffledSeasonOrder(identity,()=>.999),identity,'identical random draws still change the next season');
});
test('legacy saves retain completed rounds and an active weekend while future rounds shuffle',()=>{
 const c=newCareer(profile,{seasonOrder:WEEKENDS.map(w=>w.track)});c.round=4;c.weekend=createWeekend(c,{tyre:'S',aiSeed:42});
 const before=structuredClone(c.weekend);delete c.seasonOrder;delete c.calendarSeason;delete c.weekend.seasonOrder;
 const loaded=loadCareer({getItem:()=>JSON.stringify(c)});migrateWeekend(loaded.weekend);
 assert.ok(validSeasonOrder(loaded.seasonOrder));assert.deepEqual(loaded.seasonOrder.slice(0,4),WEEKENDS.slice(0,4).map(w=>w.track));
 assert.equal(loaded.weekend.setup.track,before.setup.track);assert.equal(loaded.weekend.setup.laps,12);assert.equal(loaded.weekend.setup.raceFormat,'sprint');assert.deepEqual(loaded.weekend.inventories,before.inventories);
});
