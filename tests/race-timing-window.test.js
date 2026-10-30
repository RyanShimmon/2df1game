import test from 'node:test';
import assert from 'node:assert/strict';
import {raceTimingWindow} from '../src/timing.js';

test('race timing keeps five consecutive drivers around every player position',()=>{
 const order=Array.from({length:22},(_,i)=>({id:i,rank:i+1}));
 for(let rank=1;rank<=22;rank++){
  const player=order[rank-1],rows=raceTimingWindow(order,player);
  const first=Math.max(1,Math.min(rank-2,18));
  assert.deepEqual(rows.map(c=>c.rank),[first,first+1,first+2,first+3,first+4]);
  assert.ok(rows.includes(player));assert.equal(rows.find(c=>c===player),player);
 }
 assert.deepEqual(order.map(c=>c.rank),Array.from({length:22},(_,i)=>i+1));
});
test('the timing window follows overtakes without pinning unrelated leaders',()=>{
 const order=Array.from({length:22},(_,i)=>({id:i})),player=order[12];
 assert.deepEqual(raceTimingWindow(order,player).map(c=>c.id),[10,11,12,13,14]);
 order.splice(12,1);order.splice(3,0,player);
 assert.deepEqual(raceTimingWindow(order,player).map(c=>c.id),[1,2,12,3,4]);
});
test('short or unavailable fields never duplicate or fabricate timing rows',()=>{
 for(let count=0;count<=5;count++){
  const order=Array.from({length:count},(_,i)=>({id:i}));
  assert.deepEqual(raceTimingWindow(order,order.at(-1)),order);
 }
 const order=Array.from({length:22},(_,i)=>({id:i}));
 assert.deepEqual(raceTimingWindow(order,null),order.slice(0,5));
});
