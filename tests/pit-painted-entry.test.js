import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,PIT_LANE,sample,samplePit,crossesPitEntry,pitEntranceLocation} from '../src/core.js';
import {CIRCUITS} from '../src/tracks.js';
import {newCareer} from './career-fixture.js';
import {createWeekend,QualifyingRun} from '../src/weekend.js';

function crossing(along,lap=0,reverse=false){
 const road=sample(TRACK.pitEntry+along),angle=road.angle+.45,edge=TRACK.width/2+1;
 const x=road.x-Math.sin(road.angle)*edge,y=road.y+Math.cos(road.angle)*edge,ds=5*Math.cos(.45);
 const before={x:x-Math.cos(angle)*5,y:y-Math.sin(angle)*5,s:lap*TRACK.length+TRACK.pitEntry+along-ds};
 const after={x:x+Math.cos(angle)*5,y:y+Math.sin(angle)*5,s:lap*TRACK.length+TRACK.pitEntry+along+ds};
 return {before:reverse?after:before,after:reverse?before:after,angle:reverse?angle+Math.PI:angle};
}
for(const track of CIRCUITS)test(`${track.name}: forward crossings along the painted pit entrance are recognised`,()=>{
 new Race({track:track.id,laps:12,fuel:15,tyre:'M'});
 for(const along of [-30,-20,0,20,35]){
  const {before,after}=crossing(along,2);
  assert.ok(pitEntranceLocation(after.x,after.y).separation<PIT_LANE.width/2,'arrival is on pit asphalt');
  assert.equal(crossesPitEntry(before,after,2*TRACK.length+TRACK.pitEntry),true,`missed marked entrance at ${along}`);
  assert.equal(crossesPitEntry(before,after,3*TRACK.length+TRACK.pitEntry),false,'wrong lap remains rejected');
  assert.equal(crossesPitEntry(after,before,2*TRACK.length+TRACK.pitEntry),false,'reverse crossing remains rejected');
 }
 for(const along of [-90,75,180]){
  const {before,after}=crossing(along);
  assert.equal(crossesPitEntry(before,after,TRACK.pitEntry),false,'unmarked side entry remains rejected');
 }
});
for(const along of [-20,20,35])test(`Copper Canyon qualifying returns to service through the painted entry at ${along}`,()=>{
 const career=newCareer({driverName:'Pit test',teamIndex:2});career.round=career.seasonOrder.indexOf('canyon')+1;
 const w=createWeekend(career,{laps:32,fuel:35,tyre:'M',weather:'dry'});
 const q=new QualifyingRun(w,'M1',career.upgrades,{driverName:'Pit test',teamIndex:2}),p=q.player;q.cars=[p];q.autoPitLimiter=true;
 assert.equal(TRACK.id,'canyon');
 q.time=10;p.qState='out';q.crossLine(p);q.time=45;q.crossLine(p);
 assert.equal(p.qState,'in');assert.equal(q.pitRequested,true);
 const {before,angle}=crossing(along,2);
 Object.assign(p,{...before,pit:null,garage:false,speed:75,angle,motionAngle:angle,fuel:2});
 p.ai.pitEntryS=null;
 for(let i=0;i<30&&!p.pit;i++)q.step(1/60,{throttle:true});
 assert.ok(p.pit,'automatic in-lap entry engages');
 const position={x:p.x,y:p.y,s:p.s};q.step(1/60,{});
 assert.ok(Math.hypot(p.x-position.x,p.y-position.y)<3,'handover preserves the physical car position');
 assert.ok(p.s>=position.s,'handover does not reverse completed track progress');
 for(let i=0;i<3000&&!p.garage;i++)q.step(1/60,{});
 assert.equal(p.stops,1);assert.equal(p.garage,true);assert.equal(p.qState,'garage');
});
