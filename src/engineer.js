import {thermalWear} from "./tyre-temperature.js";
import {fuelMultiplier,level} from "./development.js";
import {forecastWater} from "./racecraft.js";
import {tyreWeatherGrip} from "./weather.js";
import {selectableSets} from "./tyre-stock.js";
export function engineerReport(race,{track,pitLane,tyres,progress}){
 const p=race.player,lvl=level(p.upgrades,"engineer"),items=[];
 if(!lvl)return {level:0,items};
 const remaining=race.qualifying ? p.qState==="out" ? 3 : p.qState==="timed" ? 2 : 1 : Math.max(0,race.laps-progress(p)/track.length);
 const mode=p.drive==="push" ? 1.18 : p.drive==="save" ? .72 : 1;
 const burn=(.85+.25*mode)*fuelMultiplier(p.upgrades),fuelMargin=p.fuel-remaining*burn;
 const water=p.trackWetness ?? race.weather.wetness;
 const weatherWear=["I","W"].includes(p.tyre) ? 1+Math.max(0,(p.tyre==="W"?.55:.28)-water)*5 : 1-water*.25;
 const tyreLaps=tyres[p.tyre].life*Math.max(0,.82-p.wear)/(mode*weatherWear*thermalWear(p)*(1+(p.sliding || 0)*.5)*(1-level(p.upgrades,"tyres")*.07));
 items.push(`Fuel margin: ${fuelMargin>=0?"+":""}${fuelMargin.toFixed(1)} fuel laps at ${p.drive || "balanced"} pace${fuelMargin<0 ? "; use Save or lift earlier" : "; on target"}.`);
 items.push(`${tyres[p.tyre].name}: about ${tyreLaps.toFixed(1)} laps before the grip cliff.`);
 let crossover=null;
 if(lvl>=2){
  const sets=p.tyreInventory ? selectableSets(p.tyreInventory,p.tyrePhase || "R") : Object.keys(tyres).map(compound=>({compound,wear:0}));
  const family=t=>["I","W"].includes(t) ? t : "dry";
  let peak=water,driest=water;
  for(let seconds=0;seconds<=180;seconds+=10){
   const w=forecastWater(race.weather,seconds),current=tyres[p.tyre].grip*tyreWeatherGrip(p.tyre,w);
   peak=Math.max(peak,w);driest=Math.min(driest,w);
   const best=sets.map(set=>({set,grip:tyres[set.compound].grip*tyreWeatherGrip(set.compound,w)*Math.max(.4,1-.3*set.wear**1.7)})).sort((a,b)=>b.grip-a.grip)[0];
   if(best && family(best.set.compound)!==family(p.tyre) && best.grip>current*1.16){crossover={seconds,compound:best.set.compound};break;}
  }
  const noWet=family(p.tyre)==="dry" && peak>.25 && !sets.some(s=>["I","W"].includes(s.compound));
  const noDry=family(p.tyre)!=="dry" && driest<.1 && !sets.some(s=>["S","M","H"].includes(s.compound));
  items.push(noWet ? "Wet conditions expected; no usable Intermediate or Wet sets remain." : noDry ? "The track is drying; no usable dry sets remain." : crossover ? `${tyres[crossover.compound].name} crossover ${crossover.seconds ? `in roughly ${crossover.seconds}s` : "window is open"}; confirm surface wetness.` : "No clear tyre crossover predicted in the next 3 minutes.");
 }
 let rejoin=null,pitLoss=null;
 if(lvl>=3 && !race.qualifying){
  const lap=p.lastLap>0 ? p.lastLap : Number.isFinite(p.bestLap) ? p.bestLap : track.length/(205*(p.pace || 1));
  const speed=track.length/Math.max(15,lap),service=(2.3+Math.max(2.3,5.5-level(p.upgrades,"crew")*.5))/2;
  const queue=race.cars.find(c=>c!==p&&c.team.name===p.team.name&&c.pit?.stage==="service");
  pitLoss=Math.max(0,pitLane.length/80+service+(p.penalty || 0)+(queue?.pit.timer || 0)-(track.length-track.pitEntry+track.pitExit)/speed);
  const after=progress(p)-pitLoss*speed;
  const others=race.cars.filter(c=>c!==p&&!c.dnf).sort((a,b)=>progress(b)-progress(a));
  rejoin=1+others.filter(c=>progress(c)>after).length;
  const ahead=others.filter(c=>progress(c)>after).at(-1),behind=others.find(c=>progress(c)<=after);
  const traffic=ahead && progress(ahead)-after<speed*3 ? `close behind ${ahead.name}` : behind && after-progress(behind)<speed*3 ? `close ahead of ${behind.name}` : "with an estimated clear gap";
  items.push(`Pit now: roughly ${pitLoss.toFixed(1)}s lost; estimated rejoin P${rejoin}, ${traffic}.`);
 }
 return {level:lvl,items,fuelMargin,tyreLaps,crossover,rejoin,pitLoss};
}
