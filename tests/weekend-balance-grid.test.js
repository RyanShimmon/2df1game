import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,CIRCUITS,TRACK,TYRES,AI_LINE,PIT_MARKERS,sample,settleCareer,buyUpgrade,UPGRADES,selectTrack} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {developTeams,upgradePrice,racePrize} from '../src/development.js';
import {SPONSORS} from '../src/sponsors.js';
import {createWeekend,qualifyingStage,qualifyingWeatherDuration} from '../src/weekend.js';
import {createWeather,raceForecast,tyreWetnessRange,tyreWeatherGrip} from '../src/weather.js';
import {racingPoint} from '../src/racecraft.js';
test.afterEach(()=>selectTrack('northline'));
for(const {id} of CIRCUITS)test(`${id}: all 22 grid slots launch straight without initial collisions`,()=>{
 const r=new Race({track:id,laps:12,fuel:15,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false});
 for(const c of r.cars){assert.ok(Math.abs(c.angle)<1e-8);assert.ok(c.s>TRACK.mainStraight.from+100&&c.s< -50);}
 for(let i=0;i<22;i++)for(let j=i+1;j<22;j++)assert.ok(Math.hypot(r.cars[i].x-r.cars[j].x,r.cars[i].y-r.cars[j].y)>=59);
 assert.ok(TRACK.mainStraight.to>=400);assert.ok(PIT_MARKERS.entry.x<PIT_MARKERS.exit.x);
 r.countdown=0;r.player.player=false;
 for(let i=0;i<120;i++)r.step(1/60);
 assert.ok(r.cars.every(c=>!c.contacts&&c.speed>90));
});
test('qualifying preview uses the same seeded weather as the session, and Sprint weekends vary',()=>{
 const scenarios=new Set();
 for(let seed=1;seed<=30;seed++){
  const c=newCareer({driverName:'Weather',teamIndex:2});c.round=4;
  const w=createWeekend(c,{weatherSeed:seed,aiSeed:42,tyre:'M'});
  assert.equal(w.setup.laps,12);assert.equal(w.setup.weather,'dynamic');
  const preview=createWeather('dynamic',{seed,duration:qualifyingWeatherDuration(w)});
  assert.deepEqual(w.weather,preview);const before=structuredClone(w.weather);
  assert.deepEqual(raceForecast(preview,{duration:qualifyingStage(w).duration}),raceForecast(w.weather,{duration:qualifyingStage(w).duration}));
  assert.deepEqual(w.weather,before);scenarios.add(w.weather.scenario);
 }
 assert.ok(scenarios.size>=6);
});
test('wetness bands overlap at crossovers and describe the actual grip model',()=>{
 const bands=Object.fromEntries(Object.keys(TYRES).map(k=>[k,tyreWetnessRange(k,TYRES)]));
 assert.equal(bands.S.min,0);assert.equal(bands.M.min,0);assert.equal(bands.H.min,0);
 assert.deepEqual([bands.S.max,bands.M.max,bands.H.max],[5,12,20]);
 assert.ok(bands.I.min<=bands.H.max);assert.ok(bands.W.min<=bands.I.max);assert.equal(bands.W.max,100);
 for(const [key,band] of Object.entries(bands))for(let n=band.min;n<=band.max;n++){
  const rivals=['S','M','H'].includes(key)?['I','W']:Object.keys(TYRES).filter(k=>k!==key);
  const best=Math.max(...rivals.map(k=>TYRES[k].grip*tyreWeatherGrip(k,n/100)));
  assert.ok(TYRES[key].grip*tyreWeatherGrip(key,n/100)>=best*.95);
 }
});
test('slick grip fades progressively through each compound wetness window',()=>{
 for(const compound of ['S','M','H']){
  assert.equal(tyreWeatherGrip(compound,0),1);
  let previous=1;
  for(let water=.0005;water<=1;water+=.0005){
   const now=tyreWeatherGrip(compound,water);
   assert.ok(now<=previous+1e-10,'grip cannot improve as water accumulates');
   assert.ok(previous-now<.005,'no sudden grip cliff at a crossover or curve join');
   assert.ok(now>=.18);previous=now;
  }
 }
 assert.ok(tyreWeatherGrip('S',.025)<.9);
 assert.ok(tyreWeatherGrip('S',.05)<tyreWeatherGrip('S',.025));
 assert.ok(tyreWeatherGrip('M',.05)>.98);
 assert.ok(tyreWeatherGrip('M',.08)<tyreWeatherGrip('M',.05));
 assert.ok(tyreWeatherGrip('M',.12)<tyreWeatherGrip('M',.08));
 assert.ok(tyreWeatherGrip('H',.12)>=.97);
 assert.ok(tyreWeatherGrip('H',.16)<tyreWeatherGrip('H',.12));
 assert.ok(tyreWeatherGrip('H',.20)<tyreWeatherGrip('H',.16));
 for(const [compound,limit] of [['S',.05],['M',.12],['H',.2]]){
  const at=tyreWeatherGrip(compound,limit),beyond=tyreWeatherGrip(compound,limit+.03);
  assert.ok(beyond<at && beyond>0,'usable grip remains beyond the suggested range');
 }
});
test('sponsors are smaller than race prizes, and development rewards winning without a runaway first season',()=>{
 assert.ok(SPONSORS.every(s=>s.amount*1.3<racePrize({position:1,legal:true}).base*.51));
 const c=newCareer({driverName:'Economy',teamIndex:10});c.developmentSeed=42;
 for(let round=1;round<=12;round++){
  for(let n=0;n<40;n++){
   const key=Object.keys(UPGRADES).filter(k=>c.upgrades[k]<UPGRADES[k].max&&upgradePrice(c.upgrades,k)<=c.cash).sort((a,b)=>c.upgrades[a]-c.upgrades[b])[0];
   if(!key)break;assert.ok(buyUpgrade(c,key));
  }
  developTeams(c,42);c.sponsor='win';
  const field=Array.from({length:22},(_,i)=>({teamIndex:Math.floor(i/2),position:i+1,legal:true,dnf:false,contacts:0,penalties:0}));
  const paid=settleCareer(c,{position:1,legal:true,dnf:false,contacts:0,penalties:0,field});assert.equal(paid.seasonBonus,0);
  for(const team of c.teams.filter(t=>t.teamIndex!==10)){assert.ok(team.budget>=0);assert.equal(team.lastIncome.earned,team.lastIncome.prize+team.lastIncome.sponsor);}
 }
 const levels=u=>Object.values(u).reduce((a,b)=>a+b,0),own=levels(c.upgrades),rivals=c.teams.filter(t=>t.teamIndex!==10).map(t=>levels(t.upgrades));
 assert.ok(own>=Math.max(...rivals));assert.ok(own-Math.max(...rivals)<=4);assert.ok(own<20);
});
function sprintStint(tyre){
 const r=new Race({track:'harbour',laps:1,tyre,fuel:6,weather:'dry',aiSeed:42,tyreTemperatureEnabled:false}),c=r.cars[0],p=sample(0),ref=racingPoint(AI_LINE,0);
 Object.assign(c,{s:0,x:p.x-Math.sin(p.angle)*ref.offset,y:p.y+Math.cos(p.angle)*ref.offset,angle:ref.angle,offset:ref.offset,tyre,pace:1,speed:230,wear:0,wheelWear:[0,0,0,0],upgrades:{}});
 c.driverStyle.line=0;c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;c.ai.strategy.plannedMode='balanced';r.cars=[c];r.traffic=[c];
 let lap=0,start=0,times=[];
 for(let frame=0;frame<60*800&&times.length<12;frame++){
  c.fuel=6;r.time+=1/60;r.stepAI(c,1/60);
  if(Math.floor(c.s/TRACK.length)>lap){if(lap)times.push(r.time-start);else Object.assign(c,{wear:0,wheelWear:[0,0,0,0]});lap++;start=r.time;}
 }
 assert.equal(times.length,12);return times;
}
test('12-lap Sprint lets Soft lead early and Medium catch it as wear develops',()=>{
 const soft=sprintStint('S'),medium=sprintStint('M'),sum=a=>a.reduce((s,n)=>s+n,0);
 assert.ok(sum(soft.slice(0,8))<sum(medium.slice(0,8)));
 assert.ok(soft.at(-1)>medium.at(-1)*1.03);
 assert.ok(Math.abs(sum(soft)-sum(medium))<sum(medium)*.03);
});
