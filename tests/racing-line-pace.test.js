import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,AI_LINE,CIRCUITS,selectTrack} from '../src/core.js';
import {racingPoint} from '../src/racecraft.js';
test.afterEach(()=>selectTrack('northline'));
test('isolated turns use outside-apex-outside, while linked same-direction corners share a continuous arc',()=>{
 selectTrack('forest');
 assert.ok(racingPoint(AI_LINE,2115-350).offset>15);
 assert.ok(racingPoint(AI_LINE,2115).offset<-35);
 assert.ok(racingPoint(AI_LINE,2115+350).offset>30);
 for(let s=3105;s<=3375;s+=20)assert.ok(racingPoint(AI_LINE,s).offset<-25,'do not weave back to the outside between linked lefts');
 assert.ok(AI_LINE.estimatedTime<AI_LINE.baselineTime*.95);
});
for(const circuit of CIRCUITS)test(`${circuit.name}: distinct measured difficulty pace and stable whole-lap tracking`,()=>{
 const times=[];
 for(const difficulty of ['easy','normal','hard','expert']){
  const r=new Race({track:circuit.id,laps:3,fuel:5,tyre:'M',weather:'dry',aiSeed:42,difficulty,tyreTemperatureEnabled:false});
  const c=r.cars[0];r.countdown=0;r.cars=[c];r.player=c;c.tyre='M';c.used=new Set(['M','H']);
  // Equal equipment and no traffic/mistakes isolate driving skill, rather than
  // random strategy, temperature or overtaking luck, in this pace comparison.
  c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;
  let error=0;
  for(let i=0;i<60*220&&!r.done;i++){
   r.step(1/60);if(c.s>TRACK.length*.25&&!c.pit)error=Math.max(error,Math.abs(c.offset-racingPoint(AI_LINE,c.s).offset-c.driverStyle.line*.12));
  }
  assert.ok(c.finished&&!c.dnf);assert.equal(c.trackLimits,0);assert.ok(error<1,`line-tracking error ${error}m`);
  times.push(c.bestLap);
 }
 for(let i=1;i<times.length;i++)assert.ok(times[i]<times[i-1]*.995,`difficulty lap times: ${times.join(', ')}`);
 assert.ok(times[3]<times[0]*.90,'Expert must be measurably faster than Easy on the same car');
});
