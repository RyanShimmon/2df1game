import test from 'node:test';
import assert from 'node:assert/strict';
import {recordTiming,intervalSeconds,passageTime,createTimingReference,circuitTime,outstandingPenalty} from '../src/timing.js';
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
test('finished gaps include penalties from the actual final classification',()=>{
 assert.equal(intervalSeconds({finished:true,trackFinishTime:100,finishTime:110},{finished:true,trackFinishTime:102,finishTime:102},0),-8);
});

test('a stopped pit car is caught smoothly, through zero, without a stale passage-time jump',()=>{
 const reference=createTimingReference(1000,()=>({speed:100,distanceScale:1}));
 const pit={speed:0,pit:{stage:'service'}},chase={speed:100};
 recordTiming(pit,0,500,1000,reference);recordTiming(chase,0,0,1000,reference);
 for(let tick=1;tick<=60;tick++){
  const t=tick/10;recordTiming(pit,t,500,1000,reference);recordTiming(chase,t,t*100,1000,reference);
  assert.ok(Math.abs(intervalSeconds(pit,chase,t*100)-(5-t))<1e-8);
 }
 // Restarting the pit car must not resurrect its old ten-second passage gap.
 pit.speed=80;recordTiming(pit,6.1,508,1000,reference);recordTiming(chase,6.1,610,1000,reference);
 assert.ok(Math.abs(intervalSeconds(pit,chase,610)+1.02)<1e-8);
});
test('the shared clock follows the circuit across lap boundaries and flyovers',()=>{
 const reference=createTimingReference(1000,s=>({speed:s<500?100:200,distanceScale:1}));
 assert.ok(circuitTime(reference,20)>circuitTime(reference,-20));
 const a={speed:100,x:50,y:50},b={speed:100,x:50,y:50};
 recordTiming(a,10,1100,1000,reference);recordTiming(b,10,900,1000,reference);
 assert.ok(intervalSeconds(a,b,900)>1 && intervalSeconds(a,b,900)<2);
 assert.ok(circuitTime(reference,2100)-circuitTime(reference,1100)>7);
});
test('standing still or driving down the pit lane does not train the racing clock to pit speed',()=>{
 const reference=createTimingReference(1000,()=>({speed:200,distanceScale:1})),original=[...reference.rates];
 const c={speed:80,pit:{stage:'entry'}};recordTiming(c,0,100,1000,reference);
 for(let i=1;i<=50;i++)recordTiming(c,i/10,100+i*8,1000,reference);
 assert.deepEqual(reference.rates,original);
 c.pit=null;c.speed=100;
 for(let i=51;i<=100;i++)recordTiming(c,i/10,500+(i-50)*10,1000,reference);
 assert.ok(reference.rates.some((r,i)=>r>original[i]),'slower genuine racing pace updates estimates');
});
test('unserved penalties alter the single gap, including the portion being served',()=>{
 const reference=createTimingReference(1000,()=>({speed:100,distanceScale:1}));
 const a={speed:100,penalty:5},b={speed:100,penalty:0};
 recordTiming(a,10,500,1000,reference);recordTiming(b,10,400,1000,reference);
 assert.ok(Math.abs(intervalSeconds(a,b,400)+4)<1e-9);
 a.penalty=0;a.pit={stage:'service',penaltyRemaining:5};
 assert.ok(Math.abs(intervalSeconds(a,b,400)+4)<1e-9,'starting service must not instantly erase five seconds');
 a.pit.penaltyRemaining=4;recordTiming(a,11,500,1000,reference);recordTiming(b,11,500,1000,reference);
 assert.ok(Math.abs(intervalSeconds(a,b,500)+4)<1e-9,'elapsed service replaces the pending penalty once');
 assert.equal(outstandingPenalty(a),4);
});
