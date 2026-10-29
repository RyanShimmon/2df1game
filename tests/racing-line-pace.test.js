import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,AI_LINE,CIRCUITS,selectTrack} from '../src/core.js';
import {racingPoint} from '../src/racecraft.js';
test.afterEach(()=>selectTrack('northline'));
test('linked fast same-direction corners hold the inside before opening their exit',()=>{
 selectTrack('forest');
 // The compact opening sweepers lead into a right-hand bend. The fastest
 // approach holds the inside between linked lefts rather than weaving across
 // the road to manufacture a separate outside entry for each apex.
 const end=TRACK.mainStraight.to;
 for(let s=end+150;s<=end+950;s+=20)assert.ok(racingPoint(AI_LINE,s).offset<-5,'hold one side through linked lefts without a needless outside reset');
 assert.ok(racingPoint(AI_LINE,end+1200).offset>racingPoint(AI_LINE,end+650).offset+15,'open the exit after both corners');
 assert.ok(AI_LINE.estimatedTime<AI_LINE.baselineTime*.96);
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
  for(let i=0;i<60*(60+TRACK.length*3/140)&&!r.done;i++){
   r.step(1/60);if(c.s>TRACK.length*.25&&!c.pit)error=Math.max(error,Math.abs(c.offset-racingPoint(AI_LINE,c.s).offset-c.driverStyle.line*.12));
  }
  assert.ok(c.finished&&!c.dnf);assert.equal(c.trackLimits,0);assert.ok(error<1,`line-tracking error ${error}m`);
  times.push(c.bestLap);
 }
 if(circuit.ovalRadius){
  // On the new flat-out oval, skilled drivers reach the same mechanical cap.
  // Extra skill cannot create top speed once the car is already flat out.
  for(let i=1;i<times.length;i++)assert.ok(times[i]<=times[i-1]+.02);
  // Wider banking leaves little lifting even on Easy; keep a measurable
  // skill difference without demanding road-course gaps or extra top speed.
  assert.ok(times[3]<times[0]*.99,`oval difficulty lap times: ${times.join(', ')}`);
 }else{
  for(let i=1;i<times.length;i++)assert.ok(times[i]<times[i-1]*.995,`difficulty lap times: ${times.join(', ')}`);
  assert.ok(times[3]<times[0]*.90,'Expert must be measurably faster than Easy on the same car');
 }
});
