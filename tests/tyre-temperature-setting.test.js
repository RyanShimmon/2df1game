import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,grip,accelerationGrip,resources,newCareer} from '../src/core.js';
import {THERMAL,thermalGrip,thermalWear,updateTyreTemperatures} from '../src/tyre-temperature.js';
import {createWeekend,QualifyingRun} from '../src/weekend.js';
const ideal=tyre=>(THERMAL[tyre].low+THERMAL[tyre].high)/2;
const check=c=>assert.deepEqual(c.tyreTemperatures,Array(4).fill(ideal(c.tyre)));
test('disabled temperature simulation pins player and all AI tyres while driving still consumes wear',()=>{
 const r=new Race({laps:8,fuel:12,tyre:'S',weather:'dry',tyreTemperatureEnabled:false,aiSeed:17});r.countdown=0;
 for(const c of r.cars){assert.equal(c.tyreTemperatureEnabled,false);check(c);}
 for(let i=0;i<120;i++)r.step(1/60,{throttle:true,steer:.5});
 for(const c of r.cars)check(c);assert.ok(r.player.wear>0);assert.ok(r.cars[0].wear>0);
});
test('off removes only temperature penalties; permanent wear, weather and compound traction remain',()=>{
 const r=new Race({laps:8,fuel:12,tyre:'M',weather:'dry',tyreTemperatureEnabled:false}),c=r.player;
 c.tyreTemperatures=[150,150,150,150];assert.equal(thermalGrip(c),1);assert.equal(thermalWear(c),1);
 resources(c,1/60,100,1,{throttle:1,brake:1,corner:1,wheelspin:1});check(c);
 assert.ok(grip({...c,wear:.9,wheelWear:null})<grip({...c,wear:0,wheelWear:null}));
 assert.ok(grip({...c,trackWetness:1})<grip({...c,trackWetness:0})*.3);
 const wet={...c,tyre:'W',trackWetness:1};assert.ok(grip(wet)>grip({...c,trackWetness:1})*3);
 assert.ok(accelerationGrip({...c,tyre:'W',trackWetness:0})>grip({...c,tyre:'W',trackWetness:0}));
});
test('mid-session off/on preserves wear, resets all temperatures and resumes dynamic heating',()=>{
 const r=new Race({laps:8,fuel:12,tyre:'S',weather:'dry'}),c=r.player;c.wear=.4;c.wheelWear=Array(4).fill(.4);c.tyreTemperatures=Array(4).fill(155);
 r.setTyreTemperature(false);for(const driver of r.cars)check(driver);assert.equal(c.wear,.4);
 const stable=grip(c);r.setTyreTemperature(true);assert.equal(grip(c),stable);assert.equal(c.wear,.4);
 c.speed=220;updateTyreTemperatures(c,1,{throttle:1,corner:1});assert.notEqual(c.tyreTemperatures[0],ideal('S'));
});
test('pit replacements and qualifying garage/set changes respect the disabled setting and serialize it',()=>{
 const r=new Race({laps:8,fuel:12,tyre:'S',weather:'dry',tyreTemperatureEnabled:false});r.nextTyre='W';r.enterPit(r.player);r.player.pit.stage='service';r.player.pit.timer=0;r.stepPit(r.player,1/60);assert.equal(r.player.tyre,'W');check(r.player);
 const career=newCareer(),w=createWeekend(career,{laps:8,tyre:'S',fuel:12,tyreTemperatureEnabled:false}),q=new QualifyingRun(w,'S1',{},{});q.cars=[q.player];check(q.player);
 for(let i=0;i<120;i++)q.step(1/60,{});check(q.player);
 assert.equal(q.selectGarageSet('M1'),true);q.player.pit.timer=0;q.step(1/60,{});assert.equal(q.player.tyre,'M');check(q.player);
 q.setTyreTemperature(true);assert.equal(w.setup.tyreTemperatureEnabled,true);q.setTyreTemperature(false);assert.equal(JSON.parse(JSON.stringify(w)).setup.tyreTemperatureEnabled,false);
 for(const set of q.player.tyreInventory)assert.deepEqual(set.temperatures,Array(4).fill(ideal(set.compound)));
});
