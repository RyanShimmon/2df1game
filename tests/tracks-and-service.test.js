import {crossingDistances} from './track-fixtures.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {CIRCUITS,selectTrack,TRACK,PIT_LANE,PIT_MARKERS,sample,samplePit,nearest,angleDiff,trackLayer,bankingGrip,grip,Race,tyreServiceTime} from '../src/core.js';
import {QualifyingRun,createWeekend,getQualifyingFuel} from '../src/weekend.js';
const upgrades={engine:0,aero:0,tyres:0,crew:0};
test.afterEach(()=>selectTrack('northline'));
test('12 distinct tracks have varied lengths, smooth pits and exact edge joins',()=>{
 assert.equal(CIRCUITS.length,12);const lengths=[];
 for(const circuit of CIRCUITS) {
  selectTrack(circuit.id);lengths.push(TRACK.length);assert.ok(TRACK.pts.every(p=>Number.isFinite(p.x+p.y+p.s)));
  assert.ok(PIT_LANE.length>700 && PIT_LANE.boxDistance>250);
  for(const m of Object.values(PIT_MARKERS))assert.ok(Math.abs(nearest(m.x,m.y).dist-63)<1e-6);
  let previous=samplePit(0).angle;
  for(let d=2;d<PIT_LANE.length;d+=2){const p=samplePit(d);assert.ok(Math.abs(angleDiff(p.angle,previous))<.04,`${circuit.id} pit kink`);previous=p.angle;}
 }
 assert.equal(new Set(lengths.map(Math.round)).size,12);assert.ok(Math.max(...lengths)>Math.min(...lengths)*1.8);
});
test('all circuits support a full AI race with a legal compound stop and no fuel retirement',()=>{
 for(const track of CIRCUITS.map(t=>t.id)) {
  const r=new Race({track,laps:8,fuel:10,tyre:'M',weather:'dry',aiSeed:42},upgrades);r.countdown=0;r.player.player=false;
  for(let i=0;i<60*900 && !r.done;i++)r.step(1/60);
  assert.ok(r.done,`${track} race did not finish`);assert.ok(!r.result.dnf,`${track} retired`);assert.ok(r.result.legal,`${track} missed tyre requirement`);
 }
});
test('flyovers keep crossing progress on the hinted branch and cars on different levels do not collide',()=>{
 for(const [id,top,under] of [['crossover',...crossingDistances('crossover')],['metro',...crossingDistances('metro')]]) {
  const r=new Race({track:id,laps:8,fuel:10,tyre:'M'},upgrades),p=r.player,c=r.cars[0],a=sample(top),b=sample(under);
  assert.equal(trackLayer(top),1);assert.equal(trackLayer(under),0);assert.ok(Math.hypot(a.x-b.x,a.y-b.y)<8);
  assert.ok(Math.abs(nearest(a.x,a.y,top).s-top)<2);assert.ok(Math.abs(nearest(b.x,b.y,under).s-under)<2);
  Object.assign(p,{s:top,x:a.x,y:a.y,angle:a.angle,speed:200});Object.assign(c,{s:under,x:b.x,y:b.y,angle:b.angle,speed:200});r.cars=[p,c];
  r.collisions();assert.equal(p.contacts,0);assert.equal(p.speed,200);
 }
});
test('banking gives a smooth, material cornering grip benefit',()=>{
 selectTrack('sunset');const [a,b]=TRACK.banks[0],s=(a+b)/2;
 assert.ok(bankingGrip(s)>1.15);assert.ok(Math.abs(bankingGrip(a)-1)<1e-10);
 const car={tyre:'M',tyreAge:1000,wear:0,trackWetness:0,offset:0,upgrades,s};
 const banked=grip(car);car.s=0;assert.ok(banked>grip(car)*1.15);
});
test('random tyre service stays between 2.3s and the upgraded maximum',()=>{
 assert.equal(tyreServiceTime(0,()=>0),2.3);assert.equal(tyreServiceTime(0,()=>1),5.5);
 assert.equal(tyreServiceTime(4,()=>1),3.5);
 const values=new Set();for(let i=0;i<100;i++){const t=tyreServiceTime(0,()=>i/99);assert.ok(t>=2.3 && t<=5.5);values.add(t);}
 assert.equal(values.size,100);
 for(let crew=1;crew<=4;crew++)assert.ok(tyreServiceTime(crew,()=>1)<tyreServiceTime(crew-1,()=>1));
});
test('qualifying fuel and garage placement adapt to the selected circuit',()=>{
 for(const track of ['harbour','alpine','crossover']) {
  const profile={driverName:'Alex',teamIndex:2},career={season:1,round:1},w=createWeekend(career,{track,laps:8,fuel:10,tyre:'S'});
  w.setup.track=track;const q=new QualifyingRun(w,'S1',upgrades,profile);
  assert.equal(TRACK.id,track);assert.equal(q.player.fuel,getQualifyingFuel());assert.ok(q.player.pit.boxDistance<PIT_LANE.length);
 }
});
test('player lap timing remains continuous when driving across both flyovers',()=>{
 for(const track of ['crossover','metro']) {
  const r=new Race({track,laps:1,fuel:3,tyre:'M'},upgrades);r.countdown=0;r.cars=[r.player];const p=r.player,loc=sample(0);
  Object.assign(p,{s:0,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:0});p.used.add('H');
  for(let i=0;i<60*300 && !r.done;i++) {
   const goal=sample(p.s+Math.max(35,Math.min(90,p.speed*.5))),desired=Math.atan2(goal.y-p.y,goal.x-p.x);
   // A moderate pace leaves room for a deliberate steering input through the crossing.
   const target=Math.min(160,Math.sqrt(225*grip(p)/Math.max(.001,Math.abs(angleDiff(sample(p.s+100).angle,sample(p.s).angle))/100))*.7);
   r.step(1/60,{steer:Math.max(-1,Math.min(1,angleDiff(desired,p.angle)*3.5)),throttle:p.speed<target,brake:p.speed>target+3});
  }
  assert.ok(r.done && !r.result.dnf,`${track}: player could not finish`);assert.ok(r.result.bestLap>30);
 }
});
