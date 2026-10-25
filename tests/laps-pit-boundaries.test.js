import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,PIT_LANE,PIT_MARKERS,makePitLane,pitEntranceLocation,clamp,angleDiff,sample,samplePit,nearest,raceProgress,updateRaceLaps,liveInterval} from '../src/core.js';
const setup={laps:12,fuel:14,tyre:'M'};
function race(){const r=new Race(setup,{engine:0,aero:0,tyres:0,crew:0});r.countdown=0;return r;}
test('painted pit entry and exit exactly match assisted-route endpoints',()=>{
 for(const [marker,distance,s] of [[PIT_MARKERS.entry,0,TRACK.pitEntry],[PIT_MARKERS.exit,PIT_LANE.length,TRACK.pitExit]]) {
  const path=samplePit(distance),road=sample(s);
  assert.equal(marker.x,path.x);assert.equal(marker.y,path.y);
  assert.ok(Math.abs(nearest(marker.x,marker.y).dist-TRACK.width/2)<1e-6);
 }
});
test('pit limiting begins at entry rather than invisibly before its line and ends at exit',()=>{
 const r=race(),p=r.player;r.cars=[p];p.s=TRACK.pitEntry-70;let loc=sample(p.s);
 Object.assign(p,{x:loc.x,y:loc.y,angle:loc.angle,speed:120});r.pitRequested=true;
 r.stepPlayer(p,.01,{throttle:true});assert.equal(p.pit,null);assert.equal(r.pitLimiter,false);assert.ok(p.speed>80);
 p.s=TRACK.pitEntry-1;loc=sample(p.s);Object.assign(p,{x:loc.x-Math.sin(loc.angle)*104,y:loc.y+Math.cos(loc.angle)*104,angle:loc.angle,motionAngle:loc.angle,speed:120});
 r.stepPlayer(p,.02,{throttle:true});assert.ok(p.pit);assert.equal(r.pitLimiter,true);assert.equal(p.speed,80);
 p.pit.serviced=true;p.pit.distance=PIT_LANE.length-1;
 r.stepPit(p,.05,{throttle:true});assert.equal(p.pit,null);assert.equal(r.pitLimiter,false);
});
test('a lapped car passing on the road cannot take the leading car’s race position',()=>{
 const r=race(),p=r.player,other=r.cars[0];r.cars=[p,other];
 Object.assign(p,{s:2*TRACK.length+500,completedLaps:2});
 Object.assign(other,{s:TRACK.length+490,completedLaps:1});
 assert.equal(r.order()[0],p);
 other.s+=30;assert.equal(r.order()[0],p);
 // Coordinates can be rebased for routing without dropping completed laps.
 p.s=500;other.s=520;assert.equal(r.order()[0],p);
 assert.equal(raceProgress(p),2*TRACK.length+500);
});
test('completed laps survive repeated coordinate wraps and crossing backwards does not grant a lap',()=>{
 const p={s:5,completedLaps:2};assert.equal(updateRaceLaps(p,TRACK.length-5),true);assert.equal(p.completedLaps,3);
 assert.equal(raceProgress(p),3*TRACK.length+5);
 const old=p.s;p.s=TRACK.length-5;assert.equal(updateRaceLaps(p,old),false);assert.equal(p.completedLaps,2);
});
test('live intervals include unserved penalties without reordering the track positions',()=>{
 const r=race(),p=r.player,other=r.cars[0];r.cars=[p,other];
 p.s=1000;p.penalty=5;other.s=900;
 assert.equal(r.order()[0],p);assert.equal(liveInterval(p,p),'+5.0 · +5s PEN');
 other.speed=200;other.penalty=5;assert.equal(liveInterval(p,other),'+5.5 · +5s PEN');
 other.s=p.s-TRACK.length-100;assert.equal(liveInterval(p,other),'+1 LAP · +5s PEN');
 other.penalty=0;assert.equal(liveInterval(p,other),'+1 LAP');
});
test('live finish order remains on-track while final classification applies time penalties',()=>{
 const r=race(),p=r.player,other=r.cars[0];r.cars=[p,other];
 Object.assign(p,{s:12*TRACK.length,finished:true,trackFinishTime:100,finishTime:105,penalty:5});
 Object.assign(other,{s:12*TRACK.length,finished:true,trackFinishTime:102,finishTime:102,penalty:0});
 assert.equal(r.order()[0],p);assert.equal(r.classification()[0],other);
});

test('requesting a stop while staying on the circuit never captures the car',()=>{
 const r=race(),p=r.player;r.cars=[p];r.pitRequested=true;
 p.s=TRACK.pitEntry-1;const loc=sample(p.s);
 Object.assign(p,{x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:120});
 for(let i=0;i<25;i++) r.stepPlayer(p,.02,{throttle:true});
 assert.equal(p.pit,null);assert.equal(r.pitLimiter,false);assert.equal(r.pitRequested,true);
});
test('the original pit route is trimmed at both exact track-edge intersections',()=>{
 assert.ok(Math.abs(nearest(PIT_MARKERS.entry.x,PIT_MARKERS.entry.y).dist-TRACK.width/2)<1e-6);
 assert.ok(Math.abs(nearest(PIT_MARKERS.exit.x,PIT_MARKERS.exit.y).dist-TRACK.width/2)<1e-6);
 for(const point of PIT_LANE.pts) assert.ok(nearest(point.x,point.y).dist>=TRACK.width/2-1e-6);
});
test('entering the pit preserves the car’s physical position and completed race distance',()=>{
 const r=race(),p=r.player;const loc=samplePit(30);
 Object.assign(p,{s:TRACK.length+TRACK.pitEntry+loc.progress,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:80});
 const before={x:p.x,y:p.y,s:p.s};r.enterPit(p);r.stepPit(p,1/60,{});
 assert.ok(Math.hypot(p.x-before.x,p.y-before.y)<3);assert.ok(p.s>=before.s && p.s-before.s<3);
});

test('AI rejoins from the outside pit exit without snapping onto the track centre',()=>{
 const r=race(),c=r.cars[0];c.s=TRACK.pitEntry;c.speed=80;r.enterPit(c);
 c.pit.serviced=true;c.pit.distance=PIT_LANE.length-1;r.stepPit(c,.05,{});
 assert.equal(c.pit,null);assert.ok(c.offset>TRACK.width/2-1);
 const before={x:c.x,y:c.y};r.stepAI(c,1/60);
 assert.ok(Math.hypot(c.x-before.x,c.y-before.y)<4);
});

test('trimming preserves the original pit route positions rather than shifting the lane',()=>{
 const originalEntry=TRACK.length+TRACK.mainStraight.from+90,originalSpan=TRACK.mainStraight.length-180;
 const ease=v=>{const t=Math.max(0,Math.min(1,v));return t*t*t*(t*(t*6-15)+10);};
 for(const point of PIT_LANE.pts) {
  const progress=point.progress+TRACK.pitEntry-originalEntry;
  const road=sample(originalEntry+progress);
  const offset=180*ease(progress/400)*ease((originalSpan-progress)/400);
  assert.ok(Math.hypot(point.x-(road.x-Math.sin(road.angle)*offset),point.y-(road.y+Math.cos(road.angle)*offset))<.02);
 }
});

test('rebuilding pit geometry keeps both original route intersections stable',()=>{
 const rebuilt=makePitLane();
 assert.equal(rebuilt.length,PIT_LANE.length);assert.deepEqual(rebuilt.pts,PIT_LANE.pts);
});

test('a requested stop captures physical turn-ins beyond the old 80m entry window',()=>{
 for(const distance of [0,60,150,240]) {
  const r=race(),p=r.player;r.cars=[p];r.pitRequested=true;
  const loc=samplePit(distance);
  Object.assign(p,{s:TRACK.pitEntry+loc.progress,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:60});
  r.stepPlayer(p,1/60,{throttle:true});
  assert.ok(p.pit,`missed paved entrance at ${distance}m`);
  for(let i=0;i<4000 && p.pit;i++) r.stepPit(p,1/60,{});
  assert.equal(p.stops,1);assert.equal(p.pit,null);
 }
});
test('entry detection excludes the racing surface and nearby grass',()=>{
 const r=race(),p=r.player;r.pitRequested=true;
 const loc=samplePit(150),road=sample(TRACK.pitEntry+loc.progress);
 Object.assign(p,{s:TRACK.pitEntry+loc.progress,x:road.x,y:road.y,angle:road.angle,motionAngle:road.angle,speed:60});
 r.stepPlayer(p,1/60,{throttle:true});assert.equal(p.pit,null);
 Object.assign(p,{x:loc.x-Math.sin(loc.angle)*70,y:loc.y+Math.cos(loc.angle)*70,angle:loc.angle,motionAngle:loc.angle});
 assert.ok(pitEntranceLocation(p.x,p.y).separation>38);
 r.stepPlayer(p,1/60,{throttle:true});assert.equal(p.pit,null);
});
test('painted pit asphalt retains the full original tails for a flush boundary clip',()=>{
 assert.ok(nearest(PIT_LANE.surfacePts[0].x,PIT_LANE.surfacePts[0].y).dist<1);
 assert.ok(nearest(PIT_LANE.surfacePts.at(-1).x,PIT_LANE.surfacePts.at(-1).y).dist<1);
});

test('late entry preserves off-centre placement rather than snapping sideways',()=>{
 const r=race(),p=r.player;r.pitRequested=true;const loc=samplePit(170);
 Object.assign(p,{s:TRACK.pitEntry+loc.progress,x:loc.x-Math.sin(loc.angle)*20,y:loc.y+Math.cos(loc.angle)*20,angle:loc.angle,motionAngle:loc.angle,speed:60});
 r.stepPlayer(p,1/60,{throttle:true});assert.ok(p.pit);
 const before={x:p.x,y:p.y};r.stepPit(p,1/60,{});
 assert.ok(Math.hypot(p.x-before.x,p.y-before.y)<3);
});

test('steering from the racing surface into the entrance completes an automatic stop',()=>{
 const r=race(),p=r.player;r.cars=[p];r.pitRequested=true;
 const start=sample(TRACK.pitEntry-110),goal=samplePit(90);
 Object.assign(p,{s:TRACK.pitEntry-110,x:start.x,y:start.y,angle:start.angle,motionAngle:start.angle,speed:70});
 let entered=false;
 for(let i=0;i<4000 && !p.stops;i++) {
  const desired=Math.atan2(goal.y-p.y,goal.x-p.x);
  r.step(1/60,p.pit ? {} : {throttle:p.speed<75,brake:p.speed>78,steer:clamp(angleDiff(desired,p.angle)*3,-1,1)});
  if(p.pit) entered=true;
 }
 assert.ok(entered);assert.equal(p.stops,1);
 for(let i=0;i<3000 && p.pit;i++)r.step(1/60,{});
 assert.equal(p.pit,null);assert.equal(r.pitLimiter,false);
});
