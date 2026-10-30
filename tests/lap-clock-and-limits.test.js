import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,updateTrackLimits,selectTrack} from '../src/core.js';
import {currentLapTime} from '../src/sectors.js';
import {createWeekend,beginQualifying} from '../src/weekend.js';
import {newCareer} from './career-fixture.js';
const profile={driverName:'Clock tester',teamIndex:2};
const qualifying=()=>{const career=newCareer(profile),w=createWeekend(career,{aiSeed:42,tyre:'M'});return beginQualifying(w,career.upgrades,profile);};
const excursion=car=>{
 const messages=[];
 for(let i=0;i<30;i++){const message=updateTrackLimits(car,1/60,85);if(message)messages.push(message);}
 for(let i=0;i<30;i++)updateTrackLimits(car,1/60,0);
 return messages;
};
test.afterEach(()=>selectTrack('northline'));
for(const state of ['out','in'])test(`${state} lap excursions warn without deleting a lap or applying race penalties`,()=>{
 const q=qualifying(),c=q.player;c.qState=state;c.qStart=null;
 for(let n=0;n<4;n++){
  const messages=excursion(c);
  assert.equal(messages.length,1);assert.match(messages[0],/Track limits warning/);
  assert.doesNotMatch(messages[0],/deleted/i);assert.equal(c.qInvalid,false);
 }
 assert.equal(c.penalty,0);assert.equal(c.penaltySecondsTotal,0);
});
test('only an active qualifying timed lap is deleted; its running clock keeps ticking',()=>{
 const q=qualifying(),c=q.player;c.qState='out';q.time=20;q.crossLine(c);
 q.time=32.125;assert.equal(currentLapTime(q),12.125);
 assert.match(excursion(c)[0],/Lap deleted/);assert.equal(c.qInvalid,true);
 q.time=34;assert.equal(currentLapTime(q),14);
 q.crossLine(c);assert.equal(c.qState,'in');assert.equal(currentLapTime(q),null);
 assert.equal(q.weekend.results.length,0);
 assert.match(excursion(c)[0],/Track limits warning/);
});
test('lap clock is blank during untimed qualifying states and runs past zero for an eligible lap',()=>{
 const q=qualifying(),c=q.player;
 for(const state of ['garage','out','in','stranded']){c.qState=state;c.qStart=null;assert.equal(currentLapTime(q),null);}
 c.qState='out';q.time=q.stage.duration-q.stageStart-5;q.crossLine(c);
 q.time+=28.4;q.weekend.elapsed=q.stage.duration;
 assert.ok(Math.abs(currentLapTime(q)-28.4)<1e-8);
 q.crossLine(c);assert.ok(Math.abs(c.lastLap-28.4)<1e-8);assert.equal(currentLapTime(q),null);
});
test('race clock starts at lights out, resets at each finish crossing and holds the final lap',()=>{
 const r=new Race({track:'northline',laps:2,raceFormat:'sprint',fuel:5,tyre:'M',weather:'dry',aiSeed:42});
 const c=r.player;r.cars=[c];c.player=false;
 assert.equal(currentLapTime(r),0);r.step(.05);assert.equal(currentLapTime(r),0);
 r.countdown=0;let crossings=0;
 for(let i=0;i<60*150&&!r.done;i++){
  const previous=c.lapStart;r.step(1/60);
  if(c.lapStart!==previous){crossings++;if(!c.finished)assert.ok(currentLapTime(r)>=0&&currentLapTime(r)<=1/60+.00001);}
  else if(!c.finished)assert.equal(currentLapTime(r),r.time-c.lapStart);
 }
 assert.ok(r.done);assert.equal(crossings,2);assert.equal(currentLapTime(r),c.lastLap);
 r.time+=3;assert.equal(currentLapTime(r),c.lastLap);
});
