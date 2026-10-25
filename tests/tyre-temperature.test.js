import test from 'node:test';
import assert from 'node:assert/strict';
import {THERMAL,prepareTyres,updateTyreTemperatures,thermalGrip,thermalWear,coolStoredSets,temperatureColour,thermalFactor} from '../src/tyre-temperature.js';
import {Race,grip,accelerationGrip,resources,TRACK,sample,targetSpeed,clamp,angleDiff} from '../src/core.js';
import {createWeekend,fitSet,QualifyingRun} from '../src/weekend.js';
import {newCareer} from '../src/core.js';
const car=(tyre='M',temp=90)=>({tyre,wear:0,speed:180,trackWetness:0,tyreTemperatures:Array(4).fill(temp),fuel:20,tyreAge:600,offset:0,used:new Set()});
const run=(c,seconds,load)=>{for(let i=0;i<seconds*60;i++)updateTyreTemperatures(c,1/60,load);return c;};
const mean=a=>a.reduce((a,b)=>a+b)/a.length;
test('braking heats fronts, accelerating heats rears, and sustained corners load the outside pair',()=>{
 const braking=run(car(),16,{brake:1}),accelerating=run(car(),16,{throttle:1,wheelspin:.7});
 assert.ok(braking.tyreTemperatures[0]>braking.tyreTemperatures[2]+10);
 assert.ok(accelerating.tyreTemperatures[2]>accelerating.tyreTemperatures[0]+10);
 const right=run(car(),16,{corner:1}),left=run(car(),16,{corner:-1});
 assert.ok(right.tyreTemperatures[0]>right.tyreTemperatures[1]);
 assert.ok(left.tyreTemperatures[1]>left.tyreTemperatures[0]);
 const straight=run(car(),16,{});assert.ok(mean(right.tyreTemperatures)>mean(straight.tyreTemperatures));
});
test('heat falls on straights and rain cools faster; tyres can become cold again',()=>{
 const dry=run(car('M',135),20,{}),wet=car('M',135);wet.trackWetness=1;run(wet,20,{});
 assert.ok(mean(dry.tyreTemperatures)<135);assert.ok(mean(wet.tyreTemperatures)<mean(dry.tyreTemperatures)-15);
 dry.speed=0;run(dry,90,{});assert.ok(mean(dry.tyreTemperatures)<THERMAL.M.low-12);
});
test('cold fronts affect steering and braking while hot rears reduce acceleration grip independently',()=>{
 const normal=car();normal.upgrades={};const front={...normal,tyreTemperatures:[35,35,95,95]},rear={...normal,tyreTemperatures:[95,95,145,145]};
 assert.ok(grip(front,'front')<grip(normal,'front'));assert.equal(grip(front,'rear'),grip(normal,'rear'));
 assert.ok(accelerationGrip(rear)<accelerationGrip(normal));assert.equal(grip(rear,'front'),grip(normal,'front'));
});
test('wet and intermediate overheat faster on dry asphalt and retain their suitability gap',()=>{
 const results={};for(const tyre of ['S','M','H','I','W']){
  const dry=run(car(tyre,THERMAL[tyre].low),35,{throttle:.8,corner:.5});
  const wet=car(tyre,THERMAL[tyre].low);wet.trackWetness=tyre==='I' ? .4 : .85;run(wet,35,{throttle:.8,corner:.5});
  results[tyre]=dry;
  if(['I','W'].includes(tyre)){assert.ok(mean(dry.tyreTemperatures)>mean(wet.tyreTemperatures)+20);assert.ok(thermalWear(dry)>thermalWear(wet));}
 }
 resources(results.W,1/60,100);resources(results.I,1/60,100);assert.ok(results.W.wear>results.I.wear);
 assert.ok(grip(car('H'))>grip(car('I')));assert.ok(grip(car('I'))>grip(car('W')));
 const slick=car('S');slick.trackWetness=1;const wets=car('W',65);wets.trackWetness=1;assert.ok(grip(wets)>grip(slick)*3);
});
test('overheating increases permanent wear, with individual wheel load distribution and finite recoverable grip',()=>{
 const cool=car(),hot=car('M',150);for(const c of [cool,hot])resources(c,1/60,100,1,{brake:1,corner:1});
 assert.ok(hot.wear>cool.wear*1.5);assert.ok(hot.wheelWear[0]>hot.wheelWear[3]);
 assert.ok(thermalGrip(hot)>=.8);run(hot,30,{});assert.ok(thermalGrip(hot)>.8);
 const uneven=car();uneven.tyreTemperatures=[150,95,95,95];resources(uneven,1/60,100);assert.ok(uneven.wheelWear[0]>uneven.wheelWear[1]*1.5);
});
test('sets retain wear and heat in service, removed sets cool, fitting preheats and old saves initialise safely',()=>{
 const c=car('S',110),set={compound:'S',wear:.22,distance:100,temperatures:[110,112,114,116],wheelWear:[.20,.22,.22,.24]};
 fitSet(c,set);assert.equal(c.wear,.22);assert.deepEqual(c.tyreTemperatures,set.temperatures);
 const other={compound:'M',wear:.1,distance:0};c.tyreInventory=[set,other];fitSet(c,other);coolStoredSets(c,40);
 assert.ok(set.temperatures[0]<70);assert.equal(set.wear,.22);fitSet(c,set);
 assert.ok(c.tyreTemperatures.every(t=>t>=THERMAL.S.low-9));assert.equal(c.wear,.22);
 const old=car();delete old.tyreTemperatures;updateTyreTemperatures(old,1/60);assert.equal(old.tyreTemperatures.length,4);
 assert.ok(old.tyreTemperatures.every(Number.isFinite));
});
test('same-set qualifying service holds temperature, new quick-race tyres are prepared and grid starts warm',()=>{
 const r=new Race({laps:8,fuel:10,tyre:'M',weather:'dry'}),p=r.player;assert.ok(p.tyreTemperatures.every(t=>t>=THERMAL.M.low));
 p.tyreTemperatures=[140,140,145,145];r.nextTyre='S';r.enterPit(p);p.pit.stage='service';p.pit.timer=0;r.stepPit(p,1/60,{});
 assert.equal(p.tyre,'S');assert.ok(p.tyreTemperatures.every(t=>Math.abs(t-(THERMAL.S.low-9))<1));
 const w=createWeekend(newCareer(),{laps:8,fuel:10,tyre:'S',weather:'dry'}),q=new QualifyingRun(w,'S1',{},{}),c=q.player;
 c.tyreTemperatures=[95,96,97,98];q.nextSetId='S1';c.garage=false;c.pit=null;q.enterPit(c);c.pit.stage='service';c.pit.timer=0;q.stepPit(c,1/60,{});
 assert.ok(c.tyreTemperatures[0]>94);assert.equal(c.tyreSet.id,'S1');
});
test('pace modes heat tyres through delivered power, while coasting creates no mode-specific heat',()=>{
 const a=car(),b=car();a.drive='save';b.drive='push';run(a,5,{throttle:0});run(b,5,{throttle:0});assert.deepEqual(a.tyreTemperatures,b.tyreTemperatures);
 run(a,5,{throttle:1});run(b,5,{throttle:1});assert.ok(b.tyreTemperatures[2]>a.tyreTemperatures[2]);
 assert.equal(temperatureColour('M',0),'rgb(126,201,255)');assert.equal(temperatureColour('M',170),'rgb(244,71,80)');
});
test('AI eases off with overheated tyres and maintains independent wheel temperatures',()=>{
 const r=new Race({laps:8,fuel:12,tyre:'M',weather:'dry',aiSeed:17}),c=r.cars[0];c.tyreTemperatures=Array(4).fill(145);c.ai.nextDecision=100;r.stepAI(c,1/60);
 assert.equal(c.drive,'save');assert.ok(new Set(c.tyreTemperatures).size>1);
});

test('Softs stay competitive across two controlled dry push laps without early thermal grip loss',()=>{
 const r=new Race({laps:8,fuel:12,tyre:'S',weather:'dry',aiSeed:17});r.countdown=0;r.cars=[r.player];const p=r.player;p.drive='push';let peak=0;
 for(let i=0;i<60*100 && p.s<2*TRACK.length;i++){
  const goal=sample(p.s+clamp(p.speed*.55,35,100));
  const steer=clamp(angleDiff(Math.atan2(goal.y-p.y,goal.x-p.x),p.angle)*3.5,-1,1),target=targetSpeed(p)*.94;
  r.step(1/60,{steer,throttle:p.speed<target,brake:p.speed>target+3});peak=Math.max(peak,...p.tyreTemperatures);
 }
 assert.ok(p.s>=2*TRACK.length,'complete both laps');
 assert.ok(peak<THERMAL.S.high+8,`peak ${peak}`);assert.ok(thermalGrip(p)>.985);
 assert.ok(p.wear<.30,`two-lap wear ${p.wear}`);
});
test('mild excess temperature has a gentle penalty while sustained sliding still overheats and can recover',()=>{
 assert.ok(thermalFactor('S',THERMAL.S.high+10)>.98);
 const c=car('S',90);c.speed=220;c.sliding=1;
 run(c,90,{throttle:1,wheelspin:1,corner:1.3});
 assert.ok(c.tyreTemperatures.some(t=>t>THERMAL.S.high+18));assert.ok(thermalGrip(c)<.95);
 const hot=mean(c.tyreTemperatures);c.sliding=0;run(c,25,{});
 assert.ok(mean(c.tyreTemperatures)<hot-15);assert.ok(thermalGrip(c)>.98);
});
