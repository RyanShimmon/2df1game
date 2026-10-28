import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,TYRES,CIRCUITS} from '../src/core.js';
import {tyreAllocation} from '../src/tyre-stock.js';
import {wearPerLap} from '../src/performance.js';

function race(track='canyon',seed=42){
 const r=new Race({track,laps:32,fuel:37,tyre:'M',weather:'dry',aiSeed:seed,tyreTemperatureEnabled:false});
 r.freezeWeather=true;r.traffic=[];
 return r;
}
function fit(r,c,{tyre='S',age=2,wear=age/TYRES[tyre].life,water=0,finite=false,mode='balanced',upgrades={},fuel=37-age*1.1}={}){
 c.tyreInventory=finite?tyreAllocation():null;c.tyrePhase=finite?'R':null;
 c.tyreSet=c.tyreInventory?.find(s=>s.compound===tyre) || null;
 if(c.tyreSet)c.tyreSet.wear=wear;
 Object.assign(c,{tyre,wear,wheelWear:Array(4).fill(wear),tyreAge:age*TRACK.length,s:age*TRACK.length,
  trackWetness:water,drive:mode,sliding:0,upgrades,fuel,used:new Set([tyre])});
 Object.assign(c.ai.strategy,{nextReview:0,lastStop:-100,pitRequested:false,reason:null,choice:null});
 c.ai.pitEntryS=null;r.time=age*40;
}

test('healthy dry tyres are retained through the opening laps on every circuit, with unlimited or weekend stock',()=>{
 for(const track of CIRCUITS){
  const r=race(track.id);
  for(const c of [r.cars[0],r.cars[15]])for(const tyre of ['S','M','H'])for(const age of [2,3,4])for(const finite of [false,true]){
   fit(r,c,{tyre,age,finite});
   assert.equal(r.reviewAIStrategy(c,32-age),false,`${track.id}: driver ${c.id}, ${tyre}, lap ${age}, finite ${finite}`);
  }
 }
});

test('dry stop timing follows compound life and pace expenditure instead of fixed pit laps',()=>{
 const r=race(),c=r.cars[0],stops={};
 c.ai.strategy.wearLimit=.86;
 for(const mode of ['save','balanced','push'])for(const tyre of ['S','M','H']){
  for(let age=.25;age<30;age+=.25){
   fit(r,c,{tyre,age,mode,wear:wearPerLap(tyre,TYRES,{mode})*age,fuel:(32-age)*1.15});
   if(r.reviewAIStrategy(c,32-age)){stops[mode+tyre]=age;break;}
  }
  assert.ok(stops[mode+tyre],`${mode} ${tyre} must eventually stop`);
 }
 for(const mode of ['save','balanced','push']){
  assert.ok(stops[mode+'S']<stops[mode+'M']);assert.ok(stops[mode+'M']<stops[mode+'H']);
 }
 for(const tyre of ['S','M','H']){
  assert.ok(stops['push'+tyre]<stops['balanced'+tyre]);assert.ok(stops['balanced'+tyre]<stops['save'+tyre]);
 }
});

test('an early change is still available for genuinely worn qualifying tyres',()=>{
 const r=race(),c=r.cars[0];
 for(const tyre of ['S','M','H']){
  fit(r,c,{tyre,age:1,wear:.94,finite:true});
  assert.equal(r.reviewAIStrategy(c,31),true);
  assert.equal(c.ai.strategy.reason,'tyre life');
  assert.ok(c.tyreInventory.includes(c.ai.strategy.choice));
  assert.notEqual(c.ai.strategy.choice.id,c.tyreSet.id);
 }
});

test('weather can justify an early stop, including a more suitable slick, while stable suitable tyres stay out',()=>{
 const r=race(),c=r.cars[0];
 for(const [tyre,water,next] of [['S',.1,'H'],['S',.4,'I'],['M',.4,'I'],['H',1,'W'],['I',1,'W'],['W',0,'H']]){
  fit(r,c,{tyre,water,wear:.15});
  assert.equal(r.reviewAIStrategy(c,30),true,`${tyre} at ${water}`);
  assert.equal(c.ai.strategy.reason,'weather crossover');assert.equal(c.ai.strategy.choice.compound,next);
 }
 for(const [tyre,water] of [['M',.1],['H',.1],['I',.4],['W',.8]]){
  fit(r,c,{tyre,water,wear:.15});assert.equal(r.reviewAIStrategy(c,30),false,`${tyre} at ${water}`);
 }
});

test('a withdrawn speculative stop is cancelled before the approach, but a committed turn-in remains stable',()=>{
 const r=race(),c=r.cars[0];
 for(const committed of [false,true]){
  fit(r,c,{tyre:'H',age:3,wear:.13});
  Object.assign(c.ai.strategy,{pitRequested:true,reason:'faster race strategy',choice:{compound:'S',wear:0}});
  if(committed){c.s=3*TRACK.length+TRACK.pitEntry-400;c.ai.pitEntryS=c.s+400;}
  assert.equal(r.reviewAIStrategy(c,29),committed);
  if(!committed)assert.equal(c.ai.strategy.choice,null);
 }
});

test('dry compound rules remain enforced for Grands Prix, without an unnecessary Sprint stop',()=>{
 const r=race(),c=r.cars[0];
 for(const format of ['grandPrix','sprint']){
  fit(r,c,{tyre:'H',age:10,wear:.4,fuel:3});c.raceFormat=format;
  assert.equal(r.reviewAIStrategy(c,1.5),format==='grandPrix');
  if(format==='grandPrix'){assert.equal(c.ai.strategy.reason,'compound rule');assert.notEqual(c.ai.strategy.choice.compound,'H');}
 }
});

test('a worthwhile strategic stop is still taken when the planned stint reaches its pit window',()=>{
 const r=race(),c=r.cars[1];
 fit(r,c,{tyre:'S',age:10.3,wear:.8,fuel:26});
 assert.equal(r.reviewAIStrategy(c,21.7),true);
 assert.equal(c.ai.strategy.reason,'faster race strategy');
 assert.equal(c.ai.strategy.choice.compound,'H');
 assert.ok(c.ai.strategy.projectedStopLaps<1);
});
