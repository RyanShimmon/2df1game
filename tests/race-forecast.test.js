import test from 'node:test';
import assert from 'node:assert/strict';
import {createWeather,raceForecast,advanceWeather,recommendedTyre} from '../src/weather.js';
import {Race} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {createWeekend,startRaceWeather,finishQualifyingStage,recordLap,prepareRace} from '../src/weekend.js';
for(const pattern of ['dry','intermediate','sustainedRain','wetToDry','lateRain','showers','dynamic'])test(`${pattern}: garage forecast covers the whole race without changing its plan`,()=>{
 const w=createWeather(pattern,{seed:42,duration:1200});advanceWeather(w,30);
 const before=structuredClone(w),f=raceForecast(w,{duration:1193,laps:24});
 assert.deepEqual(w,before);assert.deepEqual(f,raceForecast(JSON.parse(JSON.stringify(w)),{duration:1193,laps:24}));
 assert.equal(f.segments[0].start,0);assert.equal(f.segments.at(-1).end,1193);
 for(const [i,segment] of f.segments.entries()){
  if(i)assert.equal(segment.start,f.segments[i-1].end);
  assert.ok(segment.end>segment.start);assert.ok(segment.minWater>=0&&segment.maxWater<=1);
  assert.ok(segment.firstLap>=1&&segment.lastLap<=24&&segment.lastLap>=segment.firstLap);
  const live=structuredClone(w);for(let t=0;t<segment.start;t++)advanceWeather(live,1);
  assert.equal(recommendedTyre(live.wetness),segment.tyre);
 }
});
test('briefing distinguishes rainfall from the wet track that remains after rain stops',()=>{
 const w=createWeather('dry',{seed:1,wetness:1,initialRain:0});
 const f=raceForecast(w,{duration:600,laps:14});assert.equal(f.segments[0].label,'Rain stopped');
 assert.equal(f.segments[0].tyre,'W');assert.ok(f.segments.some(s=>s.tyre==='I'));
 assert.equal(f.segments.at(-1).tyre,'M');
});
test('Harbour briefing uses the same saved race weather that reaches the actual starting grid',()=>{
 const c=newCareer({driverName:'Forecast',teamIndex:2});c.round=4;const w=createWeekend(c,{tyre:'S',aiSeed:42});
 for(let stage=0;stage<3;stage++){for(const [i,id] of w.active.entries())recordLap(w,id,id===21?25:30+i,10+i);finishQualifyingStage(w,c.upgrades,c.profile);}
 startRaceWeather(w);const before=structuredClone(w.weather),brief=raceForecast(w.weather,{duration:w.setup.weatherDuration,laps:w.setup.laps});
 assert.ok(brief.segments.length);assert.equal(w.setup.laps,12);assert.equal(w.setup.weather,'dynamic');
 const r=new Race(w.setup,c.upgrades,'career',c.profile);prepareRace(r,w,'M1');
 assert.deepEqual(r.weather,before);assert.deepEqual(raceForecast(r.weather,{duration:w.setup.weatherDuration,laps:w.setup.laps}),brief);
});
