import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,acceleration,brakingDeceleration,estimatedTyreLife,tyreServiceTime} from '../src/core.js';
import {fullUpgrades,UPGRADES} from '../src/development.js';
import {beginRaceSession,restoreRaceSession} from '../src/race-session.js';
const setup={track:'northline',laps:16,fuel:17,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false};
test('the full-development Quick Race grid uses every maximum upgrade and keeps it on restart',()=>{
 const r=new Race({...setup,fullDevelopment:true});
 for(const car of r.cars)for(const [key,upgrade] of Object.entries(UPGRADES))assert.equal(car.upgrades[key],upgrade.max);
 const session=beginRaceSession(r),resumed=restoreRaceSession(session,null),restarted=restoreRaceSession(session,null,{restart:true});
 for(const result of [resumed,restarted])for(const car of result.cars)assert.deepEqual(car.upgrades,fullUpgrades());
});
test('full development improves actual acceleration, braking, tyre life and crew service',()=>{
 const base=new Race(setup),full=new Race({...setup,fullDevelopment:true});
 base.player.speed=full.player.speed=180;
 assert.ok(acceleration(full.player)>acceleration(base.player));assert.ok(brakingDeceleration(full.player)>brakingDeceleration(base.player));
 assert.ok(estimatedTyreLife('M',{upgrades:full.player.upgrades})>estimatedTyreLife('M'));
 assert.ok(tyreServiceTime(full.player.upgrades.crew)<tyreServiceTime(base.player.upgrades.crew));
});
test('Career keeps its purchased upgrades regardless of a copied Quick Race flag',()=>{
 const upgrades={engine:1,aero:2},r=new Race({...setup,fullDevelopment:true,playerUpgrades:upgrades},upgrades,'career');
 assert.equal(r.player.upgrades.engine,1);assert.equal(r.player.upgrades.aero,2);assert.equal(r.player.upgrades.crew,0);
});
