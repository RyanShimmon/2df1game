import test from 'node:test';
import assert from 'node:assert/strict';
import {newCareer} from './career-fixture.js';
import {buyUpgrade,settleCareer,UPGRADES} from '../src/core.js';
import {upgradePrice,racePrize,fundTeams,developTeams} from '../src/development.js';
import {careerSchedule} from '../src/calendar.js';

function completeCareer(position,difficulty='normal'){
 const c=newCareer({driverName:'Economy',teamIndex:10});c.developmentSeed=42;
 let races=0,purchases=0,first=0,lastPurchase=0,maxWait=0;
 while(races<60){
  let bought=0;
  for(;;){
   const key=Object.keys(UPGRADES).filter(k=>c.upgrades[k]<UPGRADES[k].max&&upgradePrice(c.upgrades,k)<=c.cash).sort((a,b)=>upgradePrice(c.upgrades,a)-upgradePrice(c.upgrades,b))[0];
   if(!key)break;
   assert.ok(buyUpgrade(c,key));purchases++;bought++;
  }
  if(!races)first=bought;
  if(bought){maxWait=Math.max(maxWait,races-lastPurchase);lastPurchase=races;}
  if(purchases===40)return {races,first,maxWait};
  const format=careerSchedule(c).raceFormat || 'grandPrix';c.sponsor=null;
  const result=settleCareer(c,{position,legal:true,dnf:false,contacts:0,penalties:0,difficulty,raceFormat:format});
  assert.equal(result.bonus,0);assert.equal(result.seasonBonus,0);races++;
 }
 throw Error('Upgrade ladder did not complete');
}
test('a strong player completes all upgrades in about three seasons without sponsors',()=>{
 const podium=completeCareer(3),wins=completeCareer(1),points=completeCareer(10);
 assert.ok(podium.races>=34&&podium.races<=38,JSON.stringify(podium));
 assert.ok(wins.races>=33&&wins.races<=36,JSON.stringify(wins));
 assert.ok(points.races>=40&&points.races<=44,JSON.stringify(points));
 assert.ok(podium.first>=2,'opening money buys useful early choices');
 assert.ok(podium.maxWait<=3,'late upgrades remain attainable within a few races');
 assert.ok(completeCareer(3,'expert').races>=31,'difficulty bonuses cannot trivialise progression');
});
test('Sprint and Grand Prix funding use identical per-car rules for player and AI',()=>{
 for(const format of ['grandPrix','sprint']){
  const c=newCareer({driverName:'Equal terms',teamIndex:10});c.developmentSeed=42;developTeams(c,42);
  const team=c.teams[0],before=team.budget;
  const field=[{teamIndex:0,position:3,legal:true,dnf:false},{teamIndex:0,position:3,legal:true,dnf:false}];
  fundTeams(c,{field,raceFormat:format},[],.05);
  const expected=racePrize({position:3,raceFormat:format},.05);
  assert.equal(c.teams[0].budget-before,expected.base+expected.bonus);
  const again=c.teams[0].budget;fundTeams(c,{field,raceFormat:format},[],.05);assert.equal(c.teams[0].budget,again);
  c.sponsor=null;const player=settleCareer(c,{position:3,raceFormat:format,difficulty:'hard',legal:true,dnf:false});
  assert.equal(player.prize,expected.base+expected.bonus);
 }
 assert.equal(racePrize({position:1,raceFormat:'sprint'}).base,5850);
 assert.equal(racePrize({position:1}).base,7800);
});
