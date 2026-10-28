import test from 'node:test';
import assert from 'node:assert/strict';
import {chooseAIAero,developmentSnapshot} from '../src/development.js';
import {newCareer,Race,loadCareer,TEAMS} from '../src/core.js';
import {createWeekend,QualifyingRun} from '../src/weekend.js';
test('AI packages require purchased aero and make stable, imperfect choices even at the oval',()=>{
 const choices=new Set();
 for(let seed=1;seed<=50;seed++)for(let teamIndex=0;teamIndex<11;teamIndex++){
  const context={seed,teamIndex,round:1,trackId:'sunset'};
  assert.equal(chooseAIAero({},context),'balanced');
  const choice=chooseAIAero({aero:1},context);choices.add(choice);assert.equal(chooseAIAero({aero:1},context),choice);
 }
 assert.deepEqual([...choices].sort(),['balanced','downforce','lowDrag']);
});
test('teams vary by weekend without copying the player or consuming their random stream',()=>{
 const c=newCareer({driverName:'Tester',teamIndex:2});c.developmentSeed=42;c.upgrades.aero=1;c.teams.forEach(t=>t.upgrades.aero=1);
 const first=developmentSnapshot(c,'northline');c.aeroSpec='lowDrag';assert.deepEqual(developmentSnapshot(c,'northline'),first);
 c.round=2;assert.notDeepEqual(developmentSnapshot(c,'northline'),first);
 assert.ok(new Set(first.map(t=>t.aeroSpec)).size>=2);
});
test('qualifying, reload and the race keep the actual weekend AI packages',()=>{
 const profile={driverName:'Tester',teamIndex:2},c=newCareer(profile);c.developmentSeed=42;c.upgrades.aero=1;c.teams.forEach(t=>t.upgrades.aero=1);
 const w=createWeekend(c,{aiSeed:42,tyre:'M'});c.weekend=w;
 const restored=loadCareer({getItem:()=>JSON.stringify(c)});
 assert.deepEqual(restored.weekend.setup.teamDevelopment,w.setup.teamDevelopment);
 const q=new QualifyingRun(w,'S1',c.upgrades,profile),race=new Race(restored.weekend.setup,c.upgrades,'career',profile);
 for(const car of race.cars.filter(c=>!c.player)){
  const expected=w.setup.teamDevelopment.find(t=>t.teamIndex===TEAMS.indexOf(car.team)).aeroSpec;
  assert.equal(car.aeroSpec,expected);assert.equal(q.cars.find(c=>c.id===car.id).aeroSpec,expected);
 }
});
