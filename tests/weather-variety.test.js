import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeather,advanceWeather,rainAt,migrateWeather,projectWeather,weatherTimeline,trackWater,tyreWeatherGrip,forecast,raceWeatherDuration} from '../src/weather.js';
import {forecastWater} from '../src/racecraft.js';
import {Race,TYRES} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {createWeekend,startRaceWeather} from '../src/weekend.js';
const constant=(rain,water=0)=>({...createWeather('dry',{seed:1}),rain,wetness:water,sectors:Array(32).fill(water),points:[[0,rain],[4000,rain]]});
function sample(pattern,seed,duration=900){
 const w=createWeather(pattern,{seed,duration}),rows=[];
 for(let t=0;t<=duration;t++){if(t)advanceWeather(w,1);rows.push({time:t,rain:w.rain,water:w.wetness});}
 return rows;
}
const longest=(rows,accept)=>{let n=0,best=0;for(const row of rows){n=accept(row)?n+1:0;best=Math.max(best,n);}return best;};
test('steady light rain balances drainage for an intermediate stint, without creeping to 100%',()=>{
 const w=constant(.4);advanceWeather(w,600);const start=w.wetness;advanceWeather(w,1200);
 assert.ok(start>.45&&start<.56);assert.ok(Math.abs(w.wetness-start)<.003);
 assert.ok(w.sectors.every(water=>water>.35&&water<.64));
 const grip=t=>TYRES[t].grip*tyreWeatherGrip(t,w.wetness);
 for(const t of ['S','M','H','W'])assert.ok(grip('I')>grip(t));
});
test('heavy rain stays wet for a long stint and drains gradually after it stops',()=>{
 const w=constant(.96);advanceWeather(w,300);assert.ok(w.wetness>.96);
 advanceWeather(w,600);assert.ok(w.wetness>.96);
 w.points=[[0,0],[4000,0]];w.rain=0;advanceWeather(w,60);
 assert.ok(w.wetness>.45&&w.wetness<.8);assert.ok(new Set(w.sectors.map(v=>v.toFixed(3))).size>1);
 assert.ok(trackWater(w,0,320,0)<trackWater(w,0,320,50));advanceWeather(w,600);assert.equal(w.wetness,0);
});
test('light-rain scenarios provide long intermediate-only windows across seeds',()=>{
 for(let seed=1;seed<=40;seed++){
  const rows=sample('intermediate',seed);
  assert.ok(rows.every(p=>p.water<.64),`seed ${seed} needs wets`);
  assert.ok(longest(rows,p=>p.water>.3&&p.water<.6)>=300,`seed ${seed} has too short an intermediate window`);
 }
});
test('changeable fronts can stay damp then get wetter, clear, and return later',()=>{
 let stronger=0,clearing=0,repeated=0;
 for(let seed=1;seed<=32;seed++){
  const rows=sample('showers',seed,2760),firstWet=rows.findIndex(p=>p.water>.65);
  if(firstWet>0){stronger++;assert.ok(longest(rows.slice(0,firstWet),p=>p.water>.3&&p.water<.6)>=120);}
  let hasDamp=false,hasCleared=false;
  for(const row of rows){if(row.water>.3)hasDamp=true;if(hasDamp&&row.water<.12){hasCleared=true;}if(hasCleared&&row.water>.3){repeated++;break;}}
  if(hasCleared)clearing++;
 }
 assert.ok(stronger>0&&stronger<32);assert.ok(clearing>0&&repeated>0);
});
test('sustained and late-rain scenarios keep rain around for multiple laps',()=>{
 for(let seed=1;seed<=20;seed++){
  assert.ok(longest(sample('sustainedRain',seed),p=>p.water>.7)>=300);
  const late=sample('lateRain',seed);assert.ok(late.slice(0,360).every(p=>p.rain===0));
  assert.ok(late.at(-1).rain>.3);assert.ok(longest(late,p=>p.rain>.3)>=240);
 }
});
test('varied weather covers different scenarios and deterministic forecasts survive saves',()=>{
 const kinds=new Set();
 for(let seed=1;seed<=64;seed++)kinds.add(createWeather('dynamic',{seed}).scenario);
 assert.equal(kinds.size,6);
 const a=createWeather('showers',{seed:123}),b=createWeather('showers',{seed:123}),c=createWeather('showers',{seed:124});
 assert.deepEqual(a,b);assert.notDeepEqual(a.points,c.points);advanceWeather(a,320);
 const saved=JSON.parse(JSON.stringify(a));advanceWeather(a,200);advanceWeather(saved,200);assert.deepEqual(a,saved);
 const dry=createWeather('dry',{seed:77});advanceWeather(dry,3600);assert.equal(dry.rain,0);assert.equal(dry.wetness,0);
});
test('forecast graph and AI use the live water model without mutating or rerolling weather',()=>{
 for(const pattern of ['showers','intermediate','sustainedRain','wetToDry','lateRain']){
  const w=createWeather(pattern,{seed:42}),snapshot=structuredClone(w);advanceWeather(w,200);
  const before=structuredClone(w),timeline=weatherTimeline(w),ai=forecastWater(w,360),actual=structuredClone(w);
  for(let i=0;i<360*20;i++)advanceWeather(actual,.05);
  assert.ok(Math.abs(timeline.at(-1).water-actual.wetness)<.001,pattern);
  const expected=actual.sectors.reduce((n,_,i)=>n+trackWater(actual,i,32,0),0)/32;
  assert.ok(Math.abs(ai-expected)<.001,pattern);assert.deepEqual(w,before);
  assert.deepEqual(w.points,snapshot.points);assert.equal(timeline.at(-1).rain,rainAt(w,560));
 }
});
test('legacy weather preserves rain, water and elapsed time while gaining a saved forecast',()=>{
 const w={version:1,pattern:'wetToDry',elapsed:212,rain:.25,wetness:.43,sectors:Array(32).fill(.43)};
 const sectors=[...w.sectors];migrateWeather(w,{seed:71});
 assert.equal(w.version,2);assert.equal(w.elapsed,212);assert.equal(w.rain,.25);assert.equal(w.wetness,.43);assert.deepEqual(w.sectors,sectors);
 assert.equal(rainAt(w),.25);const saved=structuredClone(w);migrateWeather(w,{seed:99});assert.deepEqual(w,saved);
});
test('career race forecast changes without resetting current rain or surface water',()=>{
 const career=newCareer({driverName:'Weather QA',teamIndex:2}),w=createWeekend(career,{aiSeed:42});
 advanceWeather(w.weather,360);const prior=structuredClone(w.weather),reference=w.weather;
 startRaceWeather(w);assert.equal(w.weather,reference);assert.equal(w.weather.elapsed,0);
 assert.equal(w.weather.rain,prior.rain);assert.equal(w.weather.wetness,prior.wetness);assert.deepEqual(w.weather.sectors,prior.sectors);
 assert.notEqual(w.weather.seed,prior.seed);assert.notDeepEqual(w.weather.points,prior.points);
 const next=structuredClone(w.weather);startRaceWeather(w);assert.deepEqual(w.weather,next);
});
test('weather seed is independent of player tyres and scales fronts for race length',()=>{
 const setup={track:'northline',laps:16,fuel:19,weather:'dynamic',aiSeed:123};
 const a=new Race({...setup,tyre:'M'}),b=new Race({...setup,tyre:'S'}),c=new Race({...setup,tyre:'M',aiSeed:124});
 assert.deepEqual(a.weather,b.weather);assert.notDeepEqual(a.weather.points,c.weather.points);
 assert.ok(raceWeatherDuration(24,8000)>raceWeatherDuration(8,5000));
});
test('forecast describes holding light rain and warns when it will strengthen',()=>{
 const w=constant(.4,.5);assert.match(forecast(w),/Light rain.*holding/);
 w.points=[[0,.4],[120,.4],[180,.9],[700,.9]];assert.match(forecast(w),/Heavier rain in 3 min/);
 const p=projectWeather(w,180);assert.match(forecast(p),/Heavy rain/);
});

test('varied forecasts give roughly one in four sessions completely dry weather, while retaining every wet scenario',()=>{
 let dry=0;const wet=new Set();
 for(let seed=1;seed<=2000;seed++){
  const w=createWeather('dynamic',{seed,duration:1500});
  if(w.scenario==='dry'){
   dry++;assert.equal(w.wetness,0);assert.ok(w.points.every(([,rain])=>rain===0));
  }else wet.add(w.scenario);
 }
 assert.ok(dry>440&&dry<560,`${dry}/2000 dry forecasts`);
 assert.equal(wet.size,5);
});
test('wet-biased career events can have a dry weekend; that choice persists into the race and across reloads',()=>{
 const profile={driverName:'Weather test',teamIndex:2};let dry=0,wet=0;
 for(let seed=1;seed<=200;seed++){
  const career=newCareer(profile);career.round=career.seasonOrder.indexOf('alpine')+1;
  const w=createWeekend(career,{aiSeed:42,weatherSeed:seed});
  if(w.setup.weather==='dry'){
   dry++;assert.equal(w.weather.scenario,'dry');
   const saved=JSON.parse(JSON.stringify(w));startRaceWeather(saved);
   assert.equal(saved.weather.scenario,'dry');assert.equal(saved.weather.wetness,0);
   assert.ok(saved.weather.points.every(([,rain])=>rain===0));
  }else{wet++;assert.equal(w.setup.weather,'sustainedRain');}
 }
 assert.ok(dry>30&&dry<70,`${dry}/200 dry Alpine weekends`);assert.ok(wet>0);
 for(const pattern of ['intermediate','sustainedRain','wetToDry','showers','lateRain'])
  for(let seed=1;seed<=20;seed++)assert.equal(createWeather(pattern,{seed}).scenario,pattern);
});
