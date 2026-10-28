import test from 'node:test';
import assert from 'node:assert/strict';
import {CIRCUITS,TRACK,sample} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {beginQualifying,createWeekend,qualifyingDurations,qualifyingStage,qualifyingWeatherDuration,migrateWeekend,QualifyingRun} from '../src/weekend.js';
import {createWeather} from '../src/weather.js';
const profile={driverName:'Clock',teamIndex:2};
function weekend(track='northline'){
 const career=newCareer(profile);career.round=career.seasonOrder.indexOf(track)+1;
 return {career,w:createWeekend(career,{aiSeed:42,weatherSeed:42,tyre:'M'})};
}
test('starting qualifying immediately constructs an on-track session with the chosen compound',()=>{
 for(const compound of ['S','M','H','I','W']){
  const {career,w}=weekend('velocity');
  const q=beginQualifying(w,career.upgrades,profile,{compound});
  assert.equal(q.qualifying,true);assert.equal(q.stage.name,'Q1');assert.equal(TRACK.id,'velocity');
  assert.equal(q.player.tyre,compound);assert.equal(w.selectedSetId,q.player.tyreSet.id);
  assert.equal(q.player.garage,true);assert.equal(q.player.pit.serviced,true);
  q.step(.05,{throttle:true});assert.equal(q.player.garage,false);
 }
});
test('a saved outing honours the selected physical set and retains its wear',()=>{
 const {career,w}=weekend();w.inventories[21].find(t=>t.id==='S2').wear=.27;
 const q=beginQualifying(w,career.upgrades,profile,{setId:'S2',compound:'H'});
 assert.equal(q.player.tyreSet.id,'S2');assert.equal(q.player.wear,.27);
});
test('clocks scale with track length, persist on reload and cover the shared qualifying weather',()=>{
 assert.ok(qualifyingDurations('canyon').Q1>qualifyingDurations('northline').Q1);
 for(const {id} of CIRCUITS){
  const {w}=weekend(id),before=structuredClone(w.qualifyingDurations);
  assert.ok(Object.values(before).every(t=>t>=300&&t<=600));
  migrateWeekend(w);assert.deepEqual(w.qualifyingDurations,before);
  assert.equal(qualifyingWeatherDuration(w),Object.values(before).reduce((a,b)=>a+b));
 }
});
test('legacy in-progress qualifying gets a final outing rather than immediate expiry',()=>{
 const {w}=weekend();delete w.qualifyingDurations;w.elapsed=800;
 migrateWeekend(w);assert.ok(qualifyingStage(w).duration>w.elapsed+60);
 const duration=qualifyingStage(w).duration;migrateWeekend(w);assert.equal(qualifyingStage(w).duration,duration);
});
test('chequered flag sends an out lap back to the pits but a started timed lap still counts',()=>{
 const {career,w}=weekend();const q=beginQualifying(w,career.upgrades,profile),p=q.player;
 w.elapsed=q.stage.duration;q.time=q.stage.duration-q.stageStart;p.qState='out';q.crossLine(p);
 assert.equal(p.qState,'in');assert.equal(q.pitRequested,true);assert.equal(w.results.length,0);
 p.qState='timed';p.qStart=q.stage.duration-q.stageStart-10;q.time=q.stage.duration-q.stageStart+20;q.crossLine(p);
 assert.equal(p.qState,'in');assert.equal(w.results.find(r=>r.id===21).time,30);
});
// Exercise complete physical out/timed/in cycles with real service and release
// delays, using an ordinary development car. Q3 has the shortest budget.
for(const id of ['northline','dunes','canyon'])test(`${id}: shortened Q3 supports roughly three physical timed runs`,()=>{
 const {career,w}=weekend(id);w.phase='Q3';w.weather=createWeather('dry');w.setup.tyreTemperatureEnabled=false;
 const q=new QualifyingRun(w,'S3',career.upgrades,profile),car=q.cars[0];q.cars=[car];q.autoPitLimiter=true;
 for(let frame=0;frame<20*(q.stage.duration+90)&&!q.done;frame++)q.step(.05,{});
 assert.equal(w.attempts[car.id],3);assert.ok(q.done);assert.equal(car.qState,'garage');
});

for(const player of [true,false])test(`${player?'player':'AI'} may finish a timed lap beyond the old 90-second expiry cutoff`,()=>{
 const {career,w}=weekend(),q=beginQualifying(w,career.upgrades,profile),c=player?q.player:q.cars[0];q.cars=[c];
 Object.assign(c,{garage:false,pit:null,qState:'out',qStart:null,s:TRACK.length-.2,speed:100,offset:0});
 const p=sample(c.s);Object.assign(c,{x:p.x,y:p.y,angle:p.angle,motionAngle:p.angle});
 q.time=q.stage.duration-q.stageStart-.01;q.step(.05,{});
 assert.equal(c.qState,'timed','crossed before zero within a step that ended after zero');
 assert.ok(q.stageStart+c.qStart<q.stage.duration);assert.equal(w.elapsed,q.stage.duration);
 q.time=q.stage.duration-q.stageStart+91;q.step(.05,{});
 assert.equal(q.done,false,'an underway lap cannot be stopped by the cleanup deadline');
 q.crossLine(c);assert.equal(c.qState,'in');assert.ok(w.results.find(row=>row.id===c.id).time>90);
 q.step(.05,{});assert.equal(q.done,true,'cleanup can finish once no timed laps remain');
});
test('a lap starting at or after zero is ineligible, including a saved session clock',()=>{
 for(const after of [0,.001,1]){
  const {career,w}=weekend();w.elapsed=100;const q=beginQualifying(w,career.upgrades,profile),c=q.player;
  c.qState='out';q.time=q.stage.duration-q.stageStart+after;q.crossLine(c);
  assert.equal(c.qState,'in');assert.equal(c.qStart,null);assert.equal(w.results.length,0);
 }
});
