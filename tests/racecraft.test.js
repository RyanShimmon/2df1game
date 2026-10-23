import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,AI_LINE,CIRCUITS,selectTrack,sample,MAX_SPEED,maximumSpeed,tyreRuleMet} from '../src/core.js';
import {updateSlipstream,brakingTarget,racingPoint} from '../src/racecraft.js';
import {createWeekend,QualifyingRun,prepareRace,finishRemainingQualifying} from '../src/weekend.js';
import {newCareer} from '../src/core.js';
test.afterEach(()=>selectTrack('northline'));
const setup={track:'northline',laps:16,fuel:19,tyre:'M',weather:'dry',aiSeed:42};
const mock=(id,s,x,y=0)=>({id,s,x,y,angle:0,offset:0,speed:330,fuel:1,pace:1,drive:'push',upgrades:{}});
const context={width:126,layer:()=>0,length:6000};
test('a tow requires a nearby aligned moving car ahead and builds smoothly for both car types',()=>{
 for(const player of [false,true]){
  const car={...mock(0,0,0),player},leader=mock(1,95,95);
  updateSlipstream(car,[leader],1/60,context);assert.ok(car.slipstream.strength>0&&car.slipstream.strength<.1);
  for(let i=0;i<120;i++)updateSlipstream(car,[leader],1/60,context);
  assert.ok(car.slipstream.strength>.6);assert.ok(maximumSpeed(car)>MAX_SPEED+10&&maximumSpeed(car)<MAX_SPEED+18);
 }
 for(const leader of [mock(1,-80,-80),mock(1,600,600),mock(1,80,80,80),{...mock(1,80,80),angle:Math.PI}, {...mock(1,80,80),pit:{}}, {...mock(1,80,80),garage:true},{...mock(1,80,80),speed:50}]){
  const car=mock(0,0,0);updateSlipstream(car,[leader],1,context);assert.equal(car.slipstream.strength,0);
 }
 const car=mock(0,0,0);updateSlipstream(car,[mock(1,80,80)],1,{...context,layer:s=>s>40?1:0});assert.equal(car.slipstream.strength,0);
});
test('drag reduction clears on pulling out but the extra speed fades over several seconds',()=>{
 const car=mock(0,0,0),leader=mock(1,80,80);
 for(let i=0;i<120;i++)updateSlipstream(car,[leader],1/60,context);
 const peak=maximumSpeed(car);
 for(let i=0;i<60;i++)updateSlipstream(car,[],1/60,context);
 assert.ok(car.slipstream.strength<.001);assert.ok(maximumSpeed(car)>MAX_SPEED+4&&maximumSpeed(car)<peak);
 for(let i=0;i<240;i++)updateSlipstream(car,[],1/60,context);
 assert.ok(maximumSpeed(car)<MAX_SPEED+1);
 car.pit={};updateSlipstream(car,[leader],1/60,context);assert.equal(maximumSpeed(car),MAX_SPEED);
});
test('real player acceleration exceeds 330 in a tow and has no instant speed cut when pulling out',()=>{
 const r=new Race(setup),p=r.player;
 const leader={...mock(1,440,1140,1350),speed:345};r.cars=[p];p.speed=280;
 for(let i=0;i<600;i++){
  Object.assign(p,{fuel:1,s:350,x:1050,y:1350,angle:0,motionAngle:0,offset:0});
  updateSlipstream(p,[leader],1/60,context);r.stepPlayer(p,1/60,{throttle:true});
 }
 const peak=p.speed;assert.ok(peak>335&&peak<348,`tow speed ${peak}`);
 Object.assign(p,{fuel:1,s:350,x:1050,y:1350,angle:0,motionAngle:0});
 updateSlipstream(p,[],1/60,context);r.stepPlayer(p,1/60,{throttle:true});
 assert.ok(p.speed>330&&peak-p.speed<1,`exit ${peak} → ${p.speed}`);
 for(let i=0;i<240;i++){
  Object.assign(p,{fuel:1,s:350,x:1050,y:1350,angle:0,motionAngle:0});
  updateSlipstream(p,[],1/60,context);r.stepPlayer(p,1/60,{throttle:true});
 }
 assert.ok(p.speed<331.5);
});
test('the corner planner anticipates braking distance and brakes earlier with less grip',()=>{
 const line={length:3000,step:30,points:Array.from({length:100},(_,i)=>({offset:0,angle:0,distanceScale:1,curvature:i>=33&&i<=37?.018:0}))};
 const before=brakingTarget(line,800,1,180,330),closer=brakingTarget(line,880,1,180,330),wet=brakingTarget(line,800,.5,90,330);
 assert.ok(before<330&&closer<before&&wet<before);
});
for(const circuit of CIRCUITS)test(`${circuit.name}: AI follows a bounded corner line and completes dry and wet laps`,()=>{
 for(const [weather,tyre] of [['dry','M'],['wetToDry','W']]){
  const r=new Race({...setup,track:circuit.id,laps:2,fuel:4,weather}),c=r.cars[0];
  r.countdown=0;r.cars=[c];r.player=c;c.tyre=tyre;c.fuel=4;c.used=new Set([tyre,'H']);c.trackLimits=0;
  for(const point of AI_LINE.points){assert.ok(Math.abs(point.offset)<TRACK.width/2-19);assert.ok(Number.isFinite(point.curvature));}
  assert.ok(AI_LINE.estimatedTime<AI_LINE.baselineTime); // Flat-out ovals need not weave across both road edges.
  let jump=0;
  for(let i=0;i<60*250&&!r.done;i++){const x=c.x,y=c.y;r.step(1/60);jump=Math.max(jump,Math.hypot(c.x-x,c.y-y));}
  assert.ok(c.finished&&!c.dnf,`${weather}: failed to finish`);assert.ok(c.trackLimits<=1,`${weather}: ${c.trackLimits} limits`);assert.ok(jump<20,`${weather}: movement jump ${jump}`);
 }
});
function simulate(seed,playerTyre='M',weather='showers',seconds=210){
 const r=new Race({...setup,aiSeed:seed,tyre:playerTyre,weather});r.countdown=0;r.cars=r.cars.filter(c=>!c.player);
 for(let i=0;i<seconds*30;i++)r.step(1/30);
 return r.cars.map(c=>({id:c.id,tyre:c.tyre,s:c.s,speed:c.speed,wear:c.wear,stops:c.stops,history:c.history,decision:c.ai.strategy.reason}));
}
test('a seed replays driver decisions while another seed creates a different race; player tyre choice is not copied',()=>{
 const a=simulate(119),b=simulate(119,'S'),c=simulate(120);
 assert.deepEqual(a,b);assert.notDeepEqual(a,c);
 assert.ok(new Set(a.map(c=>c.history[0]?.entryTime).filter(Number.isFinite)).size>8,'stops were synchronized');
});
test('AI strategy reacts to wear, changing conditions, remaining distance and teammate box traffic',()=>{
 const r=new Race({...setup,weather:'dry'}),c=r.cars[0],mate=r.cars[1],plan=c.ai.strategy;r.time=80;
 c.tyre='M';c.used=new Set(['M']);c.wear=.1;c.trackWetness=0;plan.nextReview=0;
 assert.equal(r.reviewAIStrategy(c,12),false);
 c.wear=.9;plan.nextReview=0;assert.equal(r.reviewAIStrategy(c,10),true);assert.equal(plan.reason,'tyre life');
 plan.pitRequested=false;plan.nextReview=0;c.wear=.72;plan.wearLimit=.7;
 r.traffic=[{id:mate.id,team:c.team.name,pit:{serviced:false}}];
 assert.equal(r.reviewAIStrategy(c,8),false);assert.equal(plan.reason,'teammate traffic');
 plan.nextReview=0;c.wear=.98;assert.equal(r.reviewAIStrategy(c,8),true);
 plan.pitRequested=false;plan.nextReview=0;c.wear=.1;r.traffic=[];
 assert.equal(r.reviewAIStrategy(c,1.8),true);assert.equal(plan.reason,'compound rule');assert.notEqual(plan.choice.compound,'M');
 c.trackWetness=1;r.weather.wetness=1;r.weather.sectors.fill(1);r.weather.pattern='lateRain';r.weather.elapsed=220;
 plan.nextReview=0;plan.pitRequested=false;c.wear=.1;
 assert.equal(r.reviewAIStrategy(c,10),true);assert.equal(plan.choice.compound,'W');assert.equal(plan.reason,'weather crossover');
});
test('career starting tyres are individual and physical sets are respected when making pit choices',()=>{
 const profile={driverName:'Alex',teamIndex:2},w=createWeekend(newCareer(profile),setup);
 finishRemainingQualifying(w,{},profile);
 const r=new Race(w.setup,{},'career',profile);prepareRace(r,w,'M1');
 assert.ok(new Set(r.cars.filter(c=>!c.player).map(c=>c.tyre)).size>=2,'career grid was reset to one compound');
 for(const c of r.cars.filter(c=>!c.player)){
  const choice=r.chooseAITyres(c,5)[0]?.set;
  assert.ok(choice&&c.tyreInventory.includes(choice)&&!choice.returned&&choice.id!==c.tyreSet.id);
 }
});
test('AI qualifying departure times are seeded, varied, and a usable Soft can be retained',()=>{
 const profile={driverName:'Alex',teamIndex:2};
 const a=new QualifyingRun(createWeekend(newCareer(profile),setup),'S1',{},profile),b=new QualifyingRun(createWeekend(newCareer(profile),setup),'S1',{},profile);
 assert.deepEqual(a.cars.map(c=>c.qReleaseAt),b.cars.map(c=>c.qReleaseAt));
 assert.ok(new Set(a.cars.map(c=>c.qReleaseAt)).size>15);
 const car=a.cars[0];car.tyreSet.wear=.12;car.tyreSet.used=true;car.wear=.12;car.trackWetness=0;
 assert.equal(a.chooseAITyres(car,3)[0].set.id,car.tyreSet.id);
});
