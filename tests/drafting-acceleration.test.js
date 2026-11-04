import test from 'node:test';
import assert from 'node:assert/strict';
import {acceleration,cleanAirTopSpeed,maximumSpeed} from '../src/core.js';
import {updateSlipstream} from '../src/racecraft.js';
const car=()=>({id:0,s:0,x:0,y:0,angle:0,offset:0,speed:280,fuel:0,pace:1,drive:'balanced',upgrades:{},tyre:'M'});
const context={width:126,length:6000,layer:()=>0};
test('a strong tow restores increasingly noticeable acceleration near top speed',()=>{
 const c=car();let previous=0;
 for(const speed of [220,260,290,315]) {
  c.speed=speed;c.slipstream=null;const clean=acceleration(c);
  c.slipstream={strength:.7,carry:.7};const gain=acceleration(c)-clean;
  assert.ok(gain>previous,`${speed}: recovered drag must grow with speed`);previous=gain;
  if(speed>=290)assert.ok(acceleration(c)>clean*2,'a tow must pull visibly harder at high speed');
 }
});
test('drafting reduces high-speed acceleration time without changing the clean-air cap',()=>{
 const duration=drafting=>{
  const c=car();c.slipstream=drafting?{strength:.7,carry:.7}:null;
  const cap=cleanAirTopSpeed(c);let t=0;
  while(c.speed<325&&t<30){c.speed=Math.min(maximumSpeed(c),c.speed+acceleration(c)*.01);t+=.01;}
  assert.equal(cleanAirTopSpeed(c),cap);return t;
 };
 assert.ok(duration(true)<duration(false)*.6);
});
test('the stronger acceleration applies equally to AI/player and requires remaining wake',()=>{
 for(const player of [false,true]){
  const c={...car(),player,speed:310},leader={...car(),id:1,s:90,x:90,speed:330};
  const clean=acceleration(c);
  for(let i=0;i<120;i++)updateSlipstream(c,[leader],1/60,context);
  assert.ok(acceleration(c)>clean*2);
  for(let i=0;i<60;i++)updateSlipstream(c,[],1/60,context);
  assert.ok(c.slipstream.strength<.001);
  const carry=c.slipstream.carry,remaining=acceleration(c);
  c.slipstream.strength=0;assert.ok(Math.abs(acceleration(c)-remaining)<.02);
  assert.ok(carry>0,'momentum ceiling persists briefly after the direct acceleration benefit ends');
 }
});
