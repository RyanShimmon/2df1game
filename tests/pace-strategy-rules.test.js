import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,TYRES,sample,acceleration,cleanAirTopSpeed,maximumSpeed,grip,brakingDeceleration,drivingTyreEffort,resources,settleCareer,tyreRuleMet,estimatedTyreLife} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {paceMode,stepPaceMode,fuelPerLap,tyreWearFactor} from '../src/performance.js';
import {planRaceStrategy} from '../src/strategy.js';
import {racePoints,QUICK_DISTANCES} from '../src/race-rules.js';
import {createWeekend,migrateWeekend,validWeekend} from '../src/weekend.js';
import {sponsorMet} from '../src/sponsors.js';
const vehicle=(drive='balanced')=>({drive,tyre:'M',wear:0,wheelWear:[0,0,0,0],speed:200,fuel:37,pace:1,upgrades:{engine:5},aeroSpec:'balanced',trackWetness:0,s:0,offset:0,tyreTemperatureEnabled:false,tyreAge:0});
test('modes alter power at every speed and retain separate ceilings at every upgrade level with aero and draft',()=>{
 for(const engine of [0,1,5])for(const aeroSpec of ['balanced','downforce','lowDrag']){
  const cars=['save','balanced','push'].map(mode=>({...vehicle(mode),aeroSpec,upgrades:{engine}}));
  for(const speed of [50,200,290]){cars.forEach(c=>c.speed=speed);assert.ok(acceleration(cars[2])>acceleration(cars[1]));assert.ok(acceleration(cars[1])>acceleration(cars[0]));}
  assert.ok(cleanAirTopSpeed(cars[0])<cleanAirTopSpeed(cars[1]));assert.ok(cleanAirTopSpeed(cars[1])<cleanAirTopSpeed(cars[2]));
  for(const c of cars){c.slipstream={carry:1};assert.equal(maximumSpeed(c),cleanAirTopSpeed(c)+18);}
 }
 assert.equal(cleanAirTopSpeed({...vehicle('push'),fuel:0}),336.6);
});
test('Push produces faster real player acceleration, with the same tyre grip and brakes',()=>{
 const race=new Race({track:'velocity',laps:32,fuel:37,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false},{engine:3});
 const results=[];
 for(const mode of ['save','balanced','push']){
  const c={...race.player,...vehicle(mode),upgrades:{engine:3},speed:100,throttleApplied:0},loc=sample(700);
  for(let i=0;i<90;i++){Object.assign(c,{s:700,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,wear:0,wheelWear:[0,0,0,0],fuel:37});race.stepPlayer(c,1/60,{throttle:true});}
  results.push(c.speed);
 }
 assert.ok(results[2]>results[1]+4);assert.ok(results[1]>results[0]+4);
 assert.equal(grip(vehicle('save')),grip(vehicle('push')));assert.equal(brakingDeceleration(vehicle('save')),brakingDeceleration(vehicle('push')));
});
test('resource costs, estimates and temperature-off behaviour agree for identical driving',()=>{
 const values=[];
 for(const mode of ['save','balanced','push']){
  const c=vehicle(mode);resources(c,1,TRACK.length,drivingTyreEffort(c),{throttle:1});
  assert.ok(Math.abs(37-c.fuel-fuelPerLap(mode,c.upgrades))<1e-9);
  values.push(c);assert.ok(estimatedTyreLife('M',{mode})>0);
 }
 assert.ok(values[0].fuel>values[1].fuel && values[1].fuel>values[2].fuel);
 assert.ok(values[0].wear<values[1].wear && values[1].wear<values[2].wear);
 assert.ok(estimatedTyreLife('M',{mode:'save'})>estimatedTyreLife('M',{mode:'balanced'}));
 assert.ok(estimatedTyreLife('M',{mode:'balanced'})>estimatedTyreLife('M',{mode:'push'}));
});
test('dry compounds have the agreed fresh ratios and progressively distinct stint profiles',()=>{
 assert.equal(TYRES.S.grip,1.06);assert.equal(TYRES.M.grip,1);assert.equal(TYRES.H.grip,.98);
 for(const compound of ['S','M','H']){let last=1;for(let wear=0;wear<=1.05;wear+=.01){const g=tyreWearFactor(compound,wear);assert.ok(g<=last+1e-10);assert.ok(last-g<.04);last=g;}}
 assert.ok(tyreWearFactor('H',.7)>tyreWearFactor('M',.7));assert.ok(tyreWearFactor('M',.7)>tyreWearFactor('S',.7));
 assert.ok(TYRES.S.grip*tyreWearFactor('S',.7)<TYRES.M.grip);
 assert.ok(estimatedTyreLife('M')+estimatedTyreLife('H')>=32);
});
test('32-lap planner trades extra stops against pace and respects physical used sets and fuel',()=>{
 const sets=['S','S','M','H'].map((compound,i)=>({id:compound+i,compound,wear:0}));
 const c={...vehicle(),tyreInventory:sets,used:new Set(),upgrades:{},ai:{strategy:{wearLimit:.86,forecastHorizon:60,compoundBias:{}}}};
 const options={sets,tyres:TYRES,remaining:32,water:0,futureWater:0,lapTime:45,starting:true};
 const before=JSON.stringify(sets),cheap=planRaceStrategy(c,{...options,pitLoss:8})[0],expensive=planRaceStrategy(c,{...options,pitLoss:25})[0];
 assert.equal(cheap.stops,2);assert.equal(expensive.stops,1);assert.ok(cheap.plan.some(s=>s.set.compound==='S'));
 for(const p of [cheap,expensive]){
  assert.equal(new Set(p.plan.map(s=>s.set.id)).size,p.plan.length);
  assert.ok(p.plan.every(s=>sets.includes(s.set)));assert.ok(p.plan.reduce((sum,s)=>sum+s.laps*fuelPerLap(s.mode),0)<=c.fuel+.15);
 }
 assert.equal(JSON.stringify(sets),before);
 sets[0].wear=.75;sets[1].wear=.85;
 const worn=planRaceStrategy(c,{...options,pitLoss:8})[0];assert.ok(worn);assert.notEqual(worn.set.compound,'S');
 const lowFuel=planRaceStrategy({...c,fuel:32},{...options,pitLoss:14})[0];assert.ok(lowFuel);assert.ok(lowFuel.plan.some(s=>s.mode==='save'));
});
test('sprints finish legally without changing compound, award 8–1 and use a top-eight points sponsor',()=>{
 const r=new Race({track:'northline',laps:12,fuel:15,tyre:'M',weather:'dry',aiSeed:42}),p=r.player;r.cars=[p];r.countdown=0;r.time=100;
 const s=12*TRACK.length-.1,loc=sample(s);Object.assign(p,{s,completedLaps:11,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:100});
 r.step(1/60,{});assert.ok(r.done);assert.ok(r.result.legal);assert.equal(p.stops,0);assert.equal(r.result.raceFormat,'sprint');
 const career=newCareer({driverName:'Test',teamIndex:2});assert.equal(settleCareer(career,r.result).points,8);
 assert.deepEqual(Array.from({length:10},(_,i)=>racePoints(i+1,'sprint')),[8,7,6,5,4,3,2,1,0,0]);
 assert.equal(sponsorMet('points',{position:9,legal:true,raceFormat:'sprint'}),false);
 p.raceFormat='grandPrix';assert.equal(tyreRuleMet(p),false);p.used.add('H');assert.equal(tyreRuleMet(p),true);
});
test('career weekends use their fixed GP or Sprint distance and saved qualifying migrates without losing its grid or tyres',()=>{
 const c=newCareer({driverName:'Test',teamIndex:2});
 for(let round=1;round<=12;round++){c.round=round;const w=createWeekend(c,{laps:8,fuel:9,tyre:'M',aiSeed:42});assert.equal(w.setup.laps,round===4?12:32);assert.ok(validWeekend(w,c));if(round===4)assert.equal(w.setup.raceFormat,'sprint');}
 const w=createWeekend(c,{tyre:'M',aiSeed:42});w.setup.laps=24;w.setup.fuel=28;delete w.distanceVersion;w.elapsed=80;w.inventories[21][0].wear=.4;
 const inventories=JSON.stringify(w.inventories);migrateWeekend(w);assert.equal(w.setup.laps,32);assert.equal(w.elapsed,80);assert.equal(JSON.stringify(w.inventories),inventories);
 const once=JSON.stringify(w);migrateWeekend(w);assert.equal(JSON.stringify(w),once);assert.deepEqual(QUICK_DISTANCES,[12,16,24,32,40]);
});
test('AI does not replace a worn set with a worse one or stop when its current tyres can finish',()=>{
 const r=new Race({track:'northline',laps:32,fuel:37,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false}),c=r.cars[0];
 r.time=500;r.freezeWeather=true;r.traffic=[c];
 const fitted={id:'I1',compound:'I',wear:.9},spare={id:'I2',compound:'I',wear:.94};
 Object.assign(c,{tyre:'I',wear:.9,trackWetness:.4,tyreInventory:[fitted,spare],tyreSet:fitted,used:new Set(['I']),tyreAge:TRACK.length*10});
 c.ai.strategy.nextReview=0;assert.equal(r.reviewAIStrategy(c,5),false);
 Object.assign(c,{tyre:'H',wear:.85,trackWetness:0,tyreInventory:null,tyreSet:null,used:new Set(['M','H'])});
 c.ai.strategy.nextReview=0;c.ai.strategy.pitRequested=false;assert.equal(r.reviewAIStrategy(c,.9),false);
});

test('directional pace controls move one step and stop at Save and Push',()=>{
 assert.equal(stepPaceMode('push',-1),'balanced');assert.equal(stepPaceMode('balanced',-1),'save');
 assert.equal(stepPaceMode('save',-1),'save');assert.equal(stepPaceMode('save',1),'balanced');
 assert.equal(stepPaceMode('balanced',1),'push');assert.equal(stepPaceMode('push',1),'push');
});
