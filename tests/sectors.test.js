import test from 'node:test';
import assert from 'node:assert/strict';
import {createSectorSession,startSectorLap,stopSectorLap,advanceSectors,recordSessionLap} from '../src/sectors.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function driver(id=21){const c={id};startSectorLap(c,0);return c;}
test('actual crossing interpolation gives exact sector and full lap times',()=>{
 const s=createSectorSession(),c=driver();
 advanceSectors(s,c,0,50,0,5,300);
 advanceSectors(s,c,50,98,5,9.8,300);
 advanceSectors(s,c,98,103,9.8,10.3,300);
 near(c.sectorTiming.bars[0].time,10);
 advanceSectors(s,c,103,150,10.3,15,300);
 advanceSectors(s,c,150,198,15,19.8,300);
 advanceSectors(s,c,198,202,19.8,20.2,300);
 near(c.sectorTiming.bars[1].time,10);
 advanceSectors(s,c,202,250,20.2,25,300);
 advanceSectors(s,c,250,298,25,29.8,300);
 const lap=advanceSectors(s,c,298,303,29.8,30.3,300);
 assert.equal(lap.valid,true);near(s.fastestLap.time,30);
 near(lap.time,30);near(lap.at,30);near(c.sectorTiming.bars[2].time,10);
 assert.equal(c.sectorTiming.active,0);
});
function runSector(s,c,index,end,options={}){
 const start=c.sectorTiming.lap.lastAt;
 advanceSectors(s,c,index*100,index*100+50,start,(start+end)/2,300,options);
 return advanceSectors(s,c,index*100+50,(index+1)*100,(start+end)/2,end,300,options);
}
test('bars persist across the finish and are replaced one at a time on the following lap',()=>{
 const s=createSectorSession(),c=driver();
 for(let i=0;i<3;i++)runSector(s,c,i,(i+1)*10);
 const previous=[...c.sectorTiming.bars];assert.ok(previous.every(b=>b.colour==='purple'));
 assert.equal(c.sectorTiming.active,0);
 runSector(s,c,3,41);
 assert.equal(c.sectorTiming.bars[0].colour,'yellow');
 assert.equal(c.sectorTiming.bars[1],previous[1]);assert.equal(c.sectorTiming.bars[2],previous[2]);
 assert.equal(c.sectorTiming.active,1);
});
test('green means a personal improvement, purple beats the entire session, yellow does not improve',()=>{
 const s=createSectorSession(),leader=driver(0),c=driver();
 runSector(s,leader,0,8);runSector(s,c,0,10);assert.equal(c.sectorTiming.bars[0].colour,'green');
 startSectorLap(c,20,300);runSector(s,c,3,29);assert.equal(c.sectorTiming.bars[0].colour,'green');
 startSectorLap(c,40,600);runSector(s,c,6,47);assert.equal(c.sectorTiming.bars[0].colour,'purple');
 startSectorLap(c,60,900);runSector(s,c,9,67);assert.equal(c.sectorTiming.bars[0].colour,'yellow');
 assert.equal(s.bestSectors[0].driverId,21);near(s.bestSectors[0].time,7);
});
test('reverse recrossing cannot create another result or reset a sector clock',()=>{
 const s=createSectorSession(),c=driver();runSector(s,c,0,10);
 const event=c.sectorTiming.event;
 advanceSectors(s,c,100,90,10,12,300);advanceSectors(s,c,90,110,12,14,300);
 assert.equal(c.sectorTiming.event,event);
 advanceSectors(s,c,110,160,14,19,300);advanceSectors(s,c,160,200,19,23,300);
 near(c.sectorTiming.bars[1].time,13);
});
test('untimed pit, invalid and recovery laps cannot set the fastest lap',()=>{
 for(const option of [{pit:true},{invalid:true}]){
  const s=createSectorSession(),c=driver();
  runSector(s,c,0,8,option);runSector(s,c,1,16);runSector(s,c,2,24);
  assert.equal(s.fastestLap,null);assert.ok(s.bestSectors.every(v=>v===null));
  assert.ok(c.sectorTiming.bars.every(b=>b.colour==='invalid'));
 }
 const s=createSectorSession(),c=driver();advanceSectors(s,c,0,300,0,1,300);
 assert.equal(s.fastestLap,null);
});
test('fastest race lap transfers to faster drivers, ties retain the first holder',()=>{
 const s=createSectorSession(),a=driver(0),b=driver(21);
 for(let i=0;i<3;i++)runSector(s,a,i,(i+1)*10);
 assert.deepEqual(s.fastestLap,{driverId:0,time:30});
 for(let i=0;i<3;i++)runSector(s,b,i,(i+1)*9);
 assert.deepEqual(s.fastestLap,{driverId:21,time:27});
 recordSessionLap(s,3,27);assert.equal(s.fastestLap.driverId,21);
});
test('untimed laps cannot populate bars and restarting preserves the previous colours',()=>{
 const s=createSectorSession('Q1'),c=driver();runSector(s,c,0,10);
 const bar=c.sectorTiming.bars[0];stopSectorLap(c);
 advanceSectors(s,c,100,200,10,20,300);assert.equal(c.sectorTiming.active,null);
 assert.equal(c.sectorTiming.bars[1],null);startSectorLap(c,100,600);
 assert.equal(c.sectorTiming.bars[0],bar);assert.equal(c.sectorTiming.active,0);
});
test('Q1, Q2, Q3 and race records are isolated and survive JSON storage',()=>{
 const sessions=['Q1','Q2','Q3','Race'].map(createSectorSession);
 runSector(sessions[0],driver(),0,10);recordSessionLap(sessions[0],21,30);
 assert.deepEqual(JSON.parse(JSON.stringify(sessions[0])),sessions[0]);
 for(const s of sessions.slice(1)){assert.equal(s.fastestLap,null);assert.ok(s.bestSectors.every(v=>v===null));}
});
