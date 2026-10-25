import {paceMode,fuelPerLap,wearPerLap,tyreWearFactor,usefulWear} from './performance.js';
import {tyreWeatherGrip} from './weather.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const maskFor=compound=>({S:1,M:2,H:4,I:8,W:8}[compound] || 0);
const legal=mask=>(mask&8)!==0 || ((mask&7)!==0 && ((mask&7)&((mask&7)-1))!==0);
export const strategyWearLimit=(car,compound)=>Math.min(usefulWear(compound)+.04,car.ai?.strategy?.wearLimit ?? .86);
// A bounded whole-race search. Every branch spends a physical set, fuel and
// pit time; a compound's fresh-lap pace cannot stand in for a complete stint.
const openingPlans=new Map();
export function planRaceStrategy(car,{tyres,sets,remaining,water,futureWater,lapTime=35,pitLoss=18,starting=false,current=null,uncached=false}){
 if(starting && !car.tyreInventory && !uncached){
  const limit=Math.round((car.ai?.strategy?.wearLimit || .86)*20)/20;
  const waterBucket=Math.round(water*50)/50,futureBucket=Math.round(futureWater*50)/50;
  const key=JSON.stringify([remaining,waterBucket,futureBucket,lapTime,pitLoss,car.fuel,car.upgrades,car.raceFormat,limit,tyres]);
  if(!openingPlans.has(key)){
   const neutral={...car,ai:{...car.ai,strategy:{...car.ai.strategy,wearLimit:limit,compoundBias:{}}}};
   if(openingPlans.size>96)openingPlans.clear();
   openingPlans.set(key,planRaceStrategy(neutral,{tyres,sets,remaining,water:waterBucket,futureWater:futureBucket,lapTime,pitLoss,starting,uncached:true}));
  }
  return openingPlans.get(key).map(p=>({...p,set:sets.find(s=>s.compound===p.set.compound),plan:p.plan.map(s=>({...s,set:sets.find(t=>t.compound===s.set.compound)})),score:p.score+(car.ai?.strategy?.compoundBias?.[p.set.compound] || 0)*lapTime})).sort((a,b)=>a.score-b.score);
 }
 const strategy=car.ai?.strategy || {},total=Math.max(.1,remaining),unlimited=!car.tyreInventory;
 const initialMask=starting ? 0 : [...(car.used || [])].reduce((mask,t)=>mask|maskFor(t),0);
 const horizon=Math.max(1,(strategy.forecastHorizon || 60)/lapTime);
 const projectedWater=lap=>clamp(water+(futureWater-water)*Math.min(1,lap/horizon),0,1);
 const baseFuel=Number.isFinite(car.fuel)?car.fuel:total*1.15;
 const options=current ? [current] : sets;
 const outputs=[];
 for(const first of options){
  let beam=[{time:0,done:0,fuel:baseFuel,mask:initialMask,available:sets,stints:[],next:first}],best=null;
  for(let depth=0;depth<6 && beam.length;depth++){
   const expanded=[];
   for(const state of beam){
    const choices=state.next ? [state.next] : state.available;
    for(const set of choices){
     const left=total-state.done,limit=strategyWearLimit(car,set.compound),available=unlimited ? sets : state.available.filter(s=>s!==set && (!s.id || s.id!==set.id));
     for(const mode of ['save','balanced','push']){
      let wear=set.wear || 0,time=0,fuel=0;
      const rate=wearPerLap(set.compound,tyres,{mode,upgrades:car.upgrades,wetness:projectedWater(state.done)});
      const capacity=Math.max(.1,(limit-wear)/Math.max(.001,rate));
      const lengths=new Set([Math.min(left,capacity),Math.min(left,Math.max(1,capacity*.65)),Math.min(left,Math.max(1,capacity*.85)),left]);
      // Include splits that leave another actual set able to finish the race.
      for(const next of available){
       const nextLife=Math.max(0,strategyWearLimit(car,next.compound)-(next.wear || 0))/wearPerLap(next.compound,tyres,{mode:'balanced',upgrades:car.upgrades,wetness:futureWater});
       if(left-nextLife>0)lengths.add(Math.min(left,Math.max(1,left-nextLife)));
      }
      const targets=[...lengths].filter(n=>n>.05 && n<=Math.max(capacity,(.96-wear)/Math.max(.001,rate))+.01).sort((a,b)=>a-b);
      let travelled=0;
      for(const duration of targets){
       while(travelled<duration-.00001){
        const step=Math.min(1,duration-travelled),wet=projectedWater(state.done+travelled+step/2);
        const wearRate=wearPerLap(set.compound,tyres,{mode,upgrades:car.upgrades,wetness:wet});
        const midWear=wear+wearRate*step/2;
        const g=tyres[set.compound].grip*tyreWeatherGrip(set.compound,wet)*tyreWearFactor(set.compound,midWear,car.upgrades?.tyres);
        const pace=paceMode(mode),modeTime=pace.power**-.18*pace.top**-.20;
        time+=step*lapTime*Math.max(.75,Math.pow(1/Math.max(.08,g),.32))*modeTime;
        fuel+=step*fuelPerLap(mode,car.upgrades);
        wear+=step*wearRate;travelled+=step;
       }
       const finished=state.done+duration>=total-.01;
       if(wear>Math.max(limit,finished?.96:limit)+.001 || fuel+Math.max(0,left-duration)*fuelPerLap("save",car.upgrades)>state.fuel+.15)continue;
       const stop=state.stints.length ? pitLoss : 0;
       const preference=(strategy.compoundBias?.[set.compound] || 0)*lapTime*duration;
       const stints=[...state.stints,{set,mode,laps:duration,endWear:wear}];
       const next={time:state.time+time+stop+preference,done:state.done+duration,fuel:state.fuel-fuel,mask:state.mask|maskFor(set.compound),available,stints};
       if(finished){
        if(car.raceFormat!=='sprint' && !legal(next.mask))continue;
        if(!best || next.time<best.time)best=next;
       }else if(available.length)expanded.push(next);
      }
     }
    }
   }
   // Optimistic remaining pace keeps a long first stint from winning the beam
   // solely because it has not yet paid for the rest of the race.
   expanded.sort((a,b)=>(a.time+(total-a.done)*lapTime*.97)-(b.time+(total-b.done)*lapTime*.97));
   beam=expanded.slice(0,6);
  }
  if(best)outputs.push({set:first,score:best.time/total,totalTime:best.time,stops:best.stints.length-1,plan:best.stints,
   mode:best.stints[0].mode,stint:best.stints[0].laps,usable:Math.max(0,strategyWearLimit(car,first.compound)-(first.wear || 0))/wearPerLap(first.compound,tyres,{mode:best.stints[0].mode,upgrades:car.upgrades,wetness:water}),grip:tyres[first.compound].grip*tyreWeatherGrip(first.compound,water)});
 }
 return outputs.sort((a,b)=>a.score-b.score || String(a.set.id).localeCompare(String(b.set.id)));
}
