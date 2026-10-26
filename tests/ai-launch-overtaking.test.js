import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,CIRCUITS,TRACK,AI_LINE,sample,angleDiff,selectTrack,passingPerformance,grip,brakingDeceleration,accelerationGrip} from '../src/core.js';
import {racingPoint,planRacingLane,projectedPaceAdvantage,brakingTarget,laneGeometry} from '../src/racecraft.js';
import {THERMAL} from '../src/tyre-temperature.js';
import {cornerAccelerationLimit} from '../src/performance.js';
test.afterEach(()=>selectTrack('northline'));
const setup={laps:12,fuel:18,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false};
for(const {id} of CIRCUITS)test(`${id}: AI launches straight in its own grid lane`,()=>{
 const r=new Race({...setup,track:id});r.countdown=0;r.player.player=false;
 const starts=r.cars.map(c=>({s:c.s,offset:c.offset}));let frames=0;
 for(let i=0;i<180;i++){
  r.step(1/60,{throttle:true});
  for(const c of r.cars.filter(c=>!c.player))if(c.s-starts[c.id].s<120){
   assert.ok(Math.abs(angleDiff(c.angle,sample(c.s).angle))<.02,`car ${c.id} rotated on launch`);
   assert.ok(Math.abs(c.offset-starts[c.id].offset)<.5,`car ${c.id} left its grid lane`);frames++;
  }
 }
 assert.ok(frames>500);assert.ok(r.cars.every(c=>!c.contacts));
});
function pair(track='northline',chaseTyre='S',leadTyre='M',water=0,nearCorner=false){
 const r=new Race({...setup,track}),[lead,chase]=r.cars;r.cars=[lead,chase];r.player=chase;r.countdown=0;r.time=10;
 const style={...lead.driverStyle,pace:.94,line:0,aggression:.7,consistency:1};
 // Longer straights legitimately offer no grip-only advantage at equal speed.
 // Mechanical forecasts are exercised on approach to a grip-limited corner.
 const start=nearCorner ? AI_LINE.points.reduce((a,b)=>Math.abs(a.curvature)>Math.abs(b.curvature)?a:b).s-300 : 0;
 for(const [c,s,tyre] of [[lead,start+80,leadTyre],[chase,start,chaseTyre]]){
  const ref=racingPoint(AI_LINE,s),loc=sample(s);
  Object.assign(c,{s,offset:ref.offset,x:loc.x-Math.sin(loc.angle)*ref.offset,y:loc.y+Math.cos(loc.angle)*ref.offset,angle:ref.angle,motionAngle:ref.angle,speed:230,tyre,trackWetness:water,fuel:18,pace:1,wear:0,wheelWear:[0,0,0,0],upgrades:{},drive:'balanced',used:new Set(['S','M','H'])});
  c.driverStyle={...style};c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.ai.strategy.plannedMode='balanced';
 }
 return {r,lead,chase};
}
function gain(chase,lead){return projectedPaceAdvantage(AI_LINE,chase.s,chase.speed,passingPerformance(chase),passingPerformance(lead));}
test('matched road speeds do not hide a fresh compound advantage from the pass planner',()=>{
 for(const [own,other] of [['S','M'],['M','H']]){
  const {lead,chase}=pair('northline',own,other,0,true);assert.equal(chase.speed,lead.speed);assert.ok(gain(chase,lead)>.8);
  const plan=planRacingLane(chase,AI_LINE,[lead],{time:10,paceAdvantage:()=>gain(chase,lead)});
  assert.equal(plan.phase,'passing');
 }
});
test('predicted advantage respects wear, weather, pace mode and engine/aero development',()=>{
 const {lead,chase}=pair('northline','S','M',0,true);assert.ok(gain(chase,lead)>0);
 chase.wear=.9;chase.wheelWear=Array(4).fill(.9);assert.ok(gain(chase,lead)<0,'worn Soft must lose to fresh Medium');
 const worn=planRacingLane(chase,AI_LINE,[lead],{time:10,paceAdvantage:()=>gain(chase,lead)});assert.equal(worn.phase,'line');
 chase.wear=0;chase.wheelWear=[0,0,0,0];chase.tyre='M';const balanced=gain(chase,lead);
 chase.drive='push';assert.ok(gain(chase,lead)>balanced);chase.drive='save';assert.ok(gain(chase,lead)<balanced);
 chase.drive='balanced';chase.upgrades={engine:3};assert.ok(gain(chase,lead)>balanced);
 chase.tyre='S';chase.trackWetness=.45;lead.tyre='I';lead.trackWetness=.45;assert.ok(gain(chase,lead)<0);
 const oval=pair('sunset','M','M');oval.chase.upgrades.aero=1;oval.lead.upgrades.aero=1;oval.chase.s=3200;oval.lead.s=3280;oval.chase.speed=310;oval.lead.speed=310;const equal=gain(oval.chase,oval.lead);oval.chase.aeroSpec='lowDrag';assert.ok(gain(oval.chase,oval.lead)>equal);
});
for(const [track,own,other] of [['northline','S','M'],['northline','M','H'],['harbour','S','M']])test(`${track}: ${own} completes a clean pass on ${other} from matching speed`,()=>{
 const {r,lead,chase}=pair(track,own,other);let side=0,usedPush=false;
 for(let i=0;i<60*20&&chase.s<=lead.s+55;i++){
  r.step(1/60);usedPush ||= chase.drive==='push';
  if(chase.ai.lane?.phase==='passing'){if(side)assert.equal(chase.ai.lane.side,side);side=chase.ai.lane.side;}
 }
 assert.ok(chase.s>lead.s+55);assert.ok(usedPush);assert.ok(r.cars.every(c=>!c.contacts&&!c.trackLimits));
});
test('a conserving driver can pass a worn tyre without spending fuel on Push',()=>{
 const {r,lead,chase}=pair('northline','M','S');lead.wear=.95;lead.wheelWear=Array(4).fill(.95);chase.ai.strategy.plannedMode='save';
 let attempted=false;
 for(let i=0;i<60*20&&chase.s<=lead.s+55;i++){r.step(1/60);assert.equal(chase.drive,'save');attempted ||= chase.ai.lane?.phase==='passing';}
 assert.ok(attempted);assert.ok(chase.s>lead.s+55);assert.ok(r.cars.every(c=>!c.contacts));
});

test('available grip permits later braking, faster wider arcs and earlier corner-exit power',()=>{
 const line={width:126,length:3000,step:30,points:Array.from({length:100},(_,i)=>({offset:0,angle:0,distanceScale:1,curvature:i>=10&&i<30?-.005:0}))};
 const medium=brakingTarget(line,180,1,240,330),soft=brakingTarget(line,180,1.06,240*1.06,330);
 assert.ok(soft>medium,'higher grip allows a later braking point');
 const inside=brakingTarget(line,450,1.06,240*1.06,330,1,0),outside=brakingTarget(line,450,1.06,240*1.06,330,1,34);
 assert.ok(outside>inside,'a larger radius permits higher actual corner speed');
 assert.ok(laneGeometry(line,450,34).distanceScale>1,'the outside lane still travels further');
 assert.ok(cornerAccelerationLimit(210,.005,1.06)>cornerAccelerationLimit(210,.005,1)*1.5,'Soft has more grip left for acceleration at the same corner speed');
 assert.ok(cornerAccelerationLimit(210,.005,.8)<cornerAccelerationLimit(210,.005,1),'worn tyres lose that exit advantage');
});

// Complete physical battles on equal cars: actual weather, tyre wear and power
// determine the advantage, with no compound-specific overtaking boost.
for(const [own,other,water] of [['S','M',0],['M','H',0],['I','W',.35],['W','I',.85]])
 for(const track of ['northline','harbour'])for(const offsets of [[-18,18],[-24,10],[-10,24]])
 test(`${track}: ${own} finds a clean way past two ${other}s at ${water*100}% water, starting ${offsets.join('/')}`,()=>{
 const r=new Race({...setup,track}),[left,right,chase]=r.cars;
 r.cars=[left,right,chase];r.player=chase;r.countdown=0;r.time=10;
 const style={...left.driverStyle,pace:.94,line:0,aggression:.7,consistency:1};
 for(const [c,s,offset,tyre] of [[left,80,offsets[0],other],[right,80,offsets[1],other],[chase,0,0,own]]){
  const ref=racingPoint(AI_LINE,s),loc=sample(s);
  Object.assign(c,{s,offset,x:loc.x-Math.sin(loc.angle)*offset,y:loc.y+Math.cos(loc.angle)*offset,
   angle:ref.angle,motionAngle:ref.angle,speed:230,tyre,trackWetness:water,fuel:18,pace:1,wear:0,wheelWear:[0,0,0,0],
   upgrades:{},drive:'balanced',used:new Set(['S','M','H'])});
  c.driverStyle={...style};c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.ai.strategy.plannedMode='balanced';
 }
 const resolve=r.collisions.bind(r);
 r.collisions=()=>{
  for(let i=0;i<r.cars.length;i++)for(let j=i+1;j<r.cars.length;j++){
   const a=r.cars[i],b=r.cars[j],dx=b.x-a.x,dy=b.y-a.y;
   const separated=[a.angle,a.angle+Math.PI/2,b.angle,b.angle+Math.PI/2].some(axis=>{
    const extent=c=>18*Math.abs(Math.cos(c.angle-axis))+12*Math.abs(Math.sin(c.angle-axis));
    return Math.abs(dx*Math.cos(axis)+dy*Math.sin(axis))>=extent(a)+extent(b);
   });
   assert.ok(separated,`cars ${a.id}/${b.id} overlapped at ${r.time.toFixed(2)}s`);
  }
  resolve();
 };
 r.weather.points=[[0,water ? .5 : 0],[10000,water ? .5 : 0]];
 // Medium/Hard has a smaller pace gap, so allow a battle to span several laps.
 for(let frame=0;frame<120*60&&chase.s<=Math.max(left.s,right.s)+55;frame++){
  // Hold the test's surface condition; live wear and driving remain enabled.
  r.weather.wetness=water;r.weather.sectors.fill(water);r.step(1/60);
 }
 assert.ok(chase.s>Math.max(left.s,right.s)+55,`${own} remained trapped behind the ${other} pair`);
 assert.ok(r.cars.every(c=>!c.trackLimits));
});

for(const [own,other,water] of [['S','M',0],['M','H',0],['I','W',.35],['W','I',.85],['I','H',.35],['H','M',.18]])
 test(`${own}/${other} at ${water*100}% water: mechanical advantage and pass prediction agree`,()=>{
 const {lead,chase}=pair('northline',own,other,water,true);
 assert.ok(grip(chase)>grip(lead));assert.ok(brakingDeceleration(chase)>brakingDeceleration(lead));
 assert.ok(accelerationGrip(chase)>=accelerationGrip(lead));
 assert.ok(gain(chase,lead)>.8,'the planner must see the usable advantage');
 for(const c of [chase,lead]){
  const player={...c,player:true};
  assert.equal(grip(c),grip(player));assert.equal(brakingDeceleration(c),brakingDeceleration(player));
  assert.equal(accelerationGrip(c),accelerationGrip(player));
 }
 chase.wear=1;chase.wheelWear=Array(4).fill(1);
 assert.ok(gain(chase,lead)<0,'a worn faster compound is not automatically favoured');
 chase.wear=0;chase.wheelWear=[0,0,0,0];
 const {low,high}=THERMAL[own];chase.tyreTemperatureEnabled=true;chase.tyreTemperatures=Array(4).fill((low+high)/2);
 const ideal=gain(chase,lead);chase.tyreTemperatures=Array(4).fill(high+70);
 assert.ok(gain(chase,lead)<ideal,'overheating must reduce predicted advantage');
});

test('pass forecasts use actual rear-axle grip for corner-exit acceleration',()=>{
 const {chase}=pair();Object.assign(chase,{wear:.5,wheelWear:[.1,.1,.9,.9]});
 const profile=passingPerformance(chase);
 assert.equal(profile.rearGrip,grip(chase,'rear'));assert.ok(profile.rearGrip<profile.grip);
 const line={width:126,length:3000,step:30,points:Array.from({length:100},()=>({offset:0,angle:0,distanceScale:1,curvature:.004}))};
 const healthy={grip:1,rearGrip:1,braking:240,acceleration:80,top:330,commitment:1};
 assert.ok(projectedPaceAdvantage(line,0,200,{...healthy,rearGrip:.65},healthy)<-1,
  'average grip must not conceal worn rear tyres during an exit');
});

test('inside-corner following uses real separation rather than centreline progress',()=>{
 const line={width:126,length:3000,step:30,points:Array.from({length:100},()=>({offset:0,angle:0,distanceScale:1,curvature:0}))};
 const car={id:1,s:0,x:0,y:0,angle:0,offset:0,speed:150,ai:{},driverStyle:{aggression:.5}},
  ahead={id:2,s:60,x:30,y:0,angle:0,offset:0,speed:150};
 const plan=planRacingLane(car,line,[ahead],{time:10,allowPass:false});
 assert.ok(plan.followingSpeed<150,'the real 30-unit gap needs braking even though centreline progress differs by 60');
});
test('clearing the first car keeps the attack alive against a second car alongside',()=>{
 const line={width:126,length:3000,step:30,points:Array.from({length:100},()=>({offset:0,angle:0,distanceScale:1,curvature:0}))};
 const car={id:2,s:100,x:100,y:-34,angle:0,offset:-34,speed:220,driverStyle:{aggression:.7},
  ai:{lane:{phase:'passing',targetId:0,side:-1,shift:-34,startedAt:5,progressAt:9,minUntil:7,cooldownUntil:0}}};
 const traffic=[{id:0,s:40,x:40,y:0,angle:0,offset:0,speed:210},{id:1,s:110,x:110,y:0,angle:0,offset:0,speed:215}];
 const plan=planRacingLane(car,line,traffic,{time:10,paceAdvantage:()=>5});
 assert.equal(plan.phase,'passing');assert.equal(plan.targetId,1);assert.equal(plan.side,-1);assert.equal(plan.offset,-34);
});
