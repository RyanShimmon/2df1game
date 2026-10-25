import {crossingDistances} from './track-fixtures.js';
import test from 'node:test';import assert from 'node:assert/strict';
import {Renderer,asphaltColour,underpassView} from '../src/render.js';import {selectTrack,TRACK,sample} from '../src/core.js';
test('asphalt colour is opaque and varies continuously from dry to fully wet',()=>{
 assert.equal(asphaltColour(0),'rgb(52,61,66)');assert.equal(asphaltColour(1),'rgb(75,97,110)');
 assert.equal(asphaltColour(-1),asphaltColour(0));assert.equal(asphaltColour(2),asphaltColour(1));
});
test('wet flyovers use one opaque asphalt stroke without an extra transparent round-join layer',()=>{
 const Original=globalThis.Path2D;
 globalThis.Path2D=class{moveTo(){}lineTo(){}};
 try{
  selectTrack('metro');const strokes=[],ctx={save(){},restore(){},setLineDash(){},stroke(){strokes.push({width:this.lineWidth,colour:this.strokeStyle});}};
  Renderer.prototype.flyovers.call({},ctx,{weather:{wetness:1}});
  const asphalt=strokes.filter(s=>s.width===TRACK.width);
  assert.equal(asphalt.length,TRACK.bridges.length);assert.ok(asphalt.every(s=>s.colour===asphaltColour(1)));
 }finally{globalThis.Path2D=Original;selectTrack('northline');}
});

test('underpass visibility opens only below a bridge and fades before leaving it',()=>{
 for(const [track,over,under] of [['metro',...crossingDistances('metro')],['crossover',...crossingDistances('crossover')]]){
  selectTrack(track);const pose=s=>({s,...sample(s)});
  assert.equal(underpassView(pose(over)),null);
  assert.equal(underpassView(pose(TRACK.bridges[0][0]-50)),null);
  assert.equal(underpassView(pose(TRACK.bridges[0][1]+50)),null);
  assert.ok(underpassView(pose(under))?.radius>120);
  assert.equal(underpassView(pose(under+500)),null);
  assert.equal(underpassView({...pose(under),pit:{}}),null);
 }
 selectTrack('northline');assert.equal(underpassView({s:100,...sample(100)}),null);
});
test('bridge shadows stop short of the tarmac joins',()=>{
 const Original=globalThis.Path2D;globalThis.Path2D=class{points=[];moveTo(x,y){this.points.push([x,y]);}lineTo(x,y){this.points.push([x,y]);}};
 try{
  selectTrack('metro');const strokes=[],ctx={save(){},restore(){},setLineDash(){},stroke(path){strokes.push({path,shadow:this.shadowBlur});}};
  Renderer.prototype.flyovers.call({},ctx,null);
  const shadow=strokes.find(s=>s.shadow>0),surface=strokes.at(-1),start=sample(TRACK.bridges[0][0]);
  assert.ok(Math.hypot(shadow.path.points[0][0]-start.x,shadow.path.points[0][1]-start.y)>45);
  assert.deepEqual(surface.path.points[0],[start.x,start.y]);
 }finally{globalThis.Path2D=Original;selectTrack('northline');}
});
