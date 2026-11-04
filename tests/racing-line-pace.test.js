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
test('Dunes joins the opening loop entry and exit into fast, legal arcs',()=>{
 selectTrack('dunes');
 // The small changes of direction joining the parallel straights to the loop
 // must not become separate slow corners. These are conservative mechanical
 // speed ceilings for a neutral-grip car, before driver/tyre/weather factors.
 for(const [name,from,to,minSpeed] of [['entry',400,1000,290],['exit',2400,3000,290]]){
  let peak=0;
  for(let s=from;s<=to;s+=2)peak=Math.max(peak,Math.abs(racingPoint(AI_LINE,s).curvature));
  assert.ok(Math.sqrt(225/peak)>minSpeed,`${name} has an unnecessary curvature spike: ${Math.sqrt(225/peak)}`);
 }
 // A faster route must come from using the available asphalt, never clipping
 // the loop or leaving insufficient room for the car at either road edge.
 for(let s=0;s<TRACK.length;s+=4){
  const p=racingPoint(AI_LINE,s);
  assert.ok(Math.abs(p.offset)<TRACK.width/2-20,`racing arc leaves the safe road corridor at ${s}`);
 }
});
test('Dunes opens the final corner from the outside before clipping the apex',()=>{
 selectTrack('dunes');
 // Down the final approach, positive offset is the outside/left road edge.
 // Start the radius there instead of tracing the centreline's tight inside.
 assert.ok(racingPoint(AI_LINE,7300).offset>25);
 assert.ok(racingPoint(AI_LINE,7900).offset<-30);
 let peak=0;
 for(let s=7450;s<=8050;s+=2)peak=Math.max(peak,Math.abs(racingPoint(AI_LINE,s).curvature));
 assert.ok(Math.sqrt(225/peak)>315,'widen the bend enough to carry exit speed');
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
  for(let i=1;i<times.length;i++)assert.ok(times[i]<times[i-1]*.98,`each difficulty must gain at least 2%: ${times.join(', ')}`);
  assert.ok(times[3]<times[0]*.90,'Expert must be measurably faster than Easy on the same car');
 }
});

test('difficulty remains distinct on suitable Intermediate and Wet tyres',()=>{
 for(const [tyre,water] of [['I',.45],['W',.85]]){
  const times=[];
  for(const difficulty of ['easy','normal','hard','expert']){
   const race=new Race({track:'dunes',laps:4,fuel:5,tyre,weather:'dry',aiSeed:42,difficulty,tyreTemperatureEnabled:false});
   const car=race.cars[0];race.cars=[car];race.traffic=[car];car.tyre=tyre;
   car.ai.nextDecision=Infinity;car.ai.strategy.nextReview=Infinity;
   let started=null,finished=null;
   for(let i=0;i<60*180&&finished===null;i++){
    Object.assign(car,{fuel:5,wear:0,wheelWear:[0,0,0,0],trackWetness:water});
    const before=car.s;race.time+=1/60;race.stepAI(car,1/60);
    const crossing=s=>race.time-(car.s-s)/(car.s-before)/60;
    if(started===null&&car.s>=TRACK.length)started=crossing(TRACK.length);
    if(car.s>=2*TRACK.length)finished=crossing(2*TRACK.length);
   }
   assert.ok(finished!==null);times.push(finished-started);
  }
  for(let i=1;i<times.length;i++)assert.ok(times[i]<times[i-1]*.985,`${tyre}: ${times.join(', ')}`);
 }
});
