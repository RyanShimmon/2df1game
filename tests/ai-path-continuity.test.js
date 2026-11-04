import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,AI_LINE,angleDiff,selectTrack,sample} from '../src/core.js';
import {racingPoint} from '../src/racecraft.js';
test.afterEach(()=>selectTrack('northline'));

for(const track of ['dunes','canyon','northline','velocity'])
test(`${track}: a clear lap follows the smooth racing arc without steering reversals or free speed`,()=>{
 const r=new Race({track,laps:8,fuel:6,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false}),c=r.cars[0];
 r.cars=[c];r.traffic=[c];r.time=10;
 c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.driverStyle.line=0;
 c.ai.strategy.plannedMode='balanced';c.ai.mode='cruise';
 let frames=0,maxHeadingError=0,maxHeadingJump=0,maxSpeedError=0,previousError=0,reversals=0;
 // Warm up one lap, then sample every simulation frame. No traffic, random
 // decisions or changing tyre/fuel condition can mask a geometry regression.
 for(let i=0;i<20000 && c.s<TRACK.length*2;i++){
  c.fuel=6;c.wear=0;c.wheelWear=[0,0,0,0];
  const {x,y,s,angle}=c;r.time+=1/60;r.stepAI(c,1/60);
  const reference=racingPoint(AI_LINE,(s+c.s)/2);
  const error=angleDiff(c.motionAngle,reference.angle),yaw=angleDiff(c.angle,angle)*60;
  if(s>TRACK.length){
   frames++;
   maxHeadingError=Math.max(maxHeadingError,Math.abs(error));
   maxHeadingJump=Math.max(maxHeadingJump,Math.abs(error-previousError));
   maxSpeedError=Math.max(maxSpeedError,Math.abs(Math.hypot(c.x-x,c.y-y)*60/c.speed-1));
   if(yaw*reference.curvature<0 && Math.abs(yaw)>.12 && Math.abs(reference.curvature)>.001)reversals++;
   assert.ok(Math.abs(angleDiff(c.motionAngle,c.angle+c.ai.slip))<1e-8,'body and collision direction must follow actual movement');
  }
  previousError=error;
 }
 assert.ok(frames>1000,'measure a complete flying lap');
 assert.ok(maxHeadingError<.002,`path heading error ${maxHeadingError}`);
 assert.ok(maxHeadingJump<.002,`one-frame steering jump ${maxHeadingJump}`);
 assert.equal(reversals,0,'must not countersteer repeatedly on a single-direction racing arc');
 assert.ok(maxSpeedError<.002,`world-space speed disagrees with vehicle speed by ${maxSpeedError}`);
});

for(const [track,start,end,shift] of [['canyon',1200,1350,-18],['velocity',4100,4350,18]])
test(`${track}: an offset racing lane stays smooth through a bend`,()=>{
 const r=new Race({track,laps:8,fuel:10,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false}),c=r.cars[0];
 const arc=racingPoint(AI_LINE,start),loc=sample(start),lateral=shift/Math.cos(angleDiff(arc.angle,loc.angle));
 Object.assign(c,{s:start,offset:arc.offset+shift,x:arc.x-Math.sin(arc.angle)*lateral,
  y:arc.y+Math.cos(arc.angle)*lateral,angle:arc.angle,motionAngle:arc.angle,speed:240,pace:1,sideSpeed:0});
 // Hold an offset request without another driver's changing line masking the
 // geometry: returning or overtaking must be as smooth as the reference arc.
 c.driverStyle.line=shift/.12;c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;
 c.ai.strategy.plannedMode='balanced';r.cars=[c];r.traffic=[c];r.time=10;
 let previousYaw=0,maxYawJump=0,reversals=0,frames=0;
 for(let i=0;i<600 && c.s<end;i++){
  const angle=c.angle;r.time+=1/60;r.stepAI(c,1/60);
  const yaw=angleDiff(c.angle,angle)*60;
  if(i>5){
   frames++;maxYawJump=Math.max(maxYawJump,Math.abs(yaw-previousYaw));
   if(yaw*previousYaw<0 && Math.abs(yaw-previousYaw)>.12)reversals++;
  }
  previousYaw=yaw;
 }
 assert.ok(frames>20);
 assert.equal(reversals,0,'must not alternate steering while holding an offset arc');
 assert.ok(maxYawJump<.15,`steering jerk ${maxYawJump}`);
});
