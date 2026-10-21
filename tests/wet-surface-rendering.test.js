import test from 'node:test';import assert from 'node:assert/strict';
import {Renderer,asphaltColour} from '../src/render.js';import {selectTrack,TRACK} from '../src/core.js';
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
