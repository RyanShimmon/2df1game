import test from 'node:test';
import assert from 'node:assert/strict';
import {recordTiming,intervalSeconds,passageTime} from '../src/timing.js';
const length=8000;
test('a variable-speed interval is the time since the leading car passed this track location',()=>{
 const lead={speed:200},follower={speed:90};
 recordTiming(lead,0,0,length);recordTiming(lead,1,100,length);recordTiming(lead,2,300,length);
 recordTiming(follower,3,150,length);
 assert.equal(passageTime(lead,150),1.25);assert.equal(intervalSeconds(lead,follower,150),1.75);
 follower.speed=330;lead.speed=0;lead.x=follower.x=42;lead.y=follower.y=42;
 assert.equal(intervalSeconds(lead,follower,150),1.75,'speed and overlapping world coordinates do not change timing');
});
test('stopping increases the gap without altering the ahead car’s historic passage times',()=>{
 const lead={speed:100},follower={speed:0};
 recordTiming(lead,0,0,length);recordTiming(lead,1.1,110,length);
 recordTiming(lead,10,110,length);recordTiming(follower,10,105,length);
 assert.ok(Math.abs(passageTime(lead,105)-1.05)<1e-9);assert.equal(intervalSeconds(lead,follower,105),8.95);
 recordTiming(follower,11,105,length);assert.equal(intervalSeconds(lead,follower,105),9.95);
});
test('timing is continuous across the start line and pit service counts as elapsed time',()=>{
 const a={speed:80},b={speed:80};
 recordTiming(a,0,7990,length);recordTiming(a,1,8070,length);
 recordTiming(b,3,8010,length);assert.equal(intervalSeconds(a,b,8010),2.75);
 b.pit={stage:'service'};recordTiming(b,8,8010,length);assert.equal(intervalSeconds(a,b,8010),7.75);
});
test('a recovery jump does not invent timing over untravelled track',()=>{
 const a={speed:20};recordTiming(a,0,0,length);recordTiming(a,1,20,length);recordTiming(a,2,2000,length);
 assert.equal(passageTime(a,1000),null);assert.equal(passageTime(a,2000),2);
});
test('finished gaps use on-track finish times, not penalty-adjusted classification',()=>{
 assert.equal(intervalSeconds({finished:true,trackFinishTime:100,finishTime:110},{finished:true,trackFinishTime:102,finishTime:102},0),2);
});
