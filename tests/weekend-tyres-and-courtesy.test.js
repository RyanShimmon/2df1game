import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,AI_LINE,CIRCUITS,selectTrack,sample,newCareer,estimatedTyreLife,resources} from '../src/core.js';
import {qualifyingLane,racingPoint} from '../src/racecraft.js';
import {createWeekend,migrateWeekend,ensureWeekend,selectableSets,QualifyingRun,recordLap,finishQualifyingStage} from '../src/weekend.js';
const profile={driverName:'Test',teamIndex:2},setup={track:'northline',laps:24,fuel:28,tyre:'S',weather:'dry',aiSeed:42};
test.afterEach(()=>selectTrack('northline'));
test('smaller weekend pool retains physical wear between sessions rather than replenishing stock',()=>{
 const career=newCareer(profile),w=createWeekend(career,setup);career.weekend=w;
 const inv=w.inventories[21],s=inv.find(t=>t.id==='S1');s.wear=.23;s.used=true;s.distance=12000;
 for(const id of w.active)recordLap(w,id,id===21?1:50,0);
 finishQualifyingStage(w,{},profile);
 assert.equal(w.phase,'Q2');assert.equal(ensureWeekend(career,setup),w);
 assert.equal(inv.find(t=>t.id==='S1'),s);assert.equal(s.wear,.23);
 assert.deepEqual(selectableSets(inv,'Q2').filter(t=>['S','M','H'].includes(t.compound)).map(t=>t.id),['H1','M1','S1','S2']);
 assert.equal(selectableSets(inv,'Q2').filter(t=>t.compound==='I').length,2);
 assert.equal(selectableSets(inv,'Q2').filter(t=>t.compound==='W').length,1);
});
test('old saves reduce unused excess sets once while preserving used, worn and selected sets',()=>{
 const c=newCareer(profile),w=createWeekend(c,setup);c.weekend=w;delete w.allocationVersion;delete w.softSetNumbering;
 for(const inv of w.inventories)for(const t of inv)if(t.compound==='S')t.reserved=t.id==='S4';
 for(const inv of w.inventories)for(const t of inv)t.returned=['H2','M3','S5','S6','S7','S8'].includes(t.id);
 const old=w.inventories[21],used=old.find(t=>t.id==='M2'),worn=old.find(t=>t.id==='I3');
 Object.assign(used,{wear:.35,used:true,distance:22000});worn.wear=.1;
 const selected=old.find(t=>t.id==='S3');w.selectedSetId='S3';w.phase='Q2';w.elapsed=107;w.results=[{id:21,time:36,at:90}];
 assert.equal(ensureWeekend(c,setup),w);
 assert.equal(used.wear,.35);assert.equal(used.distance,22000);assert.equal(used.returned,false);
 assert.equal(worn.returned,false);assert.equal(selected.returned,false);assert.equal(w.selectedSetId,selected.id);
 assert.equal(old.find(t=>t.id==='I4').returned,true);assert.equal(old.find(t=>t.id==='W2').returned,true);
 assert.equal(w.phase,'Q2');assert.equal(w.elapsed,107);assert.equal(w.results[0].time,36);
 const before=JSON.stringify(w);migrateWeekend(w);assert.equal(JSON.stringify(w),before);
});
test('average life estimates match balanced wear, carry used condition and reflect modes/upgrades',()=>{
 for(const compound of ['S','M','H','I','W']){
  const water=compound==='W'?.75:compound==='I'?.35:0;
  const r=new Race({...setup,tyre:compound,tyreTemperatureEnabled:false}),c=r.player;
  c.trackWetness=water;c.wear=0;c.wheelWear=[0,0,0,0];
  const fresh=estimatedTyreLife(compound);resources(c,0,TRACK.length);
  assert.ok(Math.abs(fresh-1/c.wear)<1e-8,compound);
  assert.equal(estimatedTyreLife(compound,{wear:.25}),fresh*.75);
  assert.ok(estimatedTyreLife(compound,{upgrades:{tyres:3}})>fresh);
  assert.ok(estimatedTyreLife(compound,{mode:'push'})<fresh);
  assert.ok(estimatedTyreLife(compound,{mode:'save'})>fresh);
  assert.equal(estimatedTyreLife(compound,{wear:1.1}),0);
 }
 assert.ok(estimatedTyreLife('W',{wetness:0})<estimatedTyreLife('W')/3);
});
test('yielding car holds its side for a timed lap and waits before merging into occupied final-corner line',()=>{
 const line={width:126,length:5000,step:100,finalCornerStart:4600,points:Array.from({length:50},()=>({offset:-20,angle:0,curvature:0,distanceScale:1}))};
 const car={id:0,s:2000,speed:180,qState:'out',ai:{yieldSide:-1}},fast={id:1,s:1800,qState:'timed',speed:300,offset:-20};
 const held=qualifyingLane(car,line,[fast]);assert.equal(held.offset,-49,'do not cut across approaching driver');
 fast.s=1400;const clear=qualifyingLane(car,line,[fast]);assert.equal(clear.offset,49);
 car.s=4700;fast.s=4550;
 assert.equal(qualifyingLane(car,line,[fast]).preparing,false);
 assert.equal(qualifyingLane(car,line,[]).preparing,true);
 // A farther driver must not trigger a lane switch across a closer timed car.
 car.s=2000;car.ai.yieldSide=-1;fast.s=1400;
 const close={...fast,id:2,s:1900};
 assert.equal(qualifyingLane(car,line,[fast,close]).offset,-49);
 car.qState='in';assert.equal(qualifyingLane(car,line,[]).preparing,false);
 car.qState='timed';assert.equal(qualifyingLane(car,line,[]),null);
});
for(const track of CIRCUITS)test(`${track.name}: qualifying AI yields, prepares its flying lap and completes an outing`,()=>{
 const w=createWeekend(newCareer(profile),setup);w.setup.track=track.id;w.setup.weather='dry';
 w.weather.pattern='dry';w.weather.wetness=0;w.weather.sectors.fill(0);
 const q=new QualifyingRun(w,'S1',{},profile),c=q.cars[0];q.cars=[c];c.qReleaseAt=0;
 let yielded=0,clear=0,prepared=0,timed=0,maxJump=0;
 for(let i=0;i<60*240&&c.stops===0;i++){
  const x=c.x,y=c.y;q.step(1/60,{});maxJump=Math.max(maxJump,Math.hypot(c.x-x,c.y-y));
  const pos=((c.s%TRACK.length)+TRACK.length)%TRACK.length;
  if(!c.pit&&c.ai.qualifyingLane && pos>TRACK.pitExit+350 && pos<Math.min(AI_LINE.finalCornerStart-50,TRACK.pitEntry-850)){
   if(!c.ai.qualifyingLane.preparing){yielded++;if(Math.abs(c.offset-racingPoint(AI_LINE,c.s).offset)>28)clear++;}
  }
  if(!c.pit&&c.qState==='out'&&c.ai.qualifyingLane?.preparing)prepared++;
  if(c.qState==='timed')timed++;
 }
 assert.equal(c.stops,1,'did not return to service');assert.equal(c.qState,'garage');
 assert.ok(yielded>100&&clear/yielded>.82,`line clearance ${clear}/${yielded}`);
 assert.ok(prepared>5,'never prepared at final corner');assert.ok(timed>100,'no timed lap');
 assert.ok(w.attempts?.[c.id]>0,'no qualifying attempt recorded');assert.ok(maxJump<20,`movement jump ${maxJump}`);
});

test('Q3 AI favour the returned Q3 Soft over spending an equally fresh race set',()=>{
 const w=createWeekend(newCareer(profile),setup);w.phase='Q3';w.active=Array.from({length:22},(_,i)=>i);
 w.weather.pattern='dry';w.weather.wetness=0;w.weather.sectors.fill(0);
 const q=new QualifyingRun(w,'S3',{},profile);
 for(const c of q.cars.filter(c=>!c.player))assert.equal(c.tyreSet.id,'S3');
});
