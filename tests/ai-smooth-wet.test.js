import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,AI_LINE,CIRCUITS,sample,angleDiff,selectTrack,grip} from '../src/core.js';
import {racingPoint} from '../src/racecraft.js';
test.afterEach(()=>selectTrack('northline'));
function run(track,tyre,water,difficulty='normal',attack=false){
 const r=new Race({track,laps:3,fuel:6,tyre,weather:'dry',difficulty,aiSeed:42,tyreTemperatureEnabled:false}),c=r.cars[0],p=sample(0),ref=racingPoint(AI_LINE,0);
 Object.assign(c,{s:0,offset:ref.offset,x:p.x-Math.sin(p.angle)*ref.offset,y:p.y+Math.cos(p.angle)*ref.offset,angle:ref.angle,tyre,pace:1,speed:230,wear:0,upgrades:{}});
 c.driverStyle.line=0;c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.ai.mode=attack?'attack':'cruise';r.cars=[c];r.traffic=[c];
 let lap=0,start=0,times=[],yaw=0,maxJerk=0,slideFrames=0,maxSlip=0;
 for(let i=0;i<60*(30+3*TRACK.length/130)&&times.length<3;i++){
  Object.assign(c,{fuel:6,wear:0,wheelWear:[0,0,0,0],trackWetness:water});const angle=c.angle;r.time+=1/60;r.stepAI(c,1/60);
  const nextYaw=angleDiff(c.angle,angle)*60;if(lap>0)maxJerk=Math.max(maxJerk,Math.abs(nextYaw-yaw)*60);yaw=nextYaw;
  const slip=Math.abs(c.ai.slip);maxSlip=Math.max(maxSlip,slip);if(slip>.025&&slip<.13)slideFrames++;
  if(Math.floor(c.s/TRACK.length)>lap){times.push(r.time-start);start=r.time;lap++;}
 }
 assert.equal(times.length,3);assert.equal(c.trackLimits,0);
 return {time:times.at(-1),maxJerk,slideFrames,maxSlip,car:c};
}
for(const track of CIRCUITS)test(`${track.name}: smooth exits and competitive wet pace`,()=>{
 const dry=run(track.id,'M',0),inter=run(track.id,'I',.45),wet=run(track.id,'W',.9);
 assert.ok(dry.maxJerk<100,`dry heading jerk ${dry.maxJerk}`);
 assert.ok(wet.maxJerk<100,`wet heading jerk ${wet.maxJerk}`);
 assert.ok(wet.time<dry.time*1.28,`wet lap ${wet.time}`);
 assert.ok(inter.time>dry.time*.98&&inter.time<wet.time,'water must still cost pace on the right tyre');
 assert.ok(wet.time>dry.time,'wet pace must respect reduced surface grip');
 const sameCar={...wet.car,player:true};assert.equal(grip(wet.car),grip(sameCar),'no AI-only grip bonus');
});
test('a skilled driver holds controlled wet slides without oscillating or leaving the road',()=>{
 const expert=run('forest','W',.9,'expert',true),normal=run('forest','W',.9),easy=run('forest','W',.9,'easy');
 assert.ok(expert.slideFrames>60,`controlled slide frames ${expert.slideFrames}`);
 assert.ok(expert.maxSlip<=.121);assert.ok(expert.time<normal.time*.97);assert.ok(normal.time<easy.time*.95);
 const wrongTyre=run('forest','S',.9);assert.ok(wrongTyre.time>normal.time*1.25,'slicks retain their wet penalty');
});
