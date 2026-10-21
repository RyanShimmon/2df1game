import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,CIRCUITS,TRACK,AI_LINE,sample,selectTrack,aiPitApproach,pitEntranceLocation,PIT_LANE} from '../src/core.js';
import {racingPoint} from '../src/racecraft.js';
test.afterEach(()=>selectTrack('northline'));
for(const circuit of CIRCUITS)test(`${circuit.name}: race and qualifying AI stay on track until the physical pit entrance`,()=>{
 for(const qualifying of [false,true])for(const dt of [1/60,.05]){
  const r=new Race({track:circuit.id,laps:8,fuel:10,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false}),c=r.cars[0];
  const start=TRACK.pitEntry-900,loc=sample(start),offset=qualifying ? AI_LINE.yieldSide*(TRACK.width/2-14) : racingPoint(AI_LINE,start).offset;
  Object.assign(c,{s:start,offset,speed:220,x:loc.x-Math.sin(loc.angle)*offset,y:loc.y+Math.cos(loc.angle)*offset,angle:loc.angle});
  c.ai.strategy.pitRequested=true;c.ai.strategy.choice=r.chooseAITyres(c,5)[0]?.set;
  c.ai.strategy.nextReview=Infinity;c.ai.nextDecision=Infinity;
  r.qualifying=qualifying;c.qState=qualifying ? 'in' : undefined;r.cars=[c];r.traffic=[c];
  assert.equal(aiPitApproach(start),null,'must not send the driver towards the edge 800m early');
  let maxJump=0;
  for(let i=0;i<30/dt&&!c.pit;i++){
   const x=c.x,y=c.y;r.time+=dt;r.stepAI(c,dt);
   if(!c.pit&&c.s<TRACK.pitEntry-10)assert.ok(Math.abs(c.offset)<=TRACK.width/2,`off circuit before entrance: ${c.offset}`);
   maxJump=Math.max(maxJump,Math.hypot(c.x-x,c.y-y));
  }
  assert.ok(c.pit,`missed entrance (${qualifying?'qualifying':'race'}, dt ${dt})`);
  assert.ok(c.s>=TRACK.pitEntry&&c.s<TRACK.pitEntry+10,'capture must occur at the painted entrance');
  assert.ok(pitEntranceLocation(c.x,c.y).separation<PIT_LANE.width/2);
  assert.ok(maxJump<330*dt+1,`movement jump ${maxJump}`);
  const before={x:c.x,y:c.y};r.stepPit(c,dt,{});
  assert.ok(Math.hypot(c.x-before.x,c.y-before.y)<100*dt+1,'handover must preserve physical position');
  assert.equal(c.trackLimits,0);
 }
});
