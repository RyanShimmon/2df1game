import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,sample} from '../src/core.js';
const setup={track:'northline',laps:8,fuel:10,tyre:'M',weather:'dry'};
test('all 22 Quick Race starting positions place the player in a unique grid slot',()=>{
 for(let position=1;position<=22;position++){
  const r=new Race({...setup,startingPosition:position}),p=r.player;
  assert.equal(r.order().indexOf(p)+1,position);
  assert.equal(new Set(r.cars.map(c=>`${c.s}:${c.offset}`)).size,22);
  assert.equal(p.s,-(Math.floor((position-1)/2)*38+25));
  const loc=sample(p.s);
  assert.equal(p.x,loc.x-Math.sin(loc.angle)*p.offset);
  assert.equal(p.y,loc.y+Math.cos(loc.angle)*p.offset);
  assert.equal(p.id,21);assert.equal(r.cars.filter(c=>c.player).length,1);
 }
});
test('Quick Race defaults to P22 and sanitizes invalid positions',()=>{
 for(const [value,expected] of [[undefined,22],[NaN,22],[-5,1],[90,22],[3.7,4]]){
  const r=new Race({...setup,startingPosition:value});assert.equal(r.order().indexOf(r.player)+1,expected);
 }
});
test('career grid ignores the Quick Race starting position and remains set by qualifying',()=>{
 const r=new Race({...setup,startingPosition:1},{},'career');assert.equal(r.order().indexOf(r.player)+1,22);
});
