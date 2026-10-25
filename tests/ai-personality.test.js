import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,sample,newCareer,angleDiff} from '../src/core.js';
import {createWeekend,QualifyingRun} from '../src/weekend.js';
const setup={laps:8,fuel:10,tyre:'M',weather:'dry',aiSeed:42};
function race(seed=42){const r=new Race({...setup,aiSeed:seed});r.countdown=0;return r;}
test('AI driving traits vary across the grid and can be reproduced by a race seed',()=>{
 const a=race(),b=race(),c=race(43);
 assert.deepEqual(a.cars.map(c=>c.driverStyle),b.cars.map(c=>c.driverStyle));
 assert.notDeepEqual(a.cars.map(c=>c.driverStyle),c.cars.map(c=>c.driverStyle));
 for(const key of ['aggression','consistency','wetSkill','tyreCare','pace','line'])
  assert.ok(new Set(a.cars.filter(c=>!c.player).map(c=>c.driverStyle[key])).size>15);
});
test('drivers change pace modes during a race and produce natural slides and occasional mistakes',()=>{
 const r=race();r.player.player=false;const modes=new Set();let maxSlide=0,mistakes=0,skids=0,maxJump=0;
 for(let i=0;i<60*130;i++) {
  const before=r.cars.map(c=>({x:c.x,y:c.y,pit:!!c.pit,finished:c.finished}));
  r.step(1/60);
  for(const c of r.cars) {
   modes.add(c.ai.mode);maxSlide=Math.max(maxSlide,c.sliding||0);
   if(c.ai.mistakeUntil>r.time)mistakes++;
   const old=before[c.id];if(!old.pit && !c.pit && !old.finished && !c.finished)maxJump=Math.max(maxJump,Math.hypot(c.x-old.x,c.y-old.y));
  }
  skids=Math.max(skids,r.skids.length);
 }
 // A short, adequately fuelled sprint need not conserve at random.
 assert.ok(modes.has('attack') && modes.has('cruise'));
 for(const mode of modes)assert.ok(['attack','conserve','cruise'].includes(mode));
 assert.ok(maxSlide>.25);assert.ok(mistakes>0);assert.ok(skids>0);assert.ok(maxJump<15);
});
test('an AI oversteer mistake moves the car sideways and then recovers smoothly',()=>{
 const r=race(),c=r.cars[0];r.cars=[c];r.traffic=[c];r.time=10;
 const loc=sample(500);Object.assign(c,{s:500,x:loc.x,y:loc.y,speed:200,offset:0});
 c.ai.nextDecision=100;c.ai.mistake='oversteer';c.ai.mistakeUntil=11;
 let slide=0,side=0;
 for(let i=0;i<30;i++){r.time+=1/60;r.stepAI(c,1/60);slide=Math.max(slide,c.sliding);side=Math.max(side,Math.abs(c.sideSpeed));}
 assert.ok(slide>.3);assert.ok(side>10);assert.ok(Math.abs(c.offset)>2);
 c.ai.mistakeUntil=0;c.speed=70;c.s=500;
 for(let i=0;i<180;i++){r.time+=1/60;r.stepAI(c,1/60);}
 assert.ok(c.sliding<.1);assert.ok(Math.abs(c.offset)<TRACK.width/2);
});
test('AI fuel conservation overrides attacking behaviour',()=>{
 const r=race(),c=r.cars[0];r.traffic=[c];c.fuel=1;c.ai.mode='attack';c.ai.nextDecision=100;
 r.stepAI(c,1/60);assert.equal(c.drive,'save');
});
test('several varied AI grids can still finish legal races without fuel retirement',()=>{
 for(const seed of [7,42,119]) {
  const r=race(seed);r.player.player=false;
  for(let i=0;i<60*700 && !r.done;i++)r.step(1/60);
  assert.ok(r.done,`seed ${seed} did not finish`);assert.ok(!r.result.dnf,`seed ${seed} ran out of fuel`);assert.ok(r.result.legal);
 }
});

test('driver personalities persist from qualifying to the race of a career weekend',()=>{
 const profile={driverName:'Alex',teamIndex:2},w=createWeekend(newCareer(profile),setup);
 const q=new QualifyingRun(w,'S1',{},profile),r=new Race(w.setup,{},'career',profile);
 assert.deepEqual(q.cars.map(c=>c.driverStyle),r.cars.map(c=>c.driverStyle));
});
