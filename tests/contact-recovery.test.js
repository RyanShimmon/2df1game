import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,sample,AI_LINE,TRACK,angleDiff,grip,selectTrack,maximumSpeed,clamp} from '../src/core.js';
import {racingPoint,planRacingLane} from '../src/racecraft.js';
test.afterEach(()=>selectTrack('northline'));
function contact(at,side=1,water=0){
 const r=new Race({track:'canyon',laps:24,fuel:28,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false});
 const c=r.cars[0],p=r.player,loc=sample(at),offset=racingPoint(AI_LINE,at).offset;
 r.cars=[p,c];r.traffic=[];r.time=10;c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;
 for(const [car,o] of [[c,offset],[p,offset-side*22]])Object.assign(car,{s:at,offset:o,x:loc.x-Math.sin(loc.angle)*o,y:loc.y+Math.cos(loc.angle)*o,angle:loc.angle,motionAngle:loc.angle,speed:160,sideSpeed:0,pit:null,garage:false,trackWetness:water});
 p.motionAngle=loc.angle+side*.55;
 return {r,c,p,loc};
}
for(const at of [-600,2000,3800])for(const side of [-1,1])test(`contact displaces AI on ${at} in both directions (${side}), with grip-limited recovery`,()=>{
 const {r,c,loc}=contact(at,side);r.collisions();
 const angle=c.motionAngle,body=c.angle,{x,y}=c;
 assert.ok(side*angleDiff(angle,loc.angle)>.2,'AI must receive sideways momentum');
 r.cars=[c];
 // The player's countersteering recovery authority is available to AI too.
 const slip=Math.abs(angleDiff(angle,body)),limit=(225*grip(c)/c.speed*1.4+1.55*clamp(slip/.8,0,1))/60;
 r.stepAI(c,1/60);
 const lateral=-(c.x-x)*Math.sin(loc.angle)+(c.y-y)*Math.cos(loc.angle);
 assert.ok(side*lateral>.4,`AI cancelled its displacement: ${lateral}`);
 assert.ok(Math.abs(angleDiff(c.motionAngle,angle))<=limit*1.03,'line recovery exceeded available tyre force');
 assert.ok(Math.abs(angleDiff(c.angle,body))<.07,'body must turn through the impact, not snap onto its velocity');
 assert.ok(Math.abs(angleDiff(c.motionAngle,c.angle))>.04,'impact slip must survive the first steering frame');
 assert.ok(c.sliding>.1,'impact slip must contribute to tyre loading and resistance');
 for(let i=0;i<120;i++){r.time+=1/60;r.stepAI(c,1/60);assert.ok(Number.isFinite(c.x+c.y+c.speed));}
 assert.ok(!c.ai.contactRecovery,'AI should recover naturally once aligned');
});
test('the same contact produces equal momentum change, independent of which car is player controlled',()=>{
 const a=contact(-600),b=contact(-600);a.p.player=false;a.c.player=true;
 const velocity=c=>[c.speed*Math.cos(c.motionAngle),c.speed*Math.sin(c.motionAngle)];
 const before=a.r.cars.map(velocity).reduce((sum,v)=>sum.map((n,i)=>n+v[i]),[0,0]);
 a.r.collisions();b.r.collisions();
 for(const key of ['p','c'])assert.deepEqual(velocity(a[key]),velocity(b[key]));
 const after=a.r.cars.map(velocity).reduce((sum,v)=>sum.map((n,i)=>n+v[i]),[0,0]);
 after.forEach((n,i)=>assert.ok(Math.abs(n-before[i])<1e-8));
});
test('lower wet grip cannot cancel impact direction faster than dry grip',()=>{
 const dry=contact(-600),wet=contact(-600,1,.1);
 for(const v of [dry,wet]){v.r.collisions();v.incoming=v.c.motionAngle;v.r.cars=[v.c];v.r.stepAI(v.c,1/60);}
 assert.ok(Math.abs(angleDiff(wet.c.motionAngle,wet.incoming))<Math.abs(angleDiff(dry.c.motionAngle,dry.incoming)));
});

test('contact above the powered speed ceiling decays instead of being deleted on the next player step',()=>{
 const {r,p,c,loc}=contact(-600);
 const top=maximumSpeed(p);
 // A faster car rear-ends a car already at its powered speed ceiling.
 Object.assign(p,{offset:0,x:loc.x,y:loc.y,speed:top,motionAngle:loc.angle});
 Object.assign(c,{offset:0,x:loc.x-32*Math.cos(loc.angle),y:loc.y-32*Math.sin(loc.angle),s:p.s-32,speed:top+40,motionAngle:loc.angle});
 r.collisions();const after=p.speed;assert.ok(after>top+10);
 r.stepPlayer(p,1/60,{});
 assert.ok(p.speed>top,'impact momentum should not be clipped to engine top speed');
 assert.ok(p.speed<after,'resistance should remove excess speed');
});

for(const [track,side] of [['northline',1],['northline',-1],['canyon',1],['canyon',-1]])
test(`${track}: a squeezed AI respects adjacent space through repeated cornering decisions (${side})`,()=>{
 const r=new Race({track,laps:24,fuel:28,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false});
 const c=r.cars[0],p=r.player;
 const index=AI_LINE.points.findIndex(point=>side*point.slope<-.07 && Math.abs(point.curvature)>.001);
 assert.ok(index>=0,'exercise a corner where the unopposed line crosses the occupied lane');
 const s=index*AI_LINE.step,edge=TRACK.width/2-18;
 const place=(car,at,offset)=>{const loc=sample(at);Object.assign(car,{s:at,offset,x:loc.x-Math.sin(loc.angle)*offset,y:loc.y+Math.cos(loc.angle)*offset,angle:loc.angle,motionAngle:loc.angle,speed:140});};
 place(c,s,side*(edge-2));r.cars=[c,p];r.time=10;
 c.ai.nextDecision=Infinity;c.ai.strategy.nextReview=Infinity;
 for(let i=0;i<90;i++){
  place(p,c.s,side*(edge-30));p.speed=c.speed;
  r.traffic=r.cars.map(car=>({...car}));
  const lane=planRacingLane(c,AI_LINE,r.traffic,{time:r.time,allowPass:false});
  assert.ok(lane.min>lane.max,'neighbour and road edge leave no normal passing corridor');
  const offset=c.offset;r.time+=1/60;r.stepAI(c,1/60);
  assert.ok(side*(c.offset-offset)>=-.001,'must not follow apex feed-forward through the adjacent car');
 }
});
