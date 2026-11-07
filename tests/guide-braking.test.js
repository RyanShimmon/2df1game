import test from 'node:test';
import assert from 'node:assert/strict';
import {consolidateBraking} from '../scripts/guide-braking.mjs';

test('staggered taps spanning the timing line become one application with the same speed loss',()=>{
  const inputs=['L','B','A','B','A','B'];
  const points=inputs.map((code,i)=>[i,0,code]);
  const samples=inputs.map((code,i)=>({
    duration:i===2||i===4 ? 1 : .1,capacity:i===5 ? 6 : 10,
    brakeLoss:[1,5,0,9,0,4][i],throttling:code==='A',speed:180,
  }));
  consolidateBraking(points,samples);
  // The taps at 5 and 1 include a lightly braking lift at 0. Spend all
  // ten speed units from 5 through 40% of 0, then release before 1.
  assert.deepEqual(points.map(p=>p[2]),['L','L','A','B','A','B']);
  assert.equal(points[0][3],.4);
  const loss=points.reduce((sum,p,i)=>sum+samples[i].capacity*(p[3] ?? (p[2]==='B'?1:0)),0);
  assert.equal(loss-samples[3].capacity,10);
  assert.deepEqual(points[3],[3,0,'B']); // Independent braking after a straight.
});
