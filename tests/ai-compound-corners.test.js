import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,AI_LINE,sample,grip,brakingDeceleration,passingPerformance} from '../src/core.js';
import {racingPoint,brakingTarget} from '../src/racecraft.js';
import {cornerAccelerationLimit,corneringSpeed} from '../src/performance.js';

const setup={track:'velocity',laps:32,fuel:37,tyre:'M',weather:'dry',difficulty:'normal',aiSeed:42,tyreTemperatureEnabled:false};
test('braking lookahead cannot skip a tight corner between the old 30-unit samples',()=>{
 const line={width:126,length:3000,step:10,points:Array.from({length:300},(_,i)=>({offset:0,angle:0,distanceScale:1,curvature:i===40?.01:0}))};
 for(let s=220;s<=250;s+=1){
  const expected=Math.sqrt(150**2+2*240*(400-s-18));
  assert.ok(brakingTarget(line,s,1,240,330)<=expected+.01,`missed the apex from ${s}`);
 }
});
test('holding the corner target retains throttle readiness for the exit',()=>{
 const r=new Race(setup),c=r.cars[0],p=sample(-1000);
 Object.assign(c,{s:-1000,x:p.x,y:p.y,offset:0,angle:p.angle,tyre:'M',speed:0,throttleApplied:1});
 c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.ai.strategy.plannedMode='balanced';
 r.cars=[c];r.traffic=[c];
 // A speed ceiling reached with power applied should not alternate between
 // zero and full pedal on successive frames.
 c.speed=passingPerformance(c).top;c.throttleApplied=1;
 r.stepAI(c,1/60);
 assert.equal(c.throttleApplied,1);
});
for(const [better,worse,water] of [['S','M',0],['M','H',0],['I','W',.35],['W','I',.85]])
test(`${better}/${worse} at ${water*100}% water: same-condition corner, braking and exit limits agree`,()=>{
 const r=new Race(setup),c=r.cars[0];Object.assign(c,{s:1900,speed:180,fuel:6,wear:0,wheelWear:[0,0,0,0],trackWetness:water,upgrades:{}});
 const limits=tyre=>{c.tyre=tyre;const g=grip(c);return {corner:corneringSpeed(g,.005,330),brake:brakingDeceleration(c),exit:cornerAccelerationLimit(150,.005,grip(c,'rear'))};};
 const a=limits(better),b=limits(worse);for(const key of Object.keys(a))assert.ok(a[key]>b[key],key);
 c.tyre=better;c.wear=.98;c.wheelWear=Array(4).fill(.98);
 assert.ok(brakingDeceleration(c)<b.brake,'condition must still override the compound name');
});
function velocityLap(tyre){
 const r=new Race(setup),c=r.cars[0],p=sample(0),line=racingPoint(AI_LINE,0);
 Object.assign(c,{s:0,offset:line.offset,x:p.x-Math.sin(p.angle)*line.offset,y:p.y+Math.cos(p.angle)*line.offset,
  angle:line.angle,tyre,pace:1,speed:230,upgrades:{}});
 c.ai.strategy.plannedMode='balanced';c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.driverStyle.line=0;
 r.cars=[c];r.traffic=[c];const speeds=[];let mark=TRACK.length,start=0;
 for(let frame=0;frame<60*150&&c.s<TRACK.length*2;frame++){
  Object.assign(c,{fuel:37,wear:0,wheelWear:[0,0,0,0]});const previous={s:c.s,v:c.speed};
  r.time+=1/60;r.stepAI(c,1/60);
  if(!start&&c.s>=TRACK.length)start=r.time;
  while(mark<=c.s){const t=(mark-previous.s)/(c.s-previous.s);speeds.push({s:mark-TRACK.length,v:previous.v+(c.speed-previous.v)*t});mark+=10;}
 }
 assert.ok(c.s>=2*TRACK.length);return {seconds:r.time-start,speeds};
}
test('Velocity actual AI laps retain the compound order through all three corner complexes',()=>{
 const runs=Object.fromEntries(['S','M','H'].map(tyre=>[tyre,velocityLap(tyre)]));
 for(const [fast,slow] of [['S','M'],['M','H']]){
  assert.ok(runs[fast].seconds<runs[slow].seconds);
  for(const [from,to] of [[1800,2300],[4200,4600],[6700,7100]]){
   const mean=tyre=>{const points=runs[tyre].speeds.filter(p=>p.s>=from&&p.s<=to);return points.reduce((sum,p)=>sum+p.v,0)/points.length;};
   assert.ok(mean(fast)>mean(slow),`${fast}/${slow} reversed through ${from}–${to}`);
  }
 }
});
