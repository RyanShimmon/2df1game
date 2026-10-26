import test from 'node:test';
import assert from 'node:assert/strict';
import {TRACK,resources} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {createWeekend,QualifyingRun,QUALIFYING_FUEL,selectableSets} from '../src/weekend.js';
import {createWeather,advanceWeather,weatherTimeline,rainAt} from '../src/weather.js';
import {driveQualifyingOuting} from './qualifying-driver.js';
const profile={driverName:'Alex',teamIndex:2}, upgrades={engine:0,aero:0,tyres:0,crew:0};
function create(){const w=createWeekend(newCareer(profile),{laps:12,fuel:14,tyre:'S'}); w.weather=createWeather('dry'); return new QualifyingRun(w,'S1',upgrades,profile);}
test('qualifying starts parked; player waits while AI chooses individual release times',()=>{
  const q=create(),p=q.player;
  assert.ok(q.cars.every(c=>c.garage && c.pit && c.speed===0));
  assert.ok(new Set(q.cars.filter(c=>!c.player).map(c=>c.qReleaseAt)).size>10);
  const x=p.x,y=p.y,fuel=p.fuel,wear=p.wear;
  for(let i=0;i<1600;i++) q.step(.05);
  assert.equal(p.qState,'garage'); assert.equal(p.x,x); assert.equal(p.y,y);
  assert.equal(p.fuel,fuel); assert.equal(p.wear,wear);
  assert.ok(q.cars.some(c=>!c.player && c.qState!=='garage'));
  // AI traffic can occupy the garage exit; held throttle departs at the next safe gap.
  for(let i=0;i<400 && p.garage;i++) q.step(.05,{throttle:true});
  assert.equal(p.qState,'out'); assert.ok(!p.garage);
});
test('only one timed lap counts and extra in laps cannot produce more results',()=>{
  const q=create(),p=q.player;
  q.launch(p);
  q.time=10; q.crossLine(p); assert.equal(p.qState,'timed');
  q.time=40; q.crossLine(p); assert.equal(p.qState,'in'); assert.equal(p.qLaps,1);
  assert.equal(q.weekend.results.find(r=>r.id===21).time,30);
  q.time=60;q.crossLine(p); q.time=80;q.crossLine(p);
  assert.equal(p.qLaps,1); assert.equal(q.weekend.results.find(r=>r.id===21).time,30);
});
test('service retains the fitted set and actual wear, and another outing needs a new throttle press',()=>{
  const q=create(),p=q.player; q.cars=[p];
  driveQualifyingOuting(q);
  assert.equal(p.stops,1); assert.equal(p.tyreSet.id,'S1'); assert.ok(p.wear>.1);
  const wear=p.wear, distance=p.tyreSet.distance;
  assert.equal(p.fuel,QUALIFYING_FUEL); assert.equal(p.qState,'garage');
  // Throttle held during completion must be released before launch.
  p.qNeedsRelease=true;
  for(let i=0;i<20;i++) q.step(.05,{throttle:true});
  assert.equal(p.qState,'garage'); assert.equal(p.wear,wear);
  q.step(.05,{});q.step(.05,{throttle:true}); assert.equal(p.qState,'out');
  driveQualifyingOuting(q);
  assert.equal(p.stops,2);assert.equal(p.tyreSet.id,'S1');
  assert.ok(p.wear>wear);assert.ok(p.tyreSet.distance>distance);
  assert.ok(p.wear<.5);
});
test('qualifying fuel permits three push laps but not four, irrespective of out-lap tyre effort',()=>{
  const q=create(),p=q.player; p.drive='push';
  const initial=p.fuel;
  resources(p,0,TRACK.length*3,.45);
  assert.ok(p.fuel>=0 && p.fuel<.2,`remaining ${p.fuel} from ${initial}`);
  resources(p,0,TRACK.length,1.18);assert.equal(p.fuel,0);
  const actual=create();actual.cars=[actual.player];actual.player.drive='push';
  driveQualifyingOuting(actual);
  assert.equal(actual.player.stops,1,'three push laps return to service without running out');
});
test('intermediate and wet sets remain selectable in dry Q1, Q2, Q3 and race preparation',()=>{
  const q=create();
  for(const phase of ['Q1','Q2','Q3','R']) for(const tyre of ['I','W'])
    assert.ok(selectableSets(q.player.tyreInventory,phase).some(t=>t.compound===tyre));
});
test('forecast advances across rain changes and predicts water remaining after rain ends',()=>{
  const w=createWeather('wetToDry',{seed:42});advanceWeather(w,w.points.find(p=>p[1]===0)[0]-120);
  const now=w.elapsed,timeline=weatherTimeline(w);
  assert.equal(timeline[0].time,now); assert.ok(Math.abs(timeline.at(-1).time-now-360)<1e-8);
  assert.equal(w.elapsed,now,'forecast cannot advance live weather');
  for(const p of timeline) assert.equal(p.rain,rainAt(w,p.time));
  const drying=timeline.find(p=>p.rain===0);
  assert.equal(drying.rain,0); assert.ok(drying.water>.2);
  assert.ok(timeline.at(-1).water<drying.water);
});
test('session expiry prevents new departures and starting a new timed lap',()=>{
  const q=create(),p=q.player;
  q.weekend.elapsed=q.stage.duration;
  assert.equal(q.launch(p),false);
  p.qState='out';q.crossLine(p);assert.equal(p.qStart,null);
});
