import test from 'node:test';import assert from 'node:assert/strict';
import {SPONSORS,sponsorMet,sponsorOffers} from '../src/sponsors.js';
import {loadCareer,settleCareer,Race} from '../src/core.js';
import {newCareer} from './career-fixture.js';
const row={position:8,gridPosition:14,contacts:0,penalties:0,stops:1,legal:true,dnf:false};
test('twelve sponsors offer six stable, distinct and varied contracts each weekend',()=>{
 assert.equal(SPONSORS.length,12);assert.equal(new Set(SPONSORS.map(s=>s.id)).size,12);
 const c={...newCareer({driverName:'Test',teamIndex:2}),developmentSeed:42},seasons=[];
 for(let round=1;round<=6;round++){
  c.round=round;const offers=sponsorOffers(c);
  assert.equal(offers.length,6);assert.equal(new Set(offers.map(s=>s.id)).size,6);assert.ok(offers.some(s=>s.id==='finish'));
  assert.deepEqual(offers,sponsorOffers(JSON.parse(JSON.stringify(c))));seasons.push(offers.map(s=>s.id).join(','));
 }
 assert.ok(new Set(seasons).size>=5,'offers should vary across the calendar');
});
test('position targets, climbing goals and strategy targets honour their exact boundaries',()=>{
 const cases=[['finish',row,true],['top15',{...row,position:16},false],['points',{...row,position:11},false],
 ['top5',{...row,position:5},true],['top5',{...row,position:6},false],['podium',{...row,position:3},true],['podium',row,false],
 ['win',{...row,position:1},true],['win',{...row,position:2},false],['gain3',{...row,gridPosition:11},true],['gain3',{...row,gridPosition:10},false],
 ['gain6',row,true],['gain6',{...row,gridPosition:13},false],['gain3',{...row,gridPosition:undefined},false],
 ['oneStop',row,true],['oneStop',{...row,stops:0},false],['oneStop',{...row,stops:2},false],
 ['clean',{...row,contacts:2},true],['clean',{...row,contacts:3},false],['clean',{...row,penalties:1},false],
 ['noContact',row,true],['noContact',{...row,contacts:1},false],['noPenalty',row,true],['noPenalty',{...row,penalties:1},false]];
 for(const [id,result,expected] of cases)assert.equal(sponsorMet(id,result),expected,id);
});
test('DNF, disqualification and incomplete telemetry never bypass sponsor conditions',()=>{
 for(const s of SPONSORS){assert.equal(sponsorMet(s.id,{...row,position:1,legal:false}),false);assert.equal(sponsorMet(s.id,{...row,position:1,dnf:true}),false);}
 assert.equal(sponsorMet('noContact',{...row,contacts:undefined}),false);assert.equal(sponsorMet('oneStop',{...row,stops:undefined}),false);
 assert.equal(sponsorMet('unknown',row),false);
});
test('new contracts pay commercial bonuses and keep an already signed sponsor across reload',()=>{
 const c=newCareer();c.sponsor='gain3';c.upgrades.commercial=2;
 c.weekend={grid:Array.from({length:22},(_,i)=>i)};
 const loaded=loadCareer({getItem:()=>JSON.stringify(c)});assert.equal(loaded.sponsor,'gain3');
 const result=settleCareer(loaded,{...row,position:18,gridPosition:undefined});
 assert.equal(result.bonus,1440);assert.equal(result.commercialBonus,240);assert.equal(result.met,true);assert.equal(loaded.sponsor,null);
 const missed=newCareer();missed.sponsor='oneStop';assert.equal(settleCareer(missed,{...row,stops:2}).bonus,0);
});
test('race result fields include the actual starting place and pit count for every sponsor goal',()=>{
 const r=new Race({laps:8,fuel:10,tyre:'M',aiSeed:42});
 for(const result of r.raceField()){
  const car=r.cars.find(c=>c.id===result.id);assert.equal(result.gridPosition,car.gridPosition);assert.equal(result.stops,car.stops);
 }
});
