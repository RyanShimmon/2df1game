import test from 'node:test';import assert from 'node:assert/strict';
import {TouchControls,LandscapeGate,stickSteering,mobileLessonText} from '../src/mobile.js';
import {SCHOOL_INTRO,RaceSchool} from '../src/school.js';
test('steering and pedals support independent simultaneous fingers and release/cancel safely',()=>{
 const c=new TouchControls();c.press(1,'left');c.press(2,'throttle');assert.deepEqual(c.state(),{steer:-1,throttle:true,brake:false,reverse:false});
 c.release(1);assert.equal(c.state().throttle,true);assert.equal(c.state().steer,0);
 c.press(3,'brake');assert.equal(c.state().brake,true);c.release(2);assert.equal(c.state().brake,true);
 c.reset();assert.deepEqual(c.state(),{steer:0,throttle:false,brake:false,reverse:false});
});
test('analogue steering has a deadzone, progressive response, sensitivity and safe limits',()=>{
 assert.equal(stickSteering(2),0);assert.ok(stickSteering(15)>0 && stickSteering(15)<1);
 assert.equal(stickSteering(-100),-1);assert.equal(stickSteering(100),1);
 assert.ok(stickSteering(20,42,.6)<stickSteering(20,42,1.5));
 const c=new TouchControls();c.press(1,'stick',.5);c.press(2,'throttle');c.move(1,-.7);assert.equal(c.state().steer,-.7);c.release(1);assert.equal(c.state().steer,0);assert.equal(c.state().throttle,true);
});
test('portrait blocks racing, landscape requires an explicit resume, and menus remain unrestricted',()=>{
 const g=new LandscapeGate();g.sync(true,true,390,844);assert.equal(g.blocked,true);g.resume();assert.equal(g.blocked,true);
 g.sync(true,true,844,390);assert.equal(g.blocked,true);g.resume();assert.equal(g.blocked,false);
 g.sync(true,true,390,844);assert.equal(g.blocked,true);g.sync(true,false,390,844);assert.equal(g.blocked,false);
 g.sync(false,true,390,844);assert.equal(g.blocked,false);
});
test('mobile tutorial uses touch controls and actual tyre picker rather than keyboard shortcuts',()=>{
 for(const card of SCHOOL_INTRO){const text=mobileLessonText(card.text);assert.ok(!text.includes('W / ↑'));assert.ok(!text.includes('F cycles'));assert.ok(!text.includes('B requests'));}
 const school=new RaceSchool(),race=school.createPractice();race.countdown=0;school.launchSeen=true;school.modeSeen=true;
 const text=mobileLessonText(school.guide(race).text);assert.ok(text.includes('Tap Pit'));assert.ok(text.includes('Tap Choose tyre set'));assert.ok(!text.includes('1 = Soft'));
 school.launchSeen=false;assert.ok(mobileLessonText(school.guide(race).text,'arrows').includes('left/right arrows'));
 assert.ok(mobileLessonText(school.guide(race).text,'stick').includes('steering pad'));
});

test('the mobile coach explains a busy pit exit rather than promising an immediate departure',()=>{
 const s=new RaceSchool(),q=s.createQualifying();q.mobile=true;const other=q.cars.find(c=>c!==q.player);
 other.garage=false;other.pit={distance:q.player.pit.distance+10};
 const g=s.guide(q);assert.equal(g.title,'Wait for a clear pit lane');assert.ok(mobileLessonText(g.text).includes('Hold GAS'));
 other.garage=true;assert.equal(s.guide(q).title,'Outing 1: leave when ready');
 q.player.pit=null;other.garage=false;assert.doesNotThrow(()=>s.guide(q));
});
