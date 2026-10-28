// Controlled comparisons, not a predicted human lap time. No save data is read.
// Run: node scripts/benchmark-tyres.mjs [track-id] > /tmp/tyre-benchmark.json
import {Race,TRACK,AI_LINE,CIRCUITS,sample,PIT_LANE,PIT_SPEED,TYRES,estimatedPitLoss} from '../src/core.js';
import {racingPoint} from '../src/racecraft.js';
const mode=process.argv[3] || 'balanced';
const selected=process.argv[2],circuits=CIRCUITS.filter(t=>!selected||t.id===selected);
if(!circuits.length)throw new Error('Unknown circuit: '+selected);
function measure(track,tyre,wearEnabled){
 const race=new Race({track,laps:1,fuel:6,tyre,weather:'dry',difficulty:'normal',aiSeed:42,tyreTemperatureEnabled:false});
 const car=race.cars[0],p=sample(0),reference=racingPoint(AI_LINE,0);
 Object.assign(car,{s:0,offset:reference.offset,x:p.x-Math.sin(p.angle)*reference.offset,y:p.y+Math.cos(p.angle)*reference.offset,
  angle:reference.angle,tyre,pace:1,speed:230,wear:0,wheelWear:[0,0,0,0],upgrades:{}});
 car.ai.strategy.plannedMode=mode;car.ai.mode=mode==='push'?'attack':mode==='save'?'conserve':'cruise';car.driverStyle.line=0;car.ai.nextDecision=Infinity;car.ai.strategy.nextReview=Infinity;
 race.cars=[car];race.traffic=[car];let completed=0,start=0,laps=[];
 for(let frame=0;frame<60*1600;frame++){
  car.fuel=6;
  if(!wearEnabled)Object.assign(car,{wear:0,wheelWear:[0,0,0,0]});
  race.time+=1/60;race.stepAI(car,1/60);
  if(Math.floor(car.s/TRACK.length)>completed){
   if(completed)laps.push({seconds:race.time-start,wear:car.wear});
   else Object.assign(car,{wear:0,wheelWear:[0,0,0,0]});
   start=race.time;completed++;
   if(wearEnabled ? car.wear>.90 : laps.length===2)break;
  }
 }
 return laps;
}
const results=circuits.map(track=>{
 const compounds=Object.fromEntries(['S','M','H'].map(tyre=>[tyre,{grip:TYRES[tyre].grip,nominalLife:TYRES[tyre].life,
  freshLapSeconds:measure(track.id,tyre,false).at(-1).seconds,stint:measure(track.id,tyre,true)}]));
 return {track:track.id,estimatedPitLossSeconds:estimatedPitLoss({pace:1,fuel:6,drive:mode,upgrades:{}}),compounds};
});
console.log(JSON.stringify({mode,conditions:'Normal AI, seed 42, selected pace mode, equal equipment, fixed fuel 6, dry, ideal temperature, 60 Hz, no traffic. Stints include wear; fresh laps hold wear at zero. Pit losses are estimates.',results},null,2));
