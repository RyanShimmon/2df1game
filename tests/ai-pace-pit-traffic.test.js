import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,sample,raceProgress} from '../src/core.js';

function create(laps=16){
 const r=new Race({track:'northline',laps,fuel:laps*1.2,tyre:'M',weather:'dry',aiSeed:17});
 r.countdown=0;return r;
}
function place(c,s,offset,speed){
 const p=sample(s);
 Object.assign(c,{s,offset,speed,x:p.x-offset*Math.sin(p.angle),y:p.y+offset*Math.cos(p.angle),angle:p.angle,motionAngle:p.angle});
}
function request(c){
 Object.assign(c.ai.strategy,{pitRequested:true,nextReview:Infinity,choice:{compound:'H',wear:0}});
 c.ai.nextDecision=Infinity;
}

test('Northline dry Quick Race: 21 fresh sets race past their first pit entrance',()=>{
 const r=create();let reached=0;
 const cleared=new Set();
 for(let frame=0;frame<2400;frame++){
  r.step(.05);reached=0;
  for(const c of r.cars.filter(c=>!c.player)){
   if(cleared.has(c.id)){reached++;continue;}
   assert.ok(!c.ai.strategy.pitRequested && !c.pit && !c.stops,`car ${c.id} called in on ${c.tyre}: ${c.ai.strategy.reason}`);
   if(raceProgress(c)>TRACK.pitEntry+80){cleared.add(c.id);reached++;}
  }
  if(reached===21)break;
 }
 assert.equal(reached,21);
});

test('an attacking driver holds the chosen map through brief passing and fuel-threshold changes, then conserves',()=>{
 const r=create(),c=r.cars[0];r.cars=[c];r.traffic=[];r.time=15;
 c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.ai.strategy.plannedMode='balanced';
 c.tyreTemperatureEnabled=false;place(c,300,0,180);const maps=[];
 for(let i=0;i<400;i++){
  r.time+=.05;const remaining=r.laps-raceProgress(c)/TRACK.length;
  c.ai.lane ??= {};c.ai.lane.phase=i%2===0?'passing':'line';
  c.fuel=remaining*1.1+(i===0?.9:i<80?(i%2?.14:.17):-.2);
  r.stepAI(c,.05);if(maps.at(-1)?.mode!==c.drive)maps.push({mode:c.drive,time:r.time});
 }
 assert.deepEqual(maps.map(m=>m.mode),['push','save']);
 assert.ok(maps[1].time-maps[0].time>=8);
});

test('two pairs can queue for the same pit entrance without hitting each other or missing service',()=>{
 for(const dt of [1/60,.05]){
  const r=create();r.time=150;r.cars=[r.cars[0],r.cars[2],r.cars[4],r.cars[6]];
  for(const [i,c] of r.cars.entries()){
   place(c,TRACK.pitEntry-700-Math.floor(i/2)*73,i%2?-23:25,215);request(c);
  }
  const entered=[];
  for(let i=0;i<40/dt && r.cars.some(c=>!c.stops);i++){
   r.step(dt);
   for(const c of r.cars)if(c.pit&&!entered.includes(c.id))entered.push(c.id);
   const mouth=r.cars.filter(c=>c.pit && c.pit.distance<175);
   for(const a of mouth)for(const b of mouth)if(a!==b)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>38);
  }
  assert.deepEqual(entered,[0,2,4,6]);assert.ok(r.cars.every(c=>c.stops===1 && c.contacts===0));
 }
});

test('a driver who misses the marked entrance rejoins at race speed and targets the next lap',()=>{
 const r=create(),c=r.cars[0];r.cars=[c];r.time=120;
 place(c,TRACK.pitEntry+60,15,80);request(c);c.ai.pitEntryS=TRACK.pitEntry;
 for(let i=0;i<90;i++)r.step(.05);
 assert.equal(c.pit,null);assert.equal(c.stops,0);
 assert.ok(c.ai.pitEntryS>=TRACK.pitEntry+TRACK.length-.01);
 assert.ok(c.speed>150,`remained limited after missing entry: ${c.speed}`);
 assert.ok(Math.abs(c.offset)<TRACK.width/2);
});

test('a timed qualifying lap uses Push from the crossing even with hot tyres and a pending pace hold',async()=>{
 const {QualifyingRun}=await import('../src/weekend.js');
 const r=create(),c=r.cars[0];
 r.qualifying=true;r.stageStart=0;r.stage={duration:120};r.cars=[c];r.traffic=[];
 Object.assign(c,{drive:'save',qState:'out',fuel:1.5,tyreTemperatures:[150,150,150,150]});
 c.ai.paceHoldUntil=100;c.ai.cooling=true;
 QualifyingRun.prototype.crossLine.call(r,c,1,0);
 assert.equal(c.drive,'push');
 for(let i=0;i<400;i++){
   r.time+=.05;c.tyreTemperatures.fill(150);r.stepAI(c,.05);
   assert.equal(c.drive,'push');
 }
});

test('race Push continues past its review interval while the stint plan calls for it',()=>{
 const r=create(),c=r.cars[0];r.cars=[c];r.traffic=[];
 c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.ai.strategy.plannedMode='push';
 c.tyreTemperatureEnabled=false;c.fuel=25;
 for(let i=0;i<900;i++){r.time+=.05;r.stepAI(c,.05);assert.equal(c.drive,'push');}
 c.ai.strategy.plannedMode='balanced';r.stepAI(c,.05);assert.equal(c.drive,'balanced');
});
