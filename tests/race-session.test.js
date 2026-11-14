import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,gridSlot,sample,newCareer,completedRaceLaps,raceProgress} from '../src/core.js';
import {createWeekend,prepareRace} from '../src/weekend.js';
import {beginRaceSession,raceSnapshot,restartPenalty,restoreRaceSession} from '../src/race-session.js';
import {recordSessionLap} from '../src/sectors.js';

const disk=x=>JSON.parse(JSON.stringify(x));
function weekend(mode,laps=24,position=8){
 const setup={track:'riviera',tyre:'M',fuel:laps*1.15,laps,startingPosition:position,weather:'dynamic',aiSeed:7707};
 const career=newCareer({driverName:'Tester',teamIndex:2});
 let race;
 if(mode==='career'){
  const w=career.weekend=createWeekend(career,setup);
  Object.assign(w.setup,{track:'riviera',laps,raceFormat:laps===12?'sprint':'grandPrix'});
  w.phase='R';w.grid=Array.from({length:21},(_,i)=>i);w.grid.splice(position-1,0,21);
  w.inventories[21].find(t=>t.id==='M1').wear=.18;
  race=new Race(w.setup,career.upgrades,mode,career.profile);
  prepareRace(race,w,'M1');
 }else race=new Race(setup);
 return {race,career,session:beginRaceSession(race,career)};
}
for(const mode of ['quick','career'])for(const laps of [12,24])test(mode+' '+laps+' laps: checkpoint keeps field, tyre stock, weather, lap deficits and real fuel',()=>{
 const {race:r,session,career}=weekend(mode,laps),leader=r.cars[2],p=r.player,out=r.cars[0];
 const completed=laps-3,L=TRACK.length;
 for(const c of r.cars)Object.assign(c,{s:(completed-1)*L+500+c.id*30,completedLaps:completed-1});
 Object.assign(leader,{s:completed*L+1000,completedLaps:completed});
 Object.assign(p,{s:completed*L+800,completedLaps:completed,stops:2,wear:.66,wheelWear:Array(4).fill(.66),
  lapStartFuel:3.2,fuel:2.73,penalty:2,bestLap:33.5,drive:'push'});
 p.used.add('S');if(p.tyreSet)p.tyreSet.wear=.66;
 out.dnf=true;r.time=509;r.weather.elapsed=407;
 p.pit={stage:'service',penaltyRemaining:1.25,serviced:false};
 recordSessionLap(r.sectors,21,33.5);
 const order=r.order().map(c=>c.id);
 session.current=raceSnapshot(r);
 const saved=disk(session),restored=restoreRaceSession(saved,career),c=restored.player;
 assert.equal(restored.countdown,4);assert.equal(restored.time,509);assert.equal(restored.weather.elapsed,407);
 assert.deepEqual(restored.order().map(c=>c.id),order);assert.equal(c.s,completed*L+gridSlot(1).s);
 assert.equal(c.speed,0);assert.equal(c.penalty,3.25);assert.equal(c.stops,2);assert.equal(c.wear,.66);
 assert.equal(c.fuel,3.2);assert.equal(c.drive,'push');assert.equal(restored.pitRequested,true);
 assert.equal(restored.cars[0].dnf,true);assert.deepEqual(c.used,new Set(['M','S']));
 assert.equal(completedRaceLaps(c),completed);assert.equal(completedRaceLaps(restored.cars[1]),completed-1);
 assert.equal(restored.sectors.fastestLap.time,33.5);assert.equal(c.sectorTiming.active,0);
 if(mode==='career'){assert.equal(c.tyreSet,career.weekend.inventories[21].find(t=>t.id==='M1'));assert.equal(c.tyreSet.wear,.66);}
 saved.current=raceSnapshot(restored);
 const twice=restoreRaceSession(disk(saved),career);
 assert.equal(twice.player.s,c.s);assert.equal(twice.player.fuel,c.fuel);
 // The first crossing starts the interrupted lap. Only the subsequent crossing completes it.
 const pos=sample(-.1);Object.assign(c,{x:pos.x,y:pos.y,angle:pos.angle,motionAngle:pos.angle,s:completed*L-.1,speed:90});
 restored.cars=[c];restored.countdown=0;restored.step(1/60,{});
 assert.equal(completedRaceLaps(c),completed);assert.equal(c.gridLap,undefined);assert.equal(c.lastLap,0);
 assert.equal(c.bestLap,33.5);assert.ok(raceProgress(c)>=completed*L);
 c.s=(completed+1)*L-.1;Object.assign(c,{x:pos.x,y:pos.y,angle:pos.angle,motionAngle:pos.angle,speed:90});
 restored.step(1/60,{});assert.equal(completedRaceLaps(c),completed+1);assert.ok(c.lapStartFuel<3.2);
});
for(const mode of ['quick','career'])for(const start of [8,20,22])test(mode+' restart from P'+start+' restores original event and stacks penalties after reload',()=>{
 const {race:r,session,career}=weekend(mode,24,start),initial=disk(session.start);
 r.player.wear=.9;r.player.fuel=1;r.player.stops=3;r.player.drive='push';r.player.used.add('H');
 if(r.player.tyreSet)r.player.tyreSet.wear=.9;
 r.player.s=TRACK.length*21+50;r.player.completedLaps=21;r.weather.elapsed+=400;
 session.current=raceSnapshot(r);
 let saved=disk(session);
 for(let n=1;n<=4;n++){
  const before=restartPenalty(saved);
  const fresh=restoreRaceSession(saved,career,{restart:true}),c=fresh.player;
  assert.deepEqual(before,{grid:Math.min(22,start+5*n),seconds:Math.max(0,start+5*n-22)});
  assert.equal(c.gridPosition,before.grid);assert.equal(fresh.order().indexOf(c)+1,before.grid);
  assert.equal(c.penalty,before.seconds);assert.equal(c.penaltySecondsTotal,before.seconds);
  assert.equal(completedRaceLaps(c),0);assert.equal(fresh.time,0);assert.equal(fresh.countdown,4);
  assert.equal(c.stops,0);assert.equal(c.fuel,initial.cars.find(c=>c.id===21).fuel);
  assert.deepEqual(c.used,new Set(['M']));assert.deepEqual(fresh.weather,initial.weather);
  assert.equal(c.wear,initial.cars.find(c=>c.id===21).state.wear);
  saved.current=raceSnapshot(fresh);saved=disk(saved);
  assert.equal(restoreRaceSession(saved,career).player.penalty,before.seconds);
  assert.deepEqual(saved.start,initial);
 }
});
test('an old career checkpoint cannot resume into the next round',()=>{
 const {career,session}=weekend('career');career.round++;assert.equal(restoreRaceSession(session,career),null);
});

test('a quick race checkpoint for an unavailable track cannot resume on a substitute circuit',()=>{
 const {session}=weekend('quick');
 session.setup.track='unavailable-circuit';
 assert.equal(restoreRaceSession(session,null),null);
});
