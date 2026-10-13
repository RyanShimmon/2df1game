import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,sample,grip,DIFFICULTIES,newCareer,settleCareer} from '../src/core.js';
import {createWeekend} from '../src/weekend.js';
import {tyreWeatherGrip} from '../src/weather.js';
import {engineSoundFrame} from '../src/sound.js';
const setup={laps:8,fuel:10,tyre:'M',weather:'dry',aiSeed:42};
function race(){const r=new Race(setup);r.countdown=0;r.cars=[r.player];const p=r.player,loc=sample(500);Object.assign(p,{s:500,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:60});return r;}
test('holding brake stops the player, reverses and then permits forward driving again',()=>{
 const r=race(),p=r.player;
 for(let i=0;i<240;i++)r.step(1/60,{brake:true});
 assert.ok(p.speed<-20);const before=p.s;
 for(let i=0;i<30;i++)r.step(1/60,{brake:true});assert.ok(p.s<before);
 for(let i=0;i<120;i++)r.step(1/60,{throttle:true});
 assert.ok(p.speed>50);assert.ok(Math.abs(p.motionAngle-p.angle)<.01);
});
test('reverse steering and low-speed off-track movement remain usable',()=>{
 const r=race(),p=r.player;p.speed=0;const angle=p.angle;
 for(let i=0;i<45;i++)r.stepPlayer(p,1/60,{brake:true,steer:.5});
 assert.ok(p.speed<0);assert.ok(p.angle<angle);
});
test('dry wet-tyre grip improves slightly while hards retain a clear cornering advantage',()=>{
 const car=tyre=>({tyre,tyreAge:1000,wear:0,offset:0,trackWetness:0});
 assert.ok(grip(car('W'))>.55);assert.ok(grip(car('I'))>.72);
 assert.ok(grip(car('H'))>grip(car('I'))*1.25);assert.ok(grip(car('I'))>grip(car('W'))*1.2);
 assert.ok(Math.abs(tyreWeatherGrip('W',1)-1.07)<1e-10);
 assert.ok(Math.abs(tyreWeatherGrip('I',.5)-(0.68+.4*Math.sin(Math.PI*.5/.85)))<1e-10);
});
test('AI difficulty raises pace and consistency with the same underlying driver personalities',()=>{
 const levels=Object.keys(DIFFICULTIES).map(difficulty=>new Race({...setup,difficulty}));
 for(let i=1;i<levels.length;i++) {
  assert.ok(levels[i].cars[0].driverStyle.pace>levels[i-1].cars[0].driverStyle.pace);
  assert.ok(levels[i].cars[0].driverStyle.consistency>levels[i-1].cars[0].driverStyle.consistency);
 }
 assert.equal(new Race({...setup,difficulty:'invalid'}).difficulty,'normal');
});
test('higher difficulty adds a small career prize bonus without multiplying sponsor money',()=>{
 for(const [difficulty,multiplier] of [['normal',1],['hard',1.05],['expert',1.1]]) {
  const c=newCareer();c.sponsor='finish';
  const result=settleCareer(c,{position:10,legal:true,dnf:false,contacts:0,penalties:0,difficulty});
  assert.equal(result.prize,Math.round((2500+13*300)*multiplier));assert.equal(result.bonus,3500);
 }
 const c=newCareer();const failed=settleCareer(c,{position:22,legal:false,dnf:true,difficulty:'expert'});
 assert.equal(failed.prize,750);assert.equal(failed.difficultyBonus,0);
});
test('career payout honours the weekend difficulty rather than a later preference',()=>{
 const c=newCareer();c.weekend=createWeekend(c,{...setup,difficulty:'hard'});
 const result=settleCareer(c,{position:10,legal:true,dnf:false,contacts:0,penalties:0,difficulty:'expert'});
 assert.equal(result.difficulty,'hard');assert.equal(result.difficultyBonus,320);
});

test('reverse contact uses rearward momentum and keeps the player in reverse',()=>{
 const r=new Race(setup),p=r.player,other=r.cars[0];r.cars=[p,other];
 Object.assign(p,{x:700,y:1350,s:0,angle:0,motionAngle:Math.PI,speed:-20});
 Object.assign(other,{x:675,y:1350,s:-25,angle:0,speed:0,offset:0});
 r.collisions();assert.ok(p.speed<0 && p.speed>-20);assert.equal(p.contacts,1);
 assert.ok(engineSoundFrame(r,false,false).frequency>=120);
});
