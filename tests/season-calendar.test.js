import test from 'node:test';
import assert from 'node:assert/strict';
import {newCareer,loadCareer,settleCareer,CIRCUITS} from '../src/core.js';
import {WEEKENDS,weekendSchedule,SEASON_LENGTH} from '../src/calendar.js';
import {createWeekend,ensureWeekend} from '../src/weekend.js';
import {developTeams,fundTeams} from '../src/development.js';
const profile={driverName:'Calendar test',teamIndex:2};
const result={position:10,legal:true,dnf:false,contacts:0,penalties:0};
test('a season visits every circuit exactly once and rolls over only after round twelve',()=>{
 assert.equal(SEASON_LENGTH,12);assert.deepEqual(WEEKENDS.map(w=>w.track).sort(),CIRCUITS.map(c=>c.id).sort());
 const c=newCareer(profile);
 for(let round=1;round<=12;round++){
  assert.equal(c.round,round);assert.equal(c.season,1);
  assert.equal(weekendSchedule(round).track,WEEKENDS[round-1].track);
  const paid=settleCareer(c,result);assert.equal(paid.seasonEnded,round===12);
  if(round<12)assert.equal(paid.seasonBonus,0);
  const loaded=loadCareer({getItem:()=>JSON.stringify(c)});assert.equal(loaded.round,c.round);assert.equal(loaded.cash,c.cash);
 }
 assert.equal(c.round,1);assert.equal(c.season,2);assert.equal(c.history.length,12);
});
test('old six-round careers keep their current weekend, money and once-per-round team accounting',()=>{
 const c=newCareer(profile);c.season=2;c.round=4;c.cash=12345;c.points=123;c.seasonPoints=45;
 c.weekend=createWeekend(c,{aiSeed:42,tyre:'M'});c.weekend.elapsed=123;
 delete c.calendarVersion;
 for(const t of c.teams){t.lastRound=10;t.fundedRound=10;t.lastIncome={round:10,earned:500};t.history=[{round:10,spent:1000}];}
 const w=JSON.stringify(c.weekend),loaded=loadCareer({getItem:()=>JSON.stringify(c)});
 assert.equal(loaded.cash,12345);assert.equal(loaded.points,123);assert.equal(loaded.seasonPoints,45);
 assert.equal(JSON.stringify(ensureWeekend(loaded,{aiSeed:42})),w);
 assert.equal(loaded.teams[0].lastRound,16);assert.equal(loaded.teams[0].fundedRound,16);assert.equal(loaded.teams[0].history[0].round,16);
 const before=JSON.stringify(loaded.teams);assert.equal(developTeams(loaded,42),false);fundTeams(loaded,result,[]);
 assert.equal(JSON.stringify(loaded.teams),before);
 assert.deepEqual(loadCareer({getItem:()=>JSON.stringify(loaded)}),loaded);
});
