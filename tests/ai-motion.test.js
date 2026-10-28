import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,AI_LINE,sample,angleDiff,selectTrack} from '../src/core.js';
import {planRacingLane} from '../src/racecraft.js';
test.afterEach(()=>selectTrack('northline'));

for(const [track,water,own,other] of [['northline',0,'S','M'],['harbour',0,'M','H'],['crossover',.8,'W','I']])
test(`${track}: constrained AI faces its actual travel direction, with only deliberate tyre slip`,()=>{
 const r=new Race({track,laps:12,fuel:18,tyre:own,weather:'dry',aiSeed:42,tyreTemperatureEnabled:false});
 r.cars=r.cars.slice(0,3);r.player=r.cars[2];r.countdown=0;r.time=10;
 for(const [i,c] of r.cars.entries()){
  const s=i===2?0:80,offset=[-24,10,0][i],p=sample(s);
  Object.assign(c,{s,offset,x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset,
   angle:p.angle,motionAngle:p.angle,speed:230,tyre:i===2?own:other,pace:1,upgrades:{}});
  c.driverStyle={...r.cars[0].driverStyle,line:0,pace:.94,aggression:.7,consistency:1};
  c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.ai.strategy.plannedMode='balanced';
 }
 let frames=0,turning=0,passing=0;
 const step=r.stepAI.bind(r);
 r.stepAI=(c,dt)=>{
  const {x,y,angle,offset,speed}=c;step(c,dt);if(c.pit||c.speed<30)return;
  const dx=c.x-x,dy=c.y-y,motion=Math.atan2(dy,dx);
  assert.ok(Math.abs(angleDiff(motion,c.angle+c.ai.slip))<.01,'body crabs across its actual path');
  assert.ok(Math.abs(angleDiff(motion,c.motionAngle))<.01,'collision/drafting velocity disagrees with travel');
  // Measure the lateral change directly. Comparing total world displacement
  // with centreline progress also measures the curved-road approximation,
  // which is not a lane teleport (especially on the inside of Harbour).
  assert.ok(Math.abs(c.offset-offset)<=Math.max(speed,c.speed)*dt+.02,'no lateral teleport to a new lane');
  if(Math.abs(angleDiff(c.angle,angle))>.001)turning++;
  if(c.ai.lane.phase==='passing')passing++;frames++;
 };
 for(let i=0;i<60*35;i++){
  r.weather.wetness=water;r.weather.sectors.fill(water);r.step(1/60);
 }
 assert.ok(frames>4000&&turning>100&&passing>50,'exercise corners and occupied passing lanes');
});

test('aborted side-by-side passes let one car continue rather than mutually stopping',()=>{
 const line={width:126,length:3000,step:30,points:Array.from({length:100},()=>({offset:0,angle:0,distanceScale:1,curvature:0}))};
 for(const gap of [0,22]){
  const cars=[0,1].map(id=>({id,s:id===0?100+gap:100,x:id===0?100+gap:100,y:id?18:-18,angle:0,
   offset:id?18:-18,speed:100,driverStyle:{aggression:.7},ai:{lane:{phase:'passing',targetId:1-id,side:id?1:-1,
    shift:id?34:-34,aborting:true,startedAt:0,progressAt:0,bestGap:-100,minUntil:1,cooldownUntil:0}}}));
  const plans=cars.map(c=>planRacingLane(c,line,cars,{time:20,allowPass:false}));
  assert.equal(plans[0].followingSpeed,Infinity,'leading car holds its lane and moves forward');
  assert.equal(plans[1].followingSpeed,88,'trailing car yields until safely behind');
 }
});
