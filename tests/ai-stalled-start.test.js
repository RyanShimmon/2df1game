import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,sample,angleDiff,selectTrack} from '../src/core.js';
import {planRacingLane} from '../src/racecraft.js';

test.afterEach(()=>selectTrack('northline'));
const setup={laps:12,fuel:18,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false};
const separated=(a,b)=>{
 const dx=b.x-a.x,dy=b.y-a.y;
 return [a.angle,a.angle+Math.PI/2,b.angle,b.angle+Math.PI/2].some(axis=>{
  const extent=c=>18*Math.abs(Math.cos(c.angle-axis))+12*Math.abs(Math.sin(c.angle-axis));
  return Math.abs(dx*Math.cos(axis)+dy*Math.sin(axis))>=extent(a)+extent(b);
 });
};

test('a stalled launch can be overtaken from rest without a performance advantage',()=>{
 const line={width:126,length:5000,step:50,points:Array.from({length:100},()=>({offset:0,angle:0,curvature:0,distanceScale:1}))};
 for(const player of [false,true]){
 const car={id:0,s:1000,x:1000,y:-28,offset:-28,angle:0,speed:0,driverStyle:{},ai:{}},
  stopped={id:21,s:1060,x:1060,y:-28,offset:-28,angle:0,speed:0,player};
 const lane=planRacingLane(car,line,[stopped],{time:1,blockedLaunch:true,baseOffset:-28,paceAdvantage:()=>0});
 assert.equal(lane.phase,'passing');assert.ok(lane.offset>=10);assert.ok(lane.followingSpeed>0);
 assert.equal(car.ai.lane.launchClearS,stopped.s+80);
 }
});

for(const track of ['northline','dunes','velocity'])for(const startingPosition of [1,11])
 test(`${track}: the field manoeuvres around a stationary P${startingPosition} without collisions or snapped turns`,()=>{
 const race=new Race({...setup,track,startingPosition});race.countdown=0;
 const player=race.player,start={x:player.x,y:player.y,s:player.s};
 const following=race.cars.filter(c=>!c.player&&c.s<player.s),starts=new Map(race.cars.map(c=>[c.id,c.s]));
 const resolve=race.collisions.bind(race);
 race.collisions=()=>{
  for(let i=0;i<race.cars.length;i++)for(let j=i+1;j<race.cars.length;j++)
   assert.ok(separated(race.cars[i],race.cars[j]),`cars ${race.cars[i].id}/${race.cars[j].id} overlapped at ${race.time.toFixed(2)}s`);
  resolve();
 };
 for(let frame=0;frame<16*60;frame++){
  const angles=new Map(race.cars.map(c=>[c.id,c.angle]));race.step(1/60);
  for(const car of following)if(car.s-starts.get(car.id)<260){
   assert.ok(Math.abs(angleDiff(car.angle,sample(car.s).angle))<1.25,'an evasive turn must continue forwards');
   assert.ok(Math.abs(angleDiff(car.angle,angles.get(car.id)))<.05,'steering must turn smoothly, not snap sideways');
  }
 }
 assert.equal(player.s,start.s);assert.equal(player.x,start.x);assert.equal(player.y,start.y);
 assert.ok(following.every(car=>car.s>player.s+55),'every car behind must escape the stalled grid lane');
 assert.ok(race.cars.every(car=>!car.contacts&&!car.trackLimits));
});

for(const blockedSide of [-1,1])test(`a stopped car can be passed on the ${blockedSide<0?'right':'left'} when the other side is occupied`,()=>{
 const line={width:160,length:5000,step:50,points:Array.from({length:100},()=>({offset:0,angle:0,curvature:0,distanceScale:1}))};
 const car={id:0,s:1000,x:1000,y:0,offset:0,angle:0,speed:15,driverStyle:{},ai:{}},
 stopped={id:1,s:1060,x:1060,y:0,offset:0,angle:0,speed:0},
 blocker={id:2,s:1030,x:1030,y:40*blockedSide,offset:40*blockedSide,angle:0,speed:0};
 const lane=planRacingLane(car,line,[stopped,blocker],{time:25,blockedLaunch:true,paceAdvantage:()=>0});
 assert.equal(lane.phase,'passing');assert.ok(lane.offset*blockedSide<-30,'use the independent clear side');
});

test('a follower chooses an independent clear side instead of copying the escape queue',()=>{
 const line={width:160,length:5000,step:50,points:Array.from({length:100},()=>({offset:0,angle:0,curvature:0,distanceScale:1}))};
 const car={id:0,s:1000,x:1000,y:0,offset:0,angle:0,speed:0,driverStyle:{},ai:{}},
 leader={id:1,s:1060,x:1060,y:0,offset:0,angle:0,speed:0,launchPass:true,passingOffset:40,passingClearS:1200},
 stopped={id:2,s:1120,x:1120,y:0,offset:0,angle:0,speed:0};
 const lane=planRacingLane(car,line,[leader,stopped],{time:25,blockedLaunch:true,paceAdvantage:()=>0});
 assert.equal(lane.phase,'passing');assert.ok(lane.offset<-30);
});

for(const difficulty of ['normal','expert'])test(`Dunes dry 16-lap P1 start clears promptly on ${difficulty}`,()=>{
 const r=new Race({track:'dunes',laps:16,fuel:18.5,tyre:'M',weather:'dry',aiSeed:42,startingPosition:1,difficulty});
 const start=r.player.s;let firstClear=null;
 for(let i=0;i<18*60;i++){r.step(1/60);if(firstClear===null&&r.cars[1].s>start+55)firstClear=r.time;}
 assert.ok(firstClear!==null&&firstClear<9,'the first blocked car must accelerate around the obstruction');
 assert.ok(r.cars.filter(c=>!c.player).every(c=>c.s>start+55));
 assert.equal(r.player.s,start);assert.ok(r.cars.every(c=>!c.contacts&&!c.trackLimits));
 // The field must also avoid the same car when returning at racing speed.
 for(let i=0;i<52*60;i++)r.step(1/60);
 assert.equal(r.player.s,start);assert.equal(r.player.contacts,0);assert.equal(r.player.trackLimits,0);
});

test('both sides remain usable around a stopped car after the launch phase',()=>{
 const r=new Race({...setup,track:'dunes',startingPosition:1});r.countdown=0;r.time=30;
 r.cars=[r.cars[0],r.cars[1],r.player];
 for(const [i,c] of r.cars.entries()){
  const s=c.player?-80:-180,offset=c.player?0:(i===0?-28:28),p=sample(s);
  Object.assign(c,{s,offset,x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset,
   angle:p.angle,motionAngle:p.angle,speed:c.player?0:35});
  if(!c.player){c.ai.launch=null;c.ai.strategy.nextReview=Infinity;}
 }
 const sides=new Map();
 for(let i=0;i<8*60;i++){
  r.step(1/60);
  for(const c of r.cars)if(!c.player&&Math.abs(c.s-r.player.s)<25)sides.set(c.id,Math.sign(c.offset-r.player.offset));
 }
 assert.deepEqual([...sides.values()].sort(),[-1,1]);
 assert.ok(r.cars.filter(c=>!c.player).every(c=>c.s>r.player.s+55));
 assert.ok(r.cars.every(c=>!c.contacts&&!c.trackLimits));
});

test('a clear route around two stationary cars does not wait for the leading AI to move',()=>{
 const line={width:160,length:5000,step:50,points:Array.from({length:100},()=>({offset:0,angle:0,curvature:0,distanceScale:1}))};
 const car={id:0,s:1000,x:1000,y:0,offset:0,angle:0,speed:0,driverStyle:{},ai:{}},
 traffic=[1,2].map(id=>({id,s:1000+id*60,x:1000+id*60,y:0,offset:0,angle:0,speed:0}));
 const plan=planRacingLane(car,line,traffic,{time:30,blockedLaunch:true,paceAdvantage:()=>0});
 assert.equal(plan.phase,'passing');assert.ok(Math.abs(plan.offset)>=38);
});
