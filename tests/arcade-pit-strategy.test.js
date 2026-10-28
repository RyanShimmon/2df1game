import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,PIT_MARKERS,nearest,estimatedPitLoss,selectTrack} from '../src/core.js';
test.afterEach(()=>selectTrack('northline'));
for(const track of ['northline','dunes','metro'])test(`${track}: compact-circuit pit estimate matches a physical stop and the engineer briefing`,()=>{
 const r=new Race({track,laps:32,fuel:37,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false},{engineer:3}),c=r.player,m=PIT_MARKERS.entry;
 r.cars=[c];r.countdown=0;r.nextTyre='H';r.pitRandom=()=>.5;
 const road=nearest(m.x,m.y);Object.assign(c,{s:road.s,x:m.x,y:m.y,angle:m.angle,motionAngle:m.angle,speed:80});
 const predicted=estimatedPitLoss(c);assert.equal(r.engineerReport().pitLoss,predicted);
 r.requestPit();r.step(1/60,{});assert.ok(c.pit);
 for(let i=0;i<6000&&c.pit;i++)r.step(1/60,{});
 assert.equal(c.stops,1);assert.equal(c.pit,null);
 // Main-straight bypass at 300 km/h, same tyre service and no queue/penalties.
 const physical=r.time-(TRACK.length-TRACK.pitEntry+TRACK.pitExit)/300;
 assert.ok(Math.abs(predicted-physical)<1,`${predicted} estimated vs ${physical} physical`);
 assert.ok(predicted>10&&predicted<20);
});
