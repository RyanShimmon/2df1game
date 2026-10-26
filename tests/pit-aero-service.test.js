import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,acceleration,cleanAirTopSpeed,maximumSpeed,selectTrack} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {createWeekend,QualifyingRun,nextQualifyingSession,recordLap,finishQualifyingStage,prepareRace} from '../src/weekend.js';
import {developmentBench} from '../src/development-preview.js';
const profile={driverName:'Pit tester',teamIndex:2};
const setup={track:'northline',laps:24,fuel:28,tyre:'S',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false};
const approx=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function qualifying(){const career=newCareer(profile);career.upgrades.aero=1;const w=createWeekend(career,setup);career.weekend=w;const q=new QualifyingRun(w,'S1',career.upgrades,profile);q.cars=[q.player];q.pitRandom=()=>0;return q;}
function race(){const r=new Race(setup,{aero:1,crew:0});r.cars=[r.player];r.pitRandom=()=>0;return r;}
function box(r){r.enterPit(r.player);Object.assign(r.player.pit,{distance:r.player.pit.boxDistance,stage:'entry'});r.player.speed=0;r.stepPit(r.player,.01,{});}
function wait(r,seconds){for(let i=0;i<Math.round(seconds*100)&&r.player.pit;i++)r.stepPit(r.player,.01,{});}
test.afterEach(()=>selectTrack('northline'));
test('race queues aero without changing physics, then adds exactly ten seconds after tyres and penalty',()=>{
 const r=race(),c=r.player,top=cleanAirTopSpeed(c);c.penalty=5;
 assert.equal(r.selectAero('lowDrag'),true);assert.equal(c.aeroSpec,'balanced');approx(cleanAirTopSpeed(c),top);
 box(r);approx(c.pit.serviceDuration,2.3);approx(c.pit.timer,17.3);assert.equal(c.penalty,0);
 wait(r,17.28);assert.equal(c.aeroSpec,'balanced');assert.equal(c.pit.serviced,false);
 wait(r,.03);assert.equal(c.aeroSpec,'lowDrag');assert.equal(c.pit.serviced,true);approx(cleanAirTopSpeed(c),top*1.1);
 assert.equal(c.history.at(-1).aeroSeconds,10);
});
test('unchanged package has no extra wait, crew upgrades do not shorten aero work',()=>{
 for(const crew of [0,4]){const r=race();r.player.upgrades.crew=crew;r.pitRandom=()=>1;r.selectAero('downforce');box(r);approx(r.player.pit.timer,5.5-crew*.5+10);}
 const r=race();r.selectAero('balanced');box(r);approx(r.player.pit.timer,2.3);
});
test('qualifying aero-only work retains physical tyres and blocks departure for ten seconds',()=>{
 const q=qualifying(),c=q.player,set=c.tyreSet;set.wear=.23;c.wear=.23;
 assert.equal(q.selectAero('downforce'),true);approx(c.pit.timer,10);assert.equal(q.launch(c),false);
 for(let i=0;i<199;i++)q.step(.05,{});
 assert.equal(c.aeroSpec,'balanced');assert.equal(q.launch(c),false);
 q.step(.05,{});q.step(.05,{});assert.equal(c.aeroSpec,'downforce');assert.equal(c.tyreSet,set);approx(c.wear,.23);
 assert.equal(q.weekend.setup.aeroSpec,'downforce');assert.equal(q.launch(c),true);assert.equal(q.selectAero('lowDrag'),false);
});
test('tyre and aero choices combine in either order without losing or repeating the aero wait',()=>{
 for(const first of ['tyres','aero']){
  const q=qualifying(),c=q.player;
  if(first==='tyres'){q.selectGarageSet('M1');q.selectAero('lowDrag');}else{q.selectAero('lowDrag');q.selectGarageSet('M1');}
  approx(c.pit.timer,12.3);wait(q,4);const remaining=c.pit.timer;
  q.selectAero('lowDrag');approx(c.pit.timer,remaining);q.selectGarageSet('M1');approx(c.pit.timer,remaining);
  q.selectGarageSet('W1');approx(c.pit.timer,remaining+2.3);
  wait(q,remaining+2.31);assert.equal(c.tyreSet.id,'W1');assert.equal(c.aeroSpec,'lowDrag');
 }
});
test('cancelling or revising aero preserves other service and cannot fit it for free',()=>{
 const r=race();r.selectAero('downforce');box(r);wait(r,1);r.selectAero('balanced');approx(r.player.pit.timer,1.3);
 r.selectAero('lowDrag');approx(r.player.pit.timer,11.3);wait(r,3);r.selectAero('downforce');approx(r.player.pit.timer,10);
 assert.equal(r.player.aeroSpec,'balanced');wait(r,10.01);assert.equal(r.player.aeroSpec,'downforce');
 const q=qualifying();q.selectAero('lowDrag');q.selectAero('balanced');assert.equal(q.player.pit.serviced,true);assert.equal(q.player.stops,0);
});
test('Q2 and Q3 begin in their track garage with worn tyres, fitted aero, and fresh timing',()=>{
 let q=qualifying();q.selectAero('lowDrag');for(let i=0;i<202;i++)q.step(.05,{});
 q.player.tyreSet.wear=.23;q.player.wear=.23;q.timeScale=4;q.player.drive='push';
 for(const phase of ['Q2','Q3']){
  for(const id of q.weekend.active)recordLap(q.weekend,id,id===21?20:30+id*.01,id);
  q.weekend.elapsed=9999;finishQualifyingStage(q.weekend,q.player.upgrades,profile);
  const next=nextQualifyingSession(q,q.player.upgrades,profile);assert.ok(next);assert.equal(next.stage.name,phase);
  assert.equal(next.player.garage,true);assert.equal(next.player.pit.serviced,true);assert.equal(next.player.qNeedsRelease,true);
  assert.equal(next.player.aeroSpec,'lowDrag');assert.equal(next.player.tyreSet.id,'S1');approx(next.player.wear,.23);
  assert.equal(next.timeScale,4);assert.equal(next.player.drive,'push');assert.equal(next.weekend.results.length,0);
  assert.equal(nextQualifyingSession(next,next.player.upgrades,profile),null);q=next;
 }
});
test('unfinished aero work is not granted by advancing, and completed work carries into the race',()=>{
 const q=qualifying();q.selectAero('lowDrag');
 for(const id of q.weekend.active)recordLap(q.weekend,id,id===21?20:30,id);
 q.weekend.elapsed=9999;finishQualifyingStage(q.weekend,q.player.upgrades,profile);
 const next=nextQualifyingSession(q,q.player.upgrades,profile);assert.equal(next.player.aeroSpec,'balanced');
 next.selectAero('downforce');next.cars=[next.player];for(let i=0;i<202;i++)next.step(.05,{});
 const w=next.weekend;w.phase='R';w.grid=Array.from({length:22},(_,i)=>i);w.raceStarted=false;
 const r=new Race(w.setup,next.player.upgrades,'career',profile);prepareRace(r,w,'M1');assert.equal(r.player.aeroSpec,'downforce');
});
test('factory cars cannot select aero in quick race or career qualifying',()=>{
 const quick=new Race({...setup,aeroSpec:'lowDrag'},{});
 assert.equal(quick.player.aeroSpec,'balanced');assert.equal(quick.canSelectAero(),false);assert.equal(quick.selectAero('lowDrag'),false);
 const c=newCareer(profile),w=createWeekend(c,setup),q=new QualifyingRun(w,'S1',c.upgrades,profile);
 assert.equal(q.selectAero('downforce'),false);assert.equal(q.player.pit.timer,0);assert.equal(q.player.aeroSpec,'balanced');
 assert.equal(q.selectAero('invalid'),false);
});
test('each engine level increases acceleration across all speeds and packages without changing the aero or draft cap',()=>{
 const r=race(),c=r.player;c.drive='push';c.fuel=0;c.pace=1;
 for(const spec of ['balanced','downforce','lowDrag']){
  c.aeroSpec=spec;c.upgrades.engine=0;const cap=cleanAirTopSpeed(c);
  for(const speed of [50,150,250,cap-20,cap-1]){
   c.speed=speed;let prior=-Infinity;
   for(let engine=0;engine<=5;engine++){c.upgrades.engine=engine;const thrust=acceleration(c);assert.ok(thrust>prior,`${spec} ${speed} engine ${engine}`);prior=thrust;approx(cleanAirTopSpeed(c),cap);}
  }
  c.slipstream={strength:1,carry:1};approx(maximumSpeed(c),cap+18);c.slipstream=null;
 }
 const base=developmentBench({aero:1,engine:0},'lowDrag'),upgraded=developmentBench({aero:1,engine:5},'lowDrag');
 assert.ok(upgraded.highSpeed<base.highSpeed*.65,`${base.highSpeed} -> ${upgraded.highSpeed}`);
});
