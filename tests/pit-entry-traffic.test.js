import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,PIT_MARKERS,PIT_LANE,sample,samplePit,crossesPitEntry} from '../src/core.js';
function create(){const r=new Race({track:'northline',laps:12,fuel:15,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false});r.countdown=0;return r;}
function place(c,s,offset,speed=200){const p=sample(s);Object.assign(c,{s,offset,speed,x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset,angle:p.angle,motionAngle:p.angle});}
test('the marked entrance rejects backwards crossings, dirt shortcuts and the wrong lap',()=>{
 const r=create(),g=PIT_MARKERS.entry,t={x:Math.cos(g.angle),y:Math.sin(g.angle)};
 const before={x:g.x-t.x,y:g.y-t.y},after={x:g.x+t.x,y:g.y+t.y,s:TRACK.pitEntry+1};
 assert.equal(crossesPitEntry(before,after,TRACK.pitEntry),true);
 assert.equal(crossesPitEntry(after,{...before,s:TRACK.pitEntry-1},TRACK.pitEntry),false);
 assert.equal(crossesPitEntry(before,after,TRACK.pitEntry+TRACK.length),false);
 const dx=-t.y*70,dy=t.x*70;
 assert.equal(crossesPitEntry({x:before.x+dx,y:before.y+dy},{x:after.x+dx,y:after.y+dy,s:after.s},TRACK.pitEntry),false);
 // A qualifying in lap starts at the timing line, after this lap's pit entrance.
 const p=r.player;r.qualifying=true;p.qState='in';place(p,TRACK.length+10,0);r.pitRequested=true;
 const target=r.pitEntryTarget(p,true);assert.ok(target>TRACK.length);
 place(p,TRACK.pitEntry+1,63,80);assert.equal(r.tryEnterPit(p,before,target),false);
 assert.equal(p.pit,null);
});
for(const player of [true,false])test(`pitting AI gives way to an alongside ${player?'player':'AI'} instead of crossing its lane`,()=>{
 const r=create(),c=r.cars[0],other=player?r.player:r.cars[2];r.cars=[c,other];
 place(c,TRACK.pitEntry-250,-5);place(other,c.s,30);c.ai.strategy.pitRequested=true;c.ai.strategy.nextReview=Infinity;c.ai.nextDecision=Infinity;
 for(let i=0;i<1000&&c.s<TRACK.pitEntry+100;i++){
  // Keep the other car alongside: there is deliberately no safe merge gap.
  place(other,c.s,30,c.speed);r.traffic=r.cars.map(car=>({...car}));r.time+=1/60;r.stepAI(c,1/60);
  assert.ok(c.offset<=-4+.01,`cut across occupied lane at ${c.offset}`);assert.equal(c.pit,null);
  assert.ok(Math.hypot(c.x-other.x,c.y-other.y)>30,'never push the other car out of the way');
 }
 assert.equal(c.pit,null,'a permanently blocked entrance is never forced');
});
test('with a free lane, AI establishes pit-side position early and carries racing speed until braking',()=>{
 const r=create(),c=r.cars[0];r.cars=[c];place(c,TRACK.pitEntry-900,-30,250);
 c.ai.strategy.pitRequested=true;c.ai.strategy.nextReview=Infinity;c.ai.nextDecision=Infinity;
 while(c.s<TRACK.pitEntry-400){r.traffic=[c];r.time+=1/60;r.stepAI(c,1/60);}
 assert.ok(c.offset>25);assert.ok(c.speed>180,'early lane preparation itself does not impose a slow-down');
 for(let i=0;i<1200&&!c.pit;i++){r.traffic=[c];r.time+=1/60;r.stepAI(c,1/60);}
 assert.ok(c.pit);assert.ok(c.pit.entryDistance<10);
});

test('automatic pit exit yields to a car already occupying the merge lane',()=>{
 const r=create(),c=r.cars[0],other=r.player;r.cars=[c,other];
 place(c,TRACK.pitEntry,63,80);r.enterPit(c);c.pit.serviced=true;c.pit.stage='exit';c.pit.distance=PIT_LANE.length-100;
 const exitS=c.pit.startS+PIT_LANE.span;place(other,exitS,43,0);
 for(let i=0;i<240;i++)r.stepPit(c,1/60,{});
 assert.ok(c.pit);assert.ok(PIT_LANE.length-c.pit.distance>=34);assert.ok(c.speed<1);
 place(other,exitS+250,43,100);
 for(let i=0;i<300&&c.pit;i++)r.stepPit(c,1/60,{});
 assert.equal(c.pit,null);
});

test('a blocked pit approach creates a gap behind moving traffic and then enters cleanly',()=>{
 const r=create(),c=r.cars[0],other=r.player;r.cars=[c,other];
 place(c,TRACK.pitEntry-600,-5,200);place(other,c.s+10,30,200);
 c.ai.strategy.pitRequested=true;c.ai.strategy.nextReview=Infinity;c.ai.nextDecision=Infinity;
 for(let i=0;i<1500&&!c.pit;i++){
  place(other,other.s+200/60,30,200);r.traffic=r.cars.map(car=>({...car}));r.time+=1/60;r.stepAI(c,1/60);
  assert.ok(Math.hypot(c.x-other.x,c.y-other.y)>30);
 }
 assert.ok(c.pit,'join behind the moving car, rather than driving alongside until the entrance is missed');
});
test('pit traffic never asks the leading car to yield to its own follower',()=>{
 const r=create(),leader=r.cars[0],follower=r.cars[2];r.cars=[leader,follower];r.player=leader;leader.player=false;
 place(leader,TRACK.pitEntry-100,51,80);place(follower,leader.s-13,13,80);
 for(const c of r.cars){c.ai.strategy.pitRequested=true;c.ai.strategy.nextReview=Infinity;c.ai.nextDecision=Infinity;}
 for(let i=0;i<1800&&!leader.stops;i++)r.step(1/60);
 assert.equal(leader.stops,1,'the front car proceeds; cars behind do not deadlock the pit queue');
});
