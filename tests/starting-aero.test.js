import test from 'node:test';
import assert from 'node:assert/strict';
import {newCareer} from './career-fixture.js';
import {Race,loadCareer,grip,cleanAirTopSpeed,acceleration,buyUpgrade} from '../src/core.js';
import {setAeroPackage,aeroPackage,aeroUnlocked,AERO_PACKAGES} from '../src/development.js';
import {createWeekend,recordLap,finishQualifyingStage,prepareRace,migrateWeekend} from '../src/weekend.js';
const profile={driverName:'Setup tester',teamIndex:2};
test('buying the first aero upgrade unlocks packages; every factory package request is neutral',()=>{
 const c=newCareer(profile);c.cash=20000;assert.equal(aeroUnlocked(c.upgrades),false);
 assert.equal(setAeroPackage(c,'lowDrag'),false);
 const r=new Race({track:'northline',laps:12,fuel:14,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false});
 const car=r.player;car.speed=200;
 const expected=[grip(car),cleanAirTopSpeed(car),acceleration(car)];
 for(const spec of Object.keys(AERO_PACKAGES)){
  car.aeroSpec=spec;assert.equal(aeroPackage({},spec),AERO_PACKAGES.balanced);
  assert.deepEqual([grip(car),cleanAirTopSpeed(car),acceleration(car)],expected);
 }
 assert.equal(buyUpgrade(c,'aero'),true);assert.equal(aeroUnlocked(c.upgrades),true);
 assert.equal(setAeroPackage(c,'lowDrag'),true);
});
test('pre-race package selection survives a reload and fits at the start without changing grid, tyres or adding service',()=>{
 const c=newCareer(profile);c.upgrades.aero=1;
 const w=c.weekend=createWeekend(c,{tyre:'M',aiSeed:42});
 for(let stage=0;stage<3;stage++){
  for(const id of w.active)recordLap(w,id,id===21?20:40+id,id);
  finishQualifyingStage(w,c.upgrades,profile);
 }
 const grid=structuredClone(w.grid),inventory=structuredClone(w.inventories),sessions=structuredClone(w.sessions);
 for(const spec of ['lowDrag','downforce','balanced']){
  assert.equal(setAeroPackage(c,spec),true);assert.equal(w.setup.aeroSpec,spec);
  const loaded=loadCareer({getItem:()=>JSON.stringify(c)}),race=new Race(loaded.weekend.setup,loaded.upgrades,'career',profile);
  prepareRace(race,loaded.weekend,'M1');
  assert.equal(race.player.aeroSpec,spec);assert.equal(race.nextAeroSpec,spec);assert.equal(race.player.pit,null);assert.equal(race.player.stops,0);
  assert.deepEqual(w.grid,grid);assert.deepEqual(w.sessions,sessions);assert.deepEqual(w.inventories,inventory);
 }
});
test('qualifying cannot bypass pit service, nor unlock through a stale stored package',()=>{
 const c=newCareer(profile);c.upgrades.aero=1;const w=c.weekend=createWeekend(c,{tyre:'S',aiSeed:42});
 assert.equal(setAeroPackage(c,'lowDrag'),false);
 c.upgrades.aero=0;w.setup.playerUpgrades.aero=0;w.setup.aeroSpec='lowDrag';migrateWeekend(w);
 assert.equal(w.setup.aeroSpec,'balanced');w.phase='R';assert.equal(setAeroPackage(c,'downforce'),false);
});
