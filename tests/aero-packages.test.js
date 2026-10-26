import test from 'node:test';
import assert from 'node:assert/strict';
import {Race,selectTrack,sample,grip,cleanAirTopSpeed,maximumSpeed} from '../src/core.js';
import {AERO_PACKAGES,aeroPackageSummary,emptyUpgrades,upgradeDetails} from '../src/development.js';
import {brakingTarget} from '../src/racecraft.js';
const approx=(actual,expected)=>assert.ok(Math.abs(actual-expected)<1e-9,`${actual} ≠ ${expected}`);
const car=(aeroSpec='balanced',extra={})=>({aeroSpec,upgrades:{...emptyUpgrades(),aero:3,engine:2},tyre:'M',wear:0,wheelWear:[0,0,0,0],speed:220,fuel:10,pace:.94,drive:'balanced',trackWetness:0,s:0,offset:0,tyreTemperatureEnabled:false,...extra});
test.afterEach(()=>selectTrack('northline'));
test('aero choices advertise equal and opposite cornering and top-speed changes',()=>{
 approx(AERO_PACKAGES.downforce.corner-1,1-AERO_PACKAGES.lowDrag.corner);
 approx(1-AERO_PACKAGES.downforce.top,AERO_PACKAGES.lowDrag.top-1);
 assert.equal(aeroPackageSummary('downforce'),'+10% cornering speed · −10% top speed');
 assert.equal(aeroPackageSummary('lowDrag'),'−10% cornering speed · +10% top speed');
 assert.equal(aeroPackageSummary('balanced'),'Even balance');
});
test('reference corner speeds change by ten percent across compounds, wear, water and speeds',()=>{
 for(const speed of [80,180,280,330])for(const [tyre,trackWetness,wear] of [['M',0,0],['S',0,.8],['W',1,.2],['I',.3,.4]]){
  const extra={speed,tyre,trackWetness,wear,wheelWear:Array(4).fill(wear)};
  const reference=Math.sqrt(225*grip(car('balanced',extra))/.01);
  approx(Math.sqrt(225*grip(car('downforce',extra))/.01)/reference,1.10);
  approx(Math.sqrt(225*grip(car('lowDrag',extra))/.01)/reference,.90);
 }
});
test('AI corner planning uses the same mirrored limits as player lateral grip',()=>{
 const line={length:3000,step:30,points:Array.from({length:100},()=>({offset:0,angle:0,distanceScale:1,curvature:.01}))};
 const target=spec=>brakingTarget(line,100,grip(car(spec)),200,maximumSpeed(car(spec)));
 approx(target('downforce')/target('balanced'),1.10);approx(target('lowDrag')/target('balanced'),.90);
});
test('package top-speed ratios remain symmetric with fuel, drive mode and engine development',()=>{
 for(const engine of [0,2,5])for(const fuel of [1,30])for(const drive of ['save','balanced','push']){
  const extra={fuel,drive,upgrades:{...emptyUpgrades(),aero:1,engine}};
  const balanced=cleanAirTopSpeed(car('balanced',extra));
  approx(cleanAirTopSpeed(car('downforce',extra))/balanced,.90);
  approx(cleanAirTopSpeed(car('lowDrag',extra))/balanced,1.10);
 }
 const factory={upgrades:emptyUpgrades()};
 approx(cleanAirTopSpeed(car('downforce',factory))/cleanAirTopSpeed(car('balanced',factory)),1);
 approx(grip(car('lowDrag',factory))/grip(car('balanced',factory)),1);
});
test('actual player acceleration reaches each package ceiling without a hidden 330 cap',()=>{
 for(const [aeroSpec,expected] of [['balanced',330],['downforce',297],['lowDrag',363]]){
  const r=new Race({track:'northline',laps:16,fuel:19,tyre:'M',weather:'dry',aiSeed:42,tyreTemperatureEnabled:false},{aero:1,engine:5});
  const c=r.player;r.cars=[c];c.aeroSpec=aeroSpec;c.speed=0;const loc=sample(350);
  for(let i=0;i<3600;i++){
   Object.assign(c,{s:350,x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,offset:0,fuel:1,wear:0,wheelWear:[0,0,0,0],drive:'push'});
   r.stepPlayer(c,1/60,{throttle:true});
  }
  approx(c.speed,expected*1.02);
  c.slipstream={strength:1,carry:1};approx(maximumSpeed(c),expected*1.02+18);
 }
});
test('installed upgrade explanations reflect the owned level and actual service limits',()=>{
 assert.match(upgradeDetails('tyres',3).description,/21% less tyre wear/);
 assert.match(upgradeDetails('brakes',2).description,/10% more braking force/);
 assert.match(upgradeDetails('crew',2).description,/2.3–4.5 seconds/);
 assert.match(upgradeDetails('engineer',3).description,/pit rejoin position and traffic/);
 assert.equal(upgradeDetails('unknown',2),null);
});
