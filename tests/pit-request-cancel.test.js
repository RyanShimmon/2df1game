import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,sample} from '../src/core.js';
import {WEEKENDS} from '../src/calendar.js';
import {newCareer} from './career-fixture.js';
import {createWeekend,prepareRace} from '../src/weekend.js';

for(const mode of ['quick','career'])for(const raceFormat of ['grandPrix','sprint'])
test(`${mode} ${raceFormat}: cancelling keeps the tyre choice but releases the pit entry`,()=>{
 const profile={driverName:'Pit cancellation',teamIndex:2};
 const setup={track:'velocity',laps:raceFormat==='sprint'?12:32,fuel:37,tyre:'M',weather:'dry',aiSeed:42,raceFormat,tyreTemperatureEnabled:false};
 const r=new Race(setup,{},mode,profile),p=r.player;
 if(mode==='career'){
  const career=newCareer(profile);career.round=WEEKENDS.findIndex(w=>(w.raceFormat || 'grandPrix')===raceFormat)+1;
  const w=createWeekend(career,setup);w.phase='R';w.grid=Array.from({length:22},(_,i)=>i);prepareRace(r,w,'M1');
  assert.equal(r.setup.raceFormat,raceFormat);
  r.nextSetId=p.tyreInventory.find(s=>s.compound==='I').id;
 }else r.nextSetId='quick-I';
 r.nextTyre='I';r.cars=[p];r.countdown=0;r.time=10;
 const place=()=>{
  const road=sample(TRACK.pitEntry),angle=road.angle+.45,edge=TRACK.width/2+1;
  Object.assign(p,{s:TRACK.pitEntry-5*Math.cos(.45),offset:edge,x:road.x-Math.sin(road.angle)*edge-Math.cos(angle)*5,
   y:road.y+Math.cos(road.angle)*edge-Math.sin(angle)*5,angle,motionAngle:angle,speed:75,pit:null,garage:false,fuel:20});
 };
 place();r.requestPit();assert.equal(r.pitRequested,true);
 assert.ok(Number.isFinite(r.pitEntryTarget(p,true)));
 const choice=r.nextSetId;r.requestPit();
 assert.equal(r.pitRequested,false);assert.equal(p.ai.pitEntryS,null);
 assert.equal(r.nextTyre,'I');assert.equal(r.nextSetId,choice);
 for(let i=0;i<30;i++)r.stepPlayer(p,1/60,{throttle:true});
 assert.equal(p.pit,null,'crossing a painted entrance after cancellation must not engage assistance');
 place();r.requestPit();
 for(let i=0;i<30&&!p.pit;i++)r.stepPlayer(p,1/60,{throttle:true});
 assert.ok(p.pit,'requesting again allows the next genuine entry');
 const entered=p.pit;r.requestPit();assert.equal(p.pit,entered,'cannot cancel an already entered pit lane');
});
