import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,TRACK,TEAMS,SPONSORS,UPGRADES,loadCareer,buyUpgrade,upgradeCost,settleCareer,selectTrack,sample,resources,grip,accelerationGrip,brakingDeceleration,angleDiff} from '../src/core.js';
import {newCareer} from './career-fixture.js';
import {emptyUpgrades,level,developTeams,fuelMultiplier,sponsorPayout,setAeroPackage,developmentSnapshot} from '../src/development.js';
import {developmentBench,upgradePreview} from '../src/development-preview.js';
import {THERMAL,prepareTyres,updateTyreTemperatures} from '../src/tyre-temperature.js';
import {createWeather} from '../src/weather.js';
import {createWeekend,QualifyingRun,getQualifyingFuel,prepareRace} from '../src/weekend.js';
const profile={driverName:'Alex',teamIndex:2},setup={track:'northline',laps:24,fuel:28,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false};
const car=(u={})=>({upgrades:{...emptyUpgrades(),...u},aeroSpec:'balanced',tyre:'M',speed:220,wear:0,wheelWear:[0,0,0,0],trackWetness:0,s:0,offset:0,fuel:30,drive:'balanced',tyreTemperatureEnabled:false,tyreAge:0});
test.afterEach(()=>selectTrack('northline'));
test('legacy careers gain new development fields without resetting identity, cash, history or tyre wear',()=>{
 const c=newCareer(profile);c.cash=23000;c.round=4;c.season=2;c.upgrades={engine:2,aero:1,tyres:3,crew:2};
 c.weekend={phase:'Q2',inventories:[[{id:'S1',wear:.37}]]};delete c.teams;delete c.aeroSpec;delete c.developmentSeed;
 const loaded=loadCareer({getItem:()=>JSON.stringify(c)});
 assert.equal(loaded.cash,23000);assert.equal(loaded.round,4);assert.equal(loaded.season,2);assert.deepEqual(loaded.profile,profile);assert.equal(loaded.upgrades.engine,2);
 for(const key of ['suspension','brakes','efficiency','engineer','commercial'])assert.equal(loaded.upgrades[key],0);
 assert.equal(loaded.weekend.inventories[0][0].wear,.37);assert.equal(loaded.aeroSpec,'balanced');assert.equal(loaded.teams.length,11);
});
test('all purchases use quoted escalating costs and caps, and development cannot change during a weekend',()=>{
 const c=newCareer(profile);c.cash=1e6;
 for(const [key,u] of Object.entries(UPGRADES)){
  for(let n=0;n<u.max;n++){const cost=upgradeCost(c,key),cash=c.cash;assert.equal(buyUpgrade(c,key),true);assert.equal(c.cash,cash-cost);assert.equal(c.upgrades[key],n+1);}
  assert.equal(buyUpgrade(c,key),false);
 }
 const fresh=newCareer(profile);fresh.weekend={phase:'Q1'};const before=JSON.stringify(fresh);assert.equal(buyUpgrade(fresh,'engine'),false);assert.equal(JSON.stringify(fresh),before);assert.equal(buyUpgrade(fresh,'unknown'),false);
});
test('V10 development improves measured acceleration and aero packages suit different circuits',()=>{
 const before=developmentBench(emptyUpgrades()),after=developmentBench({...emptyUpgrades(),engine:1});
 assert.ok(after.accelerate<before.accelerate*.96);
 const c=newCareer(profile);c.upgrades.aero=1;assert.equal(setAeroPackage(c,'lowDrag'),true);assert.equal(loadCareer({getItem:()=>JSON.stringify(c)}).aeroSpec,'lowDrag');c.upgrades.aero=3;c.upgrades.engine=2;
 // The mirrored ±10% balance rewards Low drag on the fast oval; mixed
 // circuits can favour Balanced or High downforce despite their straights.
 selectTrack('sunset');assert.ok(developmentBench(c.upgrades,'lowDrag').lap<developmentBench(c.upgrades,'downforce').lap);
 selectTrack('harbour');assert.ok(developmentBench(c.upgrades,'downforce').lap<developmentBench(c.upgrades,'lowDrag').lap);
 assert.equal(setAeroPackage(c,'downforce'),true);c.weekend={};assert.equal(setAeroPackage(c,'lowDrag'),false);
 assert.equal(loadCareer({getItem:()=>JSON.stringify(c)}).aeroSpec,'downforce');
});
test('brakes and suspension improve usable force while worn slicks in rain remain severely grip-limited',()=>{
 const base=car(),brakes=car({brakes:5}),suspension=car({suspension:5});
 assert.ok(brakingDeceleration(brakes)>=brakingDeceleration(base)*1.24);assert.ok(accelerationGrip(suspension)>accelerationGrip(base));
 Object.assign(brakes,{tyre:'S',trackWetness:1,wear:.95,wheelWear:Array(4).fill(.95)});
 assert.ok(brakingDeceleration(brakes)<brakingDeceleration(base)*.15);
});
test('suspension strengthens active countersteer recovery without automatically steering for the driver',()=>{
 function recover(suspension,steer){
  const r=new Race({...setup,track:'velocity'}, {suspension}),p=r.player,loc=sample(900);r.cars=[p];
  Object.assign(p,{s:900,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle+.7,speed:220,sideSpeed:120,offset:0});
  for(let i=0;i<8;i++)r.stepPlayer(p,1/60,{steer,throttle:true});
  return Math.abs(angleDiff(p.motionAngle,p.angle));
 }
 assert.ok(recover(5,1)<recover(0,1));assert.ok(recover(5,0)>.1);
});
test('tyre engineering preserves tyres, softens the worn-grip cliff and controls excess heat',()=>{
 const base=car(),developed=car({tyres:5});
 resources(base,0,TRACK.length*3);resources(developed,0,TRACK.length*3);assert.ok(Math.abs(developed.wear/base.wear-.65)<1e-10);
 for(const c of [base,developed]){c.wear=.95;c.wheelWear=Array(4).fill(.95);}assert.ok(grip(developed)>grip(base));
 for(const c of [base,developed]){c.tyreTemperatureEnabled=true;c.tyreTemperatures=Array(4).fill(150);}
 for(let i=0;i<600;i++)for(const c of [base,developed])updateTyreTemperatures(c,1/60,{throttle:1,corner:1});
 assert.ok(developed.tyreTemperatures[0]<base.tyreTemperatures[0]);
});
test('fuel efficiency reduces real fuel burn and qualifying loads still cover the same three push laps',()=>{
 const a=car(),b=car({efficiency:5});resources(a,0,TRACK.length);resources(b,0,TRACK.length);
 assert.ok(Math.abs((30-b.fuel)/(30-a.fuel)-.9)<1e-10);
 const career=newCareer(profile);career.upgrades.efficiency=5;const w=createWeekend(career,setup),q=new QualifyingRun(w,'S1',career.upgrades,profile);
 assert.equal(q.player.fuel,getQualifyingFuel(career.upgrades));assert.ok(q.player.fuel<getQualifyingFuel());q.player.drive='push';resources(q.player,0,TRACK.length*3,.45);
 assert.ok(q.player.fuel>0&&q.player.fuel<.2);
});
test('pit crew improves preparation and keeps service within the existing physical time limits',()=>{
 const a=car(),b=car({crew:4});a.tyreTemperatureEnabled=true;b.tyreTemperatureEnabled=true;prepareTyres(a);prepareTyres(b);
 assert.equal(b.tyreTemperatures[0]-a.tyreTemperatures[0],6);
 const preview=upgradePreview({...newCareer(profile),upgrades:{...emptyUpgrades(),crew:3}},'crew');assert.match(preview.rows[0].after,/2.3–3.5s/);
});
test('commercial upgrades increase only earned sponsor income, preserving conditions and normal race prizes',()=>{
 const c=newCareer(profile);c.upgrades.commercial=3;c.sponsor='points';
 const r=settleCareer(c,{position:3,legal:true,dnf:false,contacts:0,penalties:0});
 assert.equal(r.bonus,1820);assert.equal(r.commercialBonus,420);assert.equal(r.basePrize,7500);
 c.sponsor='clean';assert.equal(settleCareer(c,{position:3,legal:true,dnf:false,contacts:0,penalties:1}).bonus,0);
 c.sponsor='finish';assert.equal(settleCareer(c,{position:3,legal:true,dnf:true}).bonus,0);
});
test('engineer levels unlock fuel/tyre estimates, weather windows, and pit traffic without claiming certainty',()=>{
 const r=new Race(setup),p=r.player;r.countdown=0;
 assert.equal(r.engineerReport().items.length,0);p.upgrades.engineer=1;assert.equal(r.engineerReport().items.length,2);
 p.upgrades.engineer=2;r.weather=createWeather('wetToDry');r.weather.wetness=1;r.weather.sectors.fill(1);r.weather.rain=.8;p.trackWetness=1;
 const weather=r.engineerReport();assert.equal(weather.items.length,3);assert.equal(weather.crossover.compound,'W');assert.equal(weather.crossover.seconds,0);
 p.upgrades.engineer=3;const report=r.engineerReport();assert.equal(report.items.length,4);assert.ok(report.rejoin>=1&&report.rejoin<=22);assert.ok(report.pitLoss>0);
 const mate=r.cars[20];mate.pit={stage:'service',timer:10};assert.ok(r.engineerReport().pitLoss>=report.pitLoss+9.9);
 p.fuel=.01;assert.ok(r.engineerReport().fuelMargin<0);
 r.cars=[p];r.time=25;r.messageUntil=0;r.updateEngineer();assert.match(r.message,/Fuel margin/);
});
test('AI development is seeded, budgeted, charged at the same prices and purchased only once per round',()=>{
 const a=newCareer(profile),b=newCareer(profile);assert.equal(developTeams(a,42),true);developTeams(b,42);assert.deepEqual(a.teams,b.teams);
 for(const t of a.teams.filter(t=>t.teamIndex!==profile.teamIndex)){
  const row=t.history[0],levels=emptyUpgrades();let spent=0;
  for(const purchase of row.purchases){assert.equal(purchase.cost,Math.round(UPGRADES[purchase.key].cost*(1+levels[purchase.key]*.85)));levels[purchase.key]++;spent+=purchase.cost;}
  assert.equal(t.budget,7000-spent);assert.ok(t.budget>=0);assert.deepEqual(t.upgrades,levels);
 }
 const before=JSON.stringify(a);assert.equal(developTeams(a,42),false);assert.equal(JSON.stringify(a),before);
 assert.deepEqual(loadCareer({getItem:()=>JSON.stringify(a)}),a);
});
test('opponent income uses their classification and sponsor conditions, then funds the next round',()=>{
 const c=newCareer(profile);developTeams(c,42);const before=structuredClone(c.teams);
 const field=TEAMS.flatMap((_,teamIndex)=>[0,1].map(n=>({teamIndex,position:teamIndex*2+n+1,legal:true,dnf:false,contacts:0,penalties:0,gridPosition:Math.min(22,teamIndex*2+n+4),stops:1})));
 settleCareer(c,{position:6,legal:true,dnf:false,field});
 for(const t of c.teams.filter(t=>t.teamIndex!==profile.teamIndex)){
  const contract=SPONSORS.find(s=>s.id===before[t.teamIndex].contractId),rows=field.filter(r=>r.teamIndex===t.teamIndex);
  const earned=Math.round(rows.reduce((sum,row)=>sum+4500+(23-row.position)*150+((['finish','clean','noContact','noPenalty','oneStop'].includes(contract.id)||contract.id==='top15'&&row.position<=15||contract.id==='points'&&row.position<=10||contract.id==='top5'&&row.position<=5||contract.id==='podium'&&row.position<=3||contract.id==='win'&&row.position===1||contract.id==='gain3'&&row.gridPosition-row.position>=3||contract.id==='gain6'&&row.gridPosition-row.position>=6)?sponsorPayout(t.upgrades,contract.amount):0),0)/2);
  assert.equal(t.budget,before[t.teamIndex].budget+earned);
 }
 developTeams(c,42);for(const t of c.teams.filter(t=>t.teamIndex!==profile.teamIndex))assert.equal(t.lastRound,2);
});
test('weekend snapshots freeze parts and packages for player and AI from qualifying to the race',()=>{
 const c=newCareer(profile);c.upgrades.aero=1;c.aeroSpec='downforce';const w=createWeekend(c,setup);
 const snapshot=structuredClone(w.setup);c.upgrades.engine=5;c.aeroSpec='lowDrag';
 const q=new QualifyingRun(w,'S1',c.upgrades,profile),r=new Race(w.setup,c.upgrades,'career',profile);
 assert.equal(q.player.upgrades.engine,snapshot.playerUpgrades.engine);assert.equal(r.player.aeroSpec,'downforce');
 for(const car of r.cars.filter(x=>!x.player)){const team=snapshot.teamDevelopment.find(t=>t.teamIndex===TEAMS.indexOf(car.team));assert.deepEqual(car.upgrades,team.upgrades);assert.equal(car.aeroSpec,team.aeroSpec);}
 w.phase='R';w.grid=Array.from({length:22},(_,i)=>i);prepareRace(r,w,'M1');assert.equal(r.player.upgrades.engine,0);assert.deepEqual(w.setup,snapshot);
});
test('every upgrade has a concrete before/after preview without changing cash, parts or track',()=>{
 const c=newCareer(profile),before=JSON.stringify(c);for(const key of Object.keys(UPGRADES)){
  const preview=upgradePreview(c,key);assert.ok(preview.rows.length);assert.ok(preview.rows.every(r=>r.before&&!r.before.includes('NaN')&&r.after&&!r.after.includes('undefined')));
 }
 assert.equal(JSON.stringify(c),before);assert.equal(TRACK.id,'northline');
});
for(const circuit of ['northline','velocity','metro'])test(`${circuit}: fully developed AI cars complete dry and wet laps with shared grip rules`,()=>{
 for(const [weather,tyre] of [['dry','M'],['wetToDry','W']]){
  const max=Object.fromEntries(Object.entries(UPGRADES).map(([k,u])=>[k,u.max]));
  const r=new Race({...setup,track:circuit,laps:2,weather,fuel:5,teamDevelopment:TEAMS.map((_,teamIndex)=>({teamIndex,upgrades:max,aeroSpec:weather==='dry'?'lowDrag':'downforce'}))});
  r.countdown=0;r.cars=r.cars.slice(0,2);for(const c of r.cars){c.tyre=tyre;c.fuel=5;c.used=new Set(['M','H','W']);}
  for(let i=0;i<30*200&&!r.cars.every(c=>c.finished||c.dnf);i++)r.step(1/30);
  assert.ok(r.cars.every(c=>c.finished&&!c.dnf),weather);
 }
});

test('engineer respects finite weather tyre stock and includes current heat in remaining-life estimates',()=>{
 const r=new Race(setup,{engineer:2}),p=r.player;r.weather=createWeather('wetToDry');r.weather.wetness=1;r.weather.sectors.fill(1);p.trackWetness=1;
 p.tyreInventory=[{id:'M1',compound:'M',wear:0},{id:'W1',compound:'W',wear:1.1},{id:'I1',compound:'I',wear:0,returned:true}];p.tyrePhase='R';
 const report=r.engineerReport();assert.equal(report.crossover,null);assert.match(report.items[2],/no usable Intermediate or Wet/);
 p.tyreTemperatureEnabled=true;p.tyreTemperatures=[100,100,100,100];const ideal=r.engineerReport().tyreLaps;p.tyreTemperatures=Array(4).fill(165);assert.ok(r.engineerReport().tyreLaps<ideal);
});
test('disabled temperatures keep meaningful tyre and crew previews without promising inactive heat benefits',()=>{
 const c=newCareer(profile),crew=upgradePreview(c,'crew',{tyreTemperatureEnabled:false}),tyres=upgradePreview(c,'tyres',{tyreTemperatureEnabled:false});
 assert.equal(crew.rows.length,1);assert.equal(crew.rows[0].label,'Tyre service');assert.equal(tyres.rows.length,2);
 const r=new Race(setup);assert.ok(r.cars.every(c=>level(c.upgrades,'crew')===0),'baseline AI must not get free tyre preparation or service upgrades');
});
