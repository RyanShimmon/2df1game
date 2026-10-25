import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,AI_LINE,selectTrack,sample,angleDiff} from '../src/core.js';
import {planRacingLane,racingPoint,qualifyingLane} from '../src/racecraft.js';
const line={width:126,length:5000,step:50,points:Array.from({length:100},()=>({offset:0,angle:0,curvature:0,distanceScale:1}))};
const driver=()=>({id:0,s:500,speed:260,offset:0,driverStyle:{aggression:.7,line:0},ai:{lineVelocity:0}});
const opponent=(id,s,offset=0,speed=230)=>({id,s,offset,speed});
test.afterEach(()=>selectTrack('northline'));
test('an unopposed driver holds one reference line at every point in time',()=>{
 const c=driver();
 for(let time=0;time<60;time+=.2){const plan=planRacingLane(c,line,[],{time});assert.equal(plan.offset,0);assert.equal(plan.phase,'line');}
});
test('a pass commits to its target and side even as that car crosses the track centre',()=>{
 const c=driver(),lead=opponent(1,580);
 const initial=planRacingLane(c,line,[lead],{time:0});assert.equal(initial.phase,'passing');
 for(let i=1;i<=180;i++){
  lead.offset=Math.sin(i*.1)*12;
  const closer=opponent(2,560,-initial.side*40);
  const plan=planRacingLane(c,line,i%2?[lead,closer]:[closer,lead],{time:i/60});
  assert.equal(plan.side,initial.side);assert.equal(plan.targetId,lead.id);assert.equal(plan.phase,'passing');
 }
});
test('both occupied passing lanes make the driver follow and slow down instead of switching sides',()=>{
 const c=driver(),lead=opponent(1,580),left=opponent(2,480,-34),right=opponent(3,490,34);
 for(let i=0;i<30;i++){
  const plan=planRacingLane(c,line,i%2?[lead,left,right]:[right,lead,left],{time:i*.2});
  assert.equal(plan.phase,'line');assert.equal(plan.offset,0);assert.ok(plan.followingSpeed<c.speed);
 }
});
test('side-by-side space is independent of traffic iteration order and does not alternate the steering target',()=>{
 const right=opponent(1,505,22,250),left=opponent(2,508,-55,250);
 const c=driver();c.offset=-22;
 const first=planRacingLane(c,line,[right,left],{time:0,allowPass:false});
 c.offset=first.offset;
 for(let i=0;i<100;i++){
  const plan=planRacingLane(c,line,i%2?[right,left]:[left,right],{time:i/60,allowPass:false});
  assert.equal(plan.offset,first.offset);assert.ok(right.offset-plan.offset>=30);assert.ok(plan.offset-left.offset>=30);
 }
});
test('completing a pass waits for space before merging and leaves a cooldown before another attempt',()=>{
 const c=driver(),lead=opponent(1,580),initial=planRacingLane(c,line,[lead],{time:0});
 c.offset=initial.side*34;lead.s=435;
 const beside=opponent(2,500,0,260),returning=planRacingLane(c,line,[lead,beside],{time:2});
 assert.equal(returning.phase,'return');assert.ok(Math.abs(returning.offset)>=30);
 beside.s=400;
 const clear=planRacingLane(c,line,[lead,beside],{time:2.1});assert.equal(clear.offset,0);
 c.offset=0;
 const next=opponent(3,580),cooldown=planRacingLane(c,line,[next],{time:3});assert.equal(cooldown.phase,'line');
 assert.equal(planRacingLane(c,line,[next],{time:5}).phase,'passing');
});
test('slower cars and corner braking do not trigger speculative lane changes',()=>{
 const c=driver(),lead=opponent(1,580,0,265);
 assert.equal(planRacingLane(c,line,[lead],{time:0}).phase,'line');
 const bend={...line,points:line.points.map(point=>({...point,curvature:.008}))};lead.speed=230;
 assert.equal(planRacingLane(c,bend,[lead],{time:1}).phase,'line');
});
test('the full steering controller follows a clear straight without artificial oscillation',()=>{
 const r=new Race({track:'velocity',laps:8,fuel:10,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false}),c=r.cars[0];
 const at=sample(650),offset=racingPoint(AI_LINE,650).offset;
 Object.assign(c,{s:650,x:at.x-Math.sin(at.angle)*offset,y:at.y+Math.cos(at.angle)*offset,angle:at.angle,offset,speed:250});
 c.driverStyle.line=0;c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;r.cars=[c];r.traffic=[c];
 let straightFrames=0,maxError=0,maxHeadingError=0;
 for(let i=0;i<180;i++){
  r.time+=1/60;r.stepAI(c,1/60);const reference=racingPoint(AI_LINE,c.s);
  if(Math.abs(reference.curvature)<.0006){straightFrames++;maxError=Math.max(maxError,Math.abs(c.offset-reference.offset));maxHeadingError=Math.max(maxHeadingError,Math.abs(angleDiff(c.angle,reference.angle)));}
 }
 assert.ok(straightFrames>90);assert.ok(maxError<2,`straight line error ${maxError}`);assert.ok(maxHeadingError<.035,`heading error ${maxHeadingError}`);
});

test('qualifying courtesy chooses one edge for an approaching timed car rather than following its changing apex side',()=>{
 const courtesyLine={...line,finalCornerStart:4600,points:line.points.map(point=>({...point,offset:-20}))};
 const c=driver();Object.assign(c,{s:2000,speed:180,qState:'out'});c.ai.yieldSide=-1;
 const fast={...opponent(1,1400,0,300),qState:'timed'};
 const initial=qualifyingLane(c,courtesyLine,[fast]);assert.equal(initial.offset,49);
 for(let i=0;i<20;i++){for(const point of courtesyLine.points)point.offset=i%2?20:-20;assert.equal(qualifyingLane(c,courtesyLine,[fast]).offset,initial.offset);}
});

test('a free corridor outside two cars is considered even when both fixed passing lanes are blocked',()=>{
 const c=driver(),left=opponent(1,580,-24),right=opponent(2,580,10);
 const plan=planRacingLane(c,line,[left,right],{time:0,paceAdvantage:()=>8});
 assert.equal(plan.phase,'passing');assert.equal(plan.side,1);
 assert.ok(plan.offset>=44 && plan.offset<=45);
 assert.ok(plan.offset-right.offset>=34);
});
test('a stalled outside attempt drops back in its own lane before returning',()=>{
 const c=driver(),lead=opponent(1,580);
 const first=planRacingLane(c,line,[lead],{time:0});
 c.offset=first.offset;lead.s=510;
 planRacingLane(c,line,[lead],{time:1});
 const stalled=planRacingLane(c,line,[lead],{time:12});
 assert.equal(stalled.phase,'passing');assert.equal(stalled.side,first.side);
 assert.ok(stalled.followingSpeed<lead.speed);
 lead.s=570;
 assert.equal(planRacingLane(c,line,[lead],{time:13}).phase,'return');
});
