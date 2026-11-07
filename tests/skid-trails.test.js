import test from 'node:test';
import assert from 'node:assert/strict';
import {recordSkid,drawSkids} from '../src/skids.js';

test('a sustained high-speed curved slide leaves connected tracks with bounded sampling',()=>{
 let marks=[];const car={speed:330};
 for(let frame=0;frame<=120;frame++){
  const time=frame/60,angle=time*.4;
  Object.assign(car,{x:825*Math.sin(angle),y:825*(1-Math.cos(angle)),angle:angle+.12});
  recordSkid(car,marks,time,true);
  marks=marks.filter(mark=>time-mark.t<16);
 }
 assert.ok(marks.length>=20 && marks.length<=30);
 assert.equal(marks.at(-1).x,car.x,'the live trail reaches the current tyre position');
 for(let i=1;i<marks.length;i++)assert.deepEqual(marks[i].from,{x:marks[i-1].x,y:marks[i-1].y,a:marks[i-1].a});
 const paths=[];let strokes=0;
 const ctx={save(){},restore(){},beginPath(){},moveTo(x,y){paths.push([[x,y]]);},
  lineTo(x,y){paths.at(-1).push([x,y]);},stroke(){strokes++;}};
 drawSkids(ctx,marks,2);
 assert.equal(ctx.lineCap,'butt');assert.equal(ctx.lineJoin,'round');
 assert.ok(strokes<=3,'fade groups, not a separate translucent stroke per segment');
 assert.equal(paths.length,strokes*2);
 assert.equal(paths.reduce((n,path)=>n+path.length-1,0),marks.length*2);
 for(let i=2;i<paths.length;i++)assert.deepEqual(paths[i][0],paths[i-2].at(-1));
});

test('different cars, interrupted slides, pit gaps and teleports never join trails',()=>{
 const marks=[],a={x:0,y:0,angle:0,speed:120},b={x:0,y:100,angle:0,speed:120};
 for(const car of [a,b]){recordSkid(car,marks,0,true);car.x=2;recordSkid(car,marks,1/60,true);}
 assert.equal(marks.length,2);assert.equal(marks[0].from.y,0);assert.equal(marks[1].from.y,100);
 recordSkid(a,marks,2/60,false);a.x=8;recordSkid(a,marks,4/60,true);a.x=10;recordSkid(a,marks,5/60,true);
 assert.equal(marks.at(-1).from.x,8);
 a.x=100;recordSkid(a,marks,1,true);a.x=102;recordSkid(a,marks,1+1/60,true);assert.equal(marks.at(-1).from.x,100);
 a.x=1000;recordSkid(a,marks,1+2/60,true);a.x=1002;recordSkid(a,marks,1+3/60,true);assert.equal(marks.at(-1).from.x,1000);
});


test('a full trail buffer keeps recording the current slide',()=>{
 const marks=Array.from({length:1400},()=>({t:-1})),car={x:0,y:0,angle:0,speed:120};
 recordSkid(car,marks,0,true);car.x=2;recordSkid(car,marks,1/60,true);
 assert.equal(marks.length,1400);assert.equal(marks.at(-1).x,2);
 car.x=4;recordSkid(car,marks,2/60,true);assert.equal(marks.at(-1).x,4);
});
