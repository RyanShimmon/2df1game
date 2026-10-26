import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,TYRES,sample,angleDiff,resources} from '../src/core.js';
import {createWeather} from '../src/weather.js';
import {createWeekend,QualifyingRun} from '../src/weekend.js';
import {newCareer} from './career-fixture.js';
const upgrades={engine:0,aero:0,tyres:0,crew:0};
function race(tyre='S'){const r=new Race({laps:12,fuel:14,tyre},upgrades);r.cars=[r.player];r.countdown=0;return r;}
test('wet slicks build visible sideways drift while retaining their momentum',()=>{
 const r=race(),p=r.player,loc=sample(500);r.weather=createWeather('wetToDry');r.weather.rain=1;r.weather.wetness=1;r.weather.sectors.fill(1);
 Object.assign(p,{s:500,x:loc.x,y:loc.y,angle:loc.angle,speed:220,tyreAge:1000});
 for(let i=0;i<30;i++)r.stepPlayer(p,1/60,{steer:.8});
 assert.ok(Math.abs(angleDiff(p.motionAngle,p.angle))>.12,'body yaw diverges from travel direction');
 assert.ok(Math.abs(p.sideSpeed)>25,'velocity has a real sideways component');
 assert.ok(p.speed>209,`momentum retained: ${p.speed} km/h`);
 assert.ok(p.sliding>.8);
});
test('auto pit mode completes entry, accurate box stop, service and exit with no pedal input',()=>{
 const r=race('M'),p=r.player;p.s=TRACK.pitEntry;p.speed=80;r.nextTyre='H';r.enterPit(p);
 let serviceFrames=0;
 for(let i=0;i<4000 && p.pit;i++) {
  r.stepPit(p,1/60,{});
  if(p.pit?.stage==='service') {serviceFrames++;assert.equal(p.speed,0);assert.equal(p.pit.distance,p.pit.boxDistance);}
  assert.ok(p.speed<=80);
 }
 assert.ok(serviceFrames>=137 && serviceFrames<=332);assert.equal(p.stops,1);assert.equal(p.tyre,'H');assert.equal(p.pit,null);assert.equal(r.pitLimiter,false);
});
test('auto pits ignore brake and reverse pedal input and still complete service',()=>{
 const r=race('M'),p=r.player;p.s=TRACK.pitEntry;r.enterPit(p);
 for(let i=0;i<4000 && p.pit;i++)r.stepPit(p,1/60,{brake:true,reverse:true});
 assert.equal(p.stops,1);assert.equal(p.pit,null);
});
test('automatic qualifying stop refuels and holds retained tyres until a new throttle press',()=>{
 const profile={driverName:'Alex',teamIndex:2},w=createWeekend(newCareer(profile),{laps:12,fuel:14,tyre:'S'});
 const q=new QualifyingRun(w,'S1',upgrades,profile),p=q.player;q.cars=[p];p.garage=false;p.pit=null;p.qState='in';p.s=TRACK.pitEntry;p.speed=80;
 q.enterPit(p);
 for(let i=0;i<4000 && !p.garage;i++)q.step(1/60,{});
 assert.equal(p.stops,1);assert.ok(p.pit.serviced);assert.equal(p.qState,'garage');assert.equal(p.garage,true);assert.equal(p.tyreSet.id,'S1');assert.ok(p.fuel>3);
 q.step(1/60,{throttle:true});
 for(let i=0;i<4000 && p.pit;i++)q.step(1/60,{});
 assert.equal(p.pit,null);assert.equal(p.qState,'out');
});
test('soft wear rises modestly while retaining its qualifying reuse advantage',()=>{
 const r=race(),p=r.player;resources(p,0,TRACK.length);
 assert.equal(TYRES.S.life,12);assert.ok(Math.abs(p.wear-1/TYRES.S.life)<1e-9);
});
test('every tyre compound drifts when worn and grip has fallen',()=>{
 for(const tyre of ['S','M','H','I','W']) {
  const r=race(tyre),p=r.player,loc=sample(500);r.weather=createWeather('dry');
  Object.assign(p,{s:500,x:loc.x,y:loc.y,angle:loc.angle,speed:220,tyreAge:1000,wear:1});
  for(let i=0;i<30;i++)r.stepPlayer(p,1/60,{steer:1});
  assert.ok(Math.abs(angleDiff(p.motionAngle,p.angle))>.12,`${tyre} worn grip produces actual yaw / velocity divergence`);
  assert.ok(Math.abs(p.sideSpeed)>20);
 }
});
test('fresh wets slide on dry asphalt while fresh softs hold the same turn',()=>{
 for(const tyre of ['S','W']) {
  const r=race(tyre),p=r.player,loc=sample(500);r.weather=createWeather('dry');
  Object.assign(p,{s:500,x:loc.x,y:loc.y,angle:loc.angle,speed:220,tyreAge:1000});
  for(let i=0;i<30;i++)r.stepPlayer(p,1/60,{steer:1});
  const slip=Math.abs(angleDiff(p.motionAngle,p.angle));
  if(tyre==='W')assert.ok(slip>.1 && Math.abs(p.sideSpeed)>20);
  else assert.ok(slip<.01);
 }
});
