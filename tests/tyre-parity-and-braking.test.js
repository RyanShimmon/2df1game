import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,selectTrack,sample,newCareer,brakingDeceleration,maximumSpeed} from '../src/core.js';
import {createWeather} from '../src/weather.js';
import {availableAISets,brakingTarget} from '../src/racecraft.js';
import {WEEKEND_QUOTA} from '../src/tyre-stock.js';
import {createWeekend,migrateWeekend,selectableSets,QualifyingRun,simulateAIQualifying,prepareRace} from '../src/weekend.js';
const profile={driverName:'Test',teamIndex:2},setup={track:'northline',tyre:'S',laps:24,fuel:28,weather:'dry',aiSeed:42,tyreTemperatureEnabled:false};
const weekend=()=>{const w=createWeekend(newCareer(profile),setup);w.weather=createWeather('dry');return w;};
test.afterEach(()=>selectTrack('northline'));
test('all 22 drivers receive identical independent stock and the exact same eligibility rules',()=>{
 const w=weekend(),reference=structuredClone(w.inventories[21]);
 for(const inv of w.inventories){assert.deepEqual(inv,reference);if(inv!==w.inventories[21])assert.notEqual(inv[0],w.inventories[21][0]);}
 const inv=w.inventories[0];inv.find(t=>t.id==='S1').wear=1.03;inv.find(t=>t.id==='S2').wear=1.06;
 for(const phase of ['Q1','Q2','Q3','R']){
  const c={tyreInventory:inv,tyrePhase:phase,tyreSet:inv.find(t=>t.id==='M1')};
  assert.deepEqual(availableAISets(c,true),selectableSets(inv,phase));
  assert.deepEqual(availableAISets(c),selectableSets(inv,phase,'M1'));
 }
 assert.equal(w.inventories[21].find(t=>t.id==='S1').wear,0);
});
test('legacy spare sets cannot leave AI or player with a larger usable compound allowance',()=>{
 const w=weekend();w.allocationVersion=2;delete w.softSetNumbering;
 for(const inv of w.inventories)for(const t of inv)if(t.compound==='S')t.reserved=t.id==='S4';
 for(const inv of w.inventories)for(const t of inv){t.returned=false;t.used=true;t.wear=.1+Number(t.id.slice(1))*.03;t.distance=5000;}
 const selected=w.inventories[21].find(t=>t.id==='S3');w.selectedSetId='S3';const before=w.inventories.map(inv=>inv.map(t=>t.wear));migrateWeekend(w);
 for(const inv of w.inventories){
  for(const [compound,quota] of Object.entries(WEEKEND_QUOTA))assert.equal(inv.filter(t=>!t.returned&&!t.reserved&&t.compound===compound).length,quota);
  assert.equal(inv.filter(t=>!t.returned&&t.reserved).length,1);
 }
 assert.equal(selected.returned,false);assert.equal(w.selectedSetId,selected.id);
 assert.deepEqual(w.inventories.map(inv=>inv.map(t=>t.wear)),before);
});
test('AI tyre care changes decisions rather than granting free wear reduction for identical driving',()=>{
 function driver(care){
  const r=new Race({...setup,track:'velocity'}),c=r.cars[0],loc=sample(900);
  Object.assign(c,{s:900,x:loc.x,y:loc.y,angle:loc.angle,offset:0,speed:200,tyre:'M',wear:.1,wheelWear:Array(4).fill(.1)});
  r.cars=[c];r.traffic=[c];c.driverStyle.tyreCare=care;c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.ai.mode='cruise';
  for(let i=0;i<300;i++){r.time+=1/60;r.stepAI(c,1/60);}
  return {wear:c.wear,wheels:c.wheelWear,s:c.s};
 }
 assert.deepEqual(driver(.65),driver(1));
});
for(const weather of ['dry','wetToDry'])test(`${weather}: skipped qualifying consumes the same real sets and wear as driven AI outings`,()=>{
 const a=weekend();a.active=[0,21];a.weather=createWeather(weather);const b=structuredClone(a);
 simulateAIQualifying(a,{},profile);
 const q=new QualifyingRun(b,null,{},profile,{aiOnly:true,driverIds:[0]}),c=q.cars[0];
 for(let i=0;i<60*600 && c.stops<2 && !q.done;i++)q.step(1/60);
 q.endRun();assert.equal(c.stops,2);
 assert.deepEqual(a.inventories[0],b.inventories[0]);assert.deepEqual(a.results,b.results);
 const used=a.inventories[0].filter(t=>t.used);assert.ok(used.length>0);
 for(const t of used){assert.ok(t.wear>0);assert.ok(t.distance>0);assert.equal(t.wheelWear.length,4);assert.ok(Math.abs(t.wear-t.wheelWear.reduce((s,v)=>s+v)/4)<1e-12);}
});
test('opponent condition survives reload, session changes, race preparation and refitting a used set',()=>{
 const w=weekend();w.active=[0,21];simulateAIQualifying(w,{},profile);
 const saved=JSON.parse(JSON.stringify(w)),before=saved.inventories.map(inv=>inv.map(t=>t.wear));saved.phase='Q2';
 const q2=new QualifyingRun(saved,'S1',{},profile);
 assert.deepEqual(saved.inventories.map(inv=>inv.map(t=>t.wear)),before);
 assert.ok(q2.cars[0].tyreInventory.includes(q2.cars[0].tyreSet));
 saved.phase='R';saved.grid=Array.from({length:22},(_,i)=>i);
 const r=new Race(saved.setup,{},'career',profile);prepareRace(r,saved,'M1');
 for(const c of r.cars){assert.equal(c.tyreInventory,saved.inventories[c.id]);assert.ok(c.tyreInventory.includes(c.tyreSet));assert.equal(c.wear,c.tyreSet.wear);}
 assert.deepEqual(saved.inventories.map(inv=>inv.map(t=>t.wear)),before);
 const ai=r.cars[0],used=ai.tyreInventory.find(t=>!t.returned&&t!==ai.tyreSet);
 Object.assign(used,{wear:.47,wheelWear:[.44,.46,.48,.5],used:true});ai.ai.strategy.choice=used;
 r.enterPit(ai);assert.equal(ai.pit.nextSet,used);ai.pit.stage='service';ai.pit.timer=.01;r.stepPit(ai,.02);
 assert.equal(ai.tyreSet,used);assert.equal(ai.wear,.47);assert.deepEqual(ai.wheelWear,[.44,.46,.48,.5]);
});
test('no AI can invent fresh tyres after exhausting their allocation or gain timed laps after the clock',()=>{
 const w=weekend();for(const t of w.inventories[0])t.wear=1.12;
 const q=new QualifyingRun(w,'S1',{},profile),ai=q.cars[0];
 assert.equal(ai.tyreSet,null);assert.equal(ai.pit,null);assert.equal(q.launch(ai),false);
 q.cars=[ai];for(let i=0;i<100;i++)q.step(.05);assert.equal(ai.qState,'garage');assert.equal(ai.speed,0);
 w.elapsed=q.stage.duration;const before=structuredClone(w.inventories);simulateAIQualifying(w,{},profile);
 assert.deepEqual(w.inventories,before);assert.equal(w.results.some(t=>t.id===0),false);
 w.phase='R';w.grid=Array.from({length:22},(_,i)=>i);
 const r=new Race(w.setup,{},'career',profile);prepareRace(r,w,'M1');assert.equal(r.cars[0].dnf,true);assert.equal(r.cars[0].tyreSet,null);
});
function stop({tyre='M',wear=0,water=0,temp=null,wheels=null,speed=250}={}){
 const r=new Race({...setup,track:'velocity',tyre,tyreTemperatureEnabled:temp===null}),c=r.player,loc=sample(700);
 // A long, flat straight isolates grip-limited stopping from corner/grass drag.
 r.weather=createWeather('dry');r.weather.wetness=water;r.weather.sectors.fill(water);r.weather.rain=water?1:0;
 Object.assign(c,{s:700,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,offset:0,speed,tyre,wear,wheelWear:wheels || Array(4).fill(wear)});
 c.tyreTemperatureEnabled=temp!==null;
 if(temp!==null)c.tyreTemperatures=Array(4).fill(temp);
 let distance=0,time=0;
 for(let i=0;i<60*40&&c.speed>.5;i++){const x=c.x,y=c.y;r.stepPlayer(c,1/60,{brake:true});distance+=Math.hypot(c.x-x,c.y-y);time+=1/60;}
 assert.ok(c.speed<=.5,'failed to stop');return {distance,time};
}
test('actual player stopping distance increases with wear and follows dry compound grip',()=>{
 const soft=stop({tyre:'S'}),medium=stop({tyre:'M'}),hard=stop({tyre:'H'}),worn=stop({tyre:'M',wear:.9});
 assert.ok(soft.distance<medium.distance&&medium.distance<hard.distance);
 assert.ok(worn.distance>medium.distance*1.4);assert.ok(worn.time>medium.time);
});
test('wet braking favours wets, then intermediates, while hard slicks brake better than mediums and softs',()=>{
 const distance={};for(const tyre of ['S','M','H','I','W'])distance[tyre]=stop({tyre,water:1,speed:160}).distance;
 assert.ok(distance.W<distance.I&&distance.I<distance.H);
 assert.ok(distance.H<distance.M&&distance.M<distance.S);
 assert.ok(distance.S>stop({tyre:'S',speed:160}).distance*4);
});
test('front temperatures and individual front wear affect real braking, while disabled heat stays ideal',()=>{
 const ideal=stop({temp:100}),cold=stop({temp:30}),hot=stop({temp:165});
 assert.ok(cold.distance>ideal.distance*1.1);assert.ok(hot.distance>ideal.distance*1.05);
 const wornFront=stop({wear:.5,wheels:[.9,.9,.1,.1]}),wornRear=stop({wear:.5,wheels:[.1,.1,.9,.9]});
 assert.ok(wornFront.distance>wornRear.distance*1.4);
});
test('AI braking on worn slicks in rain cannot exceed the player grip-limited braking force',()=>{
 const r=new Race(setup),c=r.cars[0],loc=sample(1900);r.cars=[c];r.traffic=[c];
 Object.assign(c,{s:1900,x:loc.x,y:loc.y,angle:loc.angle,offset:0,speed:240,tyre:'S',wear:.9,wheelWear:Array(4).fill(.9),trackWetness:1});
 c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;
 const braking=brakingDeceleration(c),old=c.speed;r.stepAI(c,.01);
 assert.ok(braking<30);assert.ok(old-c.speed>0);assert.ok(old-c.speed<=braking*.01+1e-5,`${old-c.speed} exceeds ${braking*.01}`);
});
test('low-grip AI anticipates braking more than 650 units ahead rather than receiving extra grip',()=>{
 const line={length:6000,step:30,points:Array.from({length:200},(_,i)=>({offset:0,angle:0,distanceScale:1,curvature:i>=60&&i<=64?.02:0}))};
 const dry=brakingTarget(line,200,1,200,330),wet=brakingTarget(line,200,.08,20,330);
 assert.equal(dry,330);assert.ok(wet<300);
});

test('AI holding top speed still loads and heats its rear tyres rather than receiving free cooling',()=>{
 const r=new Race({...setup,track:'velocity',tyreTemperatureEnabled:true}),c=r.cars[0],loc=sample(700);
 Object.assign(c,{s:700,x:loc.x,y:loc.y,angle:loc.angle,offset:0,tyre:'M',wear:0,wheelWear:[0,0,0,0],tyreTemperatures:[100,100,100,100]});
 c.driverStyle.line=0;c.ai.mode='attack';c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.drive='push';c.speed=maximumSpeed(c);
 r.cars=[c];r.traffic=[c];
 for(let i=0;i<240;i++){r.time+=1/60;r.stepAI(c,1/60);}
 assert.ok(c.tyreTemperatures[2]>c.tyreTemperatures[0]+1,'sustaining speed must require throttle load');
});

test('stock-exhausted opponents cannot hold the player in qualifying after the session clock expires',()=>{
 const w=weekend();for(const inv of w.inventories.slice(0,21))for(const t of inv)t.wear=1.12;
 const q=new QualifyingRun(w,'S1',{},profile);
 assert.equal(q.canEndSession(),false);assert.match(q.sessionAction(),/Waiting/);
 w.elapsed=q.stage.duration;
 assert.equal(q.canEndSession(),true);assert.match(q.sessionAction(),/^End qualifying in P/);
});
