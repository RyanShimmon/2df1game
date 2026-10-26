import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,sample,settleCareer} from '../src/core.js';
import {newCareer} from './career-fixture.js';
function nearFinish({fuel=0,penalty=0,mode='quick'}={}){
 const r=new Race({track:'northline',laps:1,fuel,tyre:'M',weather:'dry'}, {},mode),p=r.player;
 r.cars=[p];r.countdown=0;r.time=60;
 const s=TRACK.length-.2,loc=sample(s);
 Object.assign(p,{s,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:100,fuel,penalty});p.used.add('H');
 return r;
}
test('coasting across the finish with zero fuel is a legal win, never a DNF',()=>{
 const r=nearFinish();r.step(1/60,{});
 assert.ok(r.player.finished);assert.equal(r.player.dnf,false);assert.ok(r.done);
 assert.equal(r.result.position,1);assert.equal(r.result.dnf,false);assert.equal(r.result.legal,true);assert.equal(r.result.fuel,0);
});
test('zero-fuel finish waits for time penalties and retains the corrected classification',()=>{
 const r=nearFinish({penalty:5}),p=r.player,other=new Race({track:'northline',laps:1,fuel:2,tyre:'M'}).cars[0];
 r.cars=[p,other];r.step(1/60,{});assert.ok(p.finished);assert.equal(p.dnf,false);assert.equal(r.done,false);
 Object.assign(other,{finished:true,finishTime:r.time+2,trackFinishTime:r.time+2,s:TRACK.length});
 for(let i=0;i<310&&!r.done;i++)r.step(1/60,{});
 assert.ok(r.done);assert.equal(r.result.dnf,false);assert.equal(r.result.position,2);assert.equal(r.result.time,p.trackFinishTime+5);
});
test('a car stopping out of fuel before the finish remains a genuine retirement',()=>{
 const r=nearFinish(),p=r.player,loc=sample(1000);Object.assign(p,{s:1000,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:0});
 r.step(1/60,{});assert.equal(p.finished,false);assert.equal(r.result.dnf,true);assert.match(r.message,/Out of fuel/);
});
test('AI crossing the finish with zero fuel also retains a classified finish',()=>{
 const r=nearFinish(),p=r.player;p.player=false;r.step(1/60,{});
 assert.equal(p.finished,true);assert.equal(p.dnf,false);assert.equal(r.result.dnf,false);
});
test('a career win on the last fuel earns points, race money and its finish sponsor',()=>{
 const r=nearFinish({mode:'career'});r.step(1/60,{});
 const career=newCareer({driverName:'Alex',teamIndex:2});career.sponsor='finish';
 const settlement=settleCareer(career,r.result);
 assert.equal(settlement.points,25);assert.equal(settlement.met,true);assert.equal(settlement.bonus,600);assert.ok(settlement.prize>750);
});
test('finishing without the required compounds is a tyre infringement rather than a DNF',()=>{
 const r=nearFinish();r.player.used.delete('H');r.step(1/60,{});
 assert.equal(r.result.dnf,false);assert.equal(r.result.legal,false);assert.equal(r.player.finished,true);
});
