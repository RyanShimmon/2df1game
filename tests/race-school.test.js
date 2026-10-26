import test from 'node:test';import assert from 'node:assert/strict';
import {RaceSchool,loadSchool,SCHOOL_KEY} from '../src/school.js';
import {TRACK,sample} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {driveQualifyingOuting} from './qualifying-driver.js';
const storage=()=>({items:new Map(),getItem(k){return this.items.get(k)||null;},setItem(k,v){this.items.set(k,v);}});
function observe(s,q){const step=q.step.bind(q);q.step=(...args)=>{step(...args);s.observe(q);};return q;}
test('two real qualifying outings require a Medium change and retain both laps and used sets',()=>{
 const s=new RaceSchool(),q=observe(s,s.createQualifying());q.cars=[q.player];
 driveQualifyingOuting(q,240);assert.equal(s.state.outings,1);assert.equal(q.player.qState,'garage');assert.ok(q.player.tyreSet.wear>.05);
 q.step(1/60,{});q.step(1/60,{throttle:true});assert.equal(q.player.qState,'garage','Softs cannot launch the mandatory Medium exercise');
 s.state.pickerOpened=true;assert.equal(q.selectGarageSet('M1'),true);assert.equal(s.chooseMedium(q,'M1'),true);for(let i=0;i<400&&!q.player.pit.serviced;i++)q.step(1/60,{});
 q.step(1/60,{});driveQualifyingOuting(q,240);assert.equal(s.state.outings,2);assert.equal(s.state.phase,'qualifyingComplete');
 assert.equal(s.state.lapTimes.length,2);assert.ok(s.state.lapTimes.every(t=>t>20));assert.equal(q.player.tyre,'M');
 assert.ok(q.player.tyreInventory.find(t=>t.id==='S1').wear>0);assert.ok(q.player.tyreSet.wear>0);
});
test('garage checkpoint resumes completed first outing and keeps career untouched',()=>{
 const career=newCareer({driverName:'Real Driver',teamIndex:3}),before=JSON.stringify(career),s=new RaceSchool(),q=observe(s,s.createQualifying());q.cars=[q.player];driveQualifyingOuting(q,240);
 const store=storage();s.save(store);const resumed=new RaceSchool(loadSchool(store)),r=resumed.createQualifying();
 assert.equal(resumed.state.outings,1);assert.ok(r.player.tyreInventory.find(t=>t.id==='S1').wear>0);assert.equal(r.player.qState,'garage');assert.equal(JSON.stringify(career),before);
});
test('deleted training laps advance the outing lesson but remain marked invalid',()=>{
 const s=new RaceSchool(),q=s.createQualifying(),p=q.player;s.lastState='timed';Object.assign(p,{qState:'in',qInvalid:true,lastLap:40});s.observe(q);
 p.stops++;p.qState='garage';assert.equal(s.observe(q),'tyreChange');assert.equal(s.state.outings,1);assert.equal(s.state.lapValid[0],false);assert.equal(q.weekend.results.some(r=>r.id===21),false);assert.equal(s.guide(q).title,'Outing 2: choose Mediums');
});
test('optional practice requires fuel mode, B request and completed pit service with exit',()=>{
 const s=new RaceSchool(),r=s.createPractice(),p=r.player;r.cars=[p];r.countdown=0;r.time=1;
 for(let i=0;i<150;i++){r.step(1/60,{throttle:true});s.observe(r);}
 assert.equal(s.launchSeen,true);p.drive='save';s.observe(r);r.requestPit();s.observe(r);assert.equal(s.requestSeen,true);
 assert.equal(r.pitRequested,true);
 r.enterPit(p);let event=null;for(let i=0;i<6000&&p.pit;i++){r.step(1/60,{});event=s.observe(r)||event;}
 assert.equal(p.stops,1);assert.equal(p.pit,null);assert.equal(event,'practiceComplete');assert.equal(s.state.phase,'complete');
});
test('recovery rejoins asphalt and invalidates an assisted flying lap',()=>{
 const s=new RaceSchool(),q=s.createQualifying(),p=q.player,loc=sample(1000);Object.assign(p,{garage:false,pit:null,qState:'timed',s:1000,x:loc.x+400,y:loc.y+400,speed:40});s.recover(q);
 assert.equal(p.x,loc.x);assert.equal(p.y,loc.y);assert.equal(p.speed,0);assert.equal(p.qInvalid,true);
});
test('bad stored progress is ignored and completed school can be saved independently',()=>{
 const store=storage();store.setItem(SCHOOL_KEY,'broken');assert.equal(loadSchool(store),null);
 const s=new RaceSchool();s.complete();s.save(store);assert.equal(loadSchool(store).phase,'complete');
});

test('after a deleted first lap the required popup Medium selection can depart after service',()=>{
 const s=new RaceSchool(),q=s.createQualifying(),p=q.player;q.cars=[p];s.lastState='timed';Object.assign(p,{qState:'in',qInvalid:true,lastLap:40});s.observe(q);p.stops++;p.qState='garage';s.observe(q);
 assert.equal(q.selectGarageSet('M1'),true);for(let i=0;i<400&&!p.pit.serviced;i++)q.step(1/60,{});
 assert.equal(q.launch(p),false,'compound selection alone must not bypass the physical-set exercise');
 assert.equal(s.chooseMedium(q,'M1'),false,'open the popup first');s.state.pickerOpened=true;assert.equal(s.chooseMedium(q,'M1'),true);
 p.qNeedsRelease=false;assert.equal(q.launch(p),true);assert.equal(p.qState,'out');assert.equal(s.state.outings,1);
});
