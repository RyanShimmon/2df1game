import {careerRound,migrateCalendar} from "./calendar.js";
import {sponsorMet,SPONSORS} from "./sponsors.js";
export {sponsorMet} from "./sponsors.js";
// Shared development prices and mechanical effects: player and AI buy the same parts.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const UPGRADES={
 engine:{name:"V10 development",desc:"7% more engine power per level, from corner exit all the way to top speed. Your aero package sets the top-speed trade-off.",cost:9000,max:5,group:"Powertrain"},
 efficiency:{name:"Fuel efficiency",desc:"2% less fuel per level. Start lighter or spend longer in Push.",cost:7500,max:5,group:"Powertrain"},
 aero:{name:"Aerodynamics",desc:"More high-speed corner support with every aero package. Level 1 unlocks aero package selection before sessions and during pit stops.",cost:8500,max:5,group:"Chassis"},
 suspension:{name:"Suspension & differential",desc:"More progressive traction and stronger countersteer recovery. You still control the slide.",cost:7500,max:5,group:"Chassis"},
 brakes:{name:"Brakes & balance",desc:"Stronger, more stable braking. Compound, wear, temperature and rain still limit stopping power.",cost:6500,max:5,group:"Chassis"},
 tyres:{name:"Tyre engineering",desc:"7% less wear per level, a gentler grip cliff and better control of excess heat.",cost:8500,max:5,group:"Race operations"},
 crew:{name:"Pit crew training",desc:"Narrower service-time range and better tyre preparation. Minimum tyre change remains 2.3 seconds.",cost:5000,max:4,group:"Race operations"},
 engineer:{name:"Race engineer",desc:"L1: fuel and tyre estimates. L2: weather crossover windows. L3: pit rejoin and traffic estimates.",cost:4000,max:3,group:"Race operations"},
 commercial:{name:"Commercial development",desc:"10% more sponsor income per level. Contract conditions still have to be met.",cost:4500,max:3,group:"Team business"},
};
// Corner speed scales with the square root of lateral grip. Derive force and
// drag from the advertised speed changes so the two packages really mirror.
const packageSpec=(name,desc,corner,top)=>({name,desc,corner,top,drag:top**-1.3});
export const AERO_PACKAGES={
 balanced:packageSpec("Balanced","An all-round package for mixed circuits.",1,1),
 downforce:packageSpec("High downforce","Faster cornering in exchange for lower straight-line speed.",1.10,.90),
 lowDrag:packageSpec("Low drag","Higher straight-line speed in exchange for slower cornering.",.90,1.10),
};
const percentage=value=>Math.abs(value).toFixed(1).replace(/\.0$/,"");
export function aeroPackageSummary(spec){
 const pack=AERO_PACKAGES[spec] || AERO_PACKAGES.balanced;
 if(pack===AERO_PACKAGES.balanced)return "Even balance";
 const change=value=>(value>=1?"+":"−")+percentage((value-1)*100)+"%";
 return change(pack.corner)+" cornering speed · "+change(pack.top)+" top speed";
}
export const emptyUpgrades=()=>Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0]));
export const level=(upgrades,key)=>clamp(Number(upgrades?.[key])||0,0,UPGRADES[key]?.max || 0);
export function normalizeUpgrades(upgrades={}){return Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,Math.floor(level(upgrades,k))]));}
export const upgradePrice=(upgrades,key)=>UPGRADES[key] ? Math.round(UPGRADES[key].cost*(1+level(upgrades,key)*.85)) : Infinity;
export const fuelMultiplier=upgrades=>1-level(upgrades,"efficiency")*.02;
export const sponsorMultiplier=upgrades=>1+level(upgrades,"commercial")*.10;
export const sponsorPayout=(upgrades,amount)=>Math.round(amount*sponsorMultiplier(upgrades));
export const aeroUnlocked=upgrades=>level(upgrades,"aero")>=1;
export function aeroPackage(upgrades,spec="balanced"){return aeroUnlocked(upgrades) && AERO_PACKAGES[spec] || AERO_PACKAGES.balanced;}
export function aeroGrip(car){
 const speed=clamp(Math.abs(car.speed || 0)/280,0,1),support=.35+.65*speed*speed;
 return (1+level(car.upgrades,"aero")*.035*support)*aeroPackage(car.upgrades,car.aeroSpec).corner**2;
}
export function setAeroPackage(career,spec){
 if(!aeroUnlocked(career.weekend?.setup?.playerUpgrades || career.upgrades) || career.weekend && career.weekend.phase!=="R" || !AERO_PACKAGES[spec])return false;
 career.aeroSpec=spec;
 if(career.weekend)career.weekend.setup.aeroSpec=spec;
 return true;
}
export function upgradeDetails(key,installedLevel){
 const upgrade=UPGRADES[key];if(!upgrade)return null;
 const n=Math.floor(level({[key]:installedLevel},key)),pct=value=>percentage(value)+"%";
 const descriptions={
  engine:`${pct(n*7)} more engine power across the entire speed range. Improves acceleration; the aero package still sets the speed trade-off.`,
  efficiency:`Uses ${pct(n*2)} less fuel. The car can start lighter or spend more time in Push.`,
  aero:`${pct(n*3.5)} more grip at high speed, with a smaller benefit at low speed. Unlocks High downforce and Low drag packages alongside Balanced.`,
  suspension:`${pct(n*2.5)} more traction support and ${pct(n*6)} more countersteer support. Helps put power down and recover slides.`,
  brakes:`${pct(n*5)} more braking force. Tyre compound, wear, temperature and rain still determine how much grip is available.`,
  tyres:`${pct(n*7)} less tyre wear, a gentler worn-tyre grip cliff and better control of overheating.`,
  crew:`Tyre changes take 2.3–${Math.max(2.3,5.5-n*.5).toFixed(1)} seconds. Replacement tyres are prepared ${percentage(n*1.5)}°C warmer when temperature simulation is enabled.`,
  engineer:["Basic race radio.","Adds fuel-margin and remaining tyre-life estimates.","Adds fuel and tyre estimates, plus predicted weather crossover windows.","Adds fuel and tyre estimates, weather crossover windows, and pit rejoin position and traffic estimates."][n],
  commercial:`Earns ${pct(n*10)} more on successful sponsor contracts. The sponsor's conditions still have to be met.`,
 };
 return {title:upgrade.name+" · Level "+n,description:n?descriptions[key]:upgrade.desc};
}
export const racePrize=(row,difficultyBonus=0)=>{
 const base=!row.dnf && row.legal!==false ? 4500+(23-row.position)*150 : 750;
 return {base,bonus:!row.dnf && row.legal!==false ? Math.round(base*difficultyBonus) : 0};
};
export function createTeamDevelopment(){return Array.from({length:11},(_,teamIndex)=>({teamIndex,budget:7000,upgrades:emptyUpgrades(),aeroSpec:"balanced",lastRound:0,fundedRound:0,history:[]}));}
export function migrateDevelopment(career){
 migrateCalendar(career);
 career.aeroSpec=aeroUnlocked(career.upgrades) && AERO_PACKAGES[career.aeroSpec] ? career.aeroSpec : "balanced";
 if(!Number.isInteger(career.developmentSeed))career.developmentSeed=null;
 const defaults=createTeamDevelopment();
 career.teams=defaults.map((fresh,i)=>{
  const old=career.teams?.find(t=>t?.teamIndex===i);
  if(!old || !Number.isFinite(old.budget) || old.budget<0)return fresh;
  return {...fresh,...old,upgrades:normalizeUpgrades(old.upgrades),history:Array.isArray(old.history)?old.history.slice(0,12):[]};
 });
}
const randomFor=(seed,team,round)=>{let state=((seed>>>0)^Math.imul(team+7,0x9e3779b9)^Math.imul(round,0x85ebca6b))>>>0;return()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};};
export function developTeams(career,seed=null){
 migrateDevelopment(career);
 if(career.developmentSeed===null)career.developmentSeed=(seed ?? Math.floor(Math.random()*2147483646)+1)>>>0;
 const round=careerRound(career);let changed=false;
 for(const team of career.teams){
  if(team.teamIndex===career.profile?.teamIndex || team.lastRound>=round)continue;
  const random=randomFor(career.developmentSeed,team.teamIndex,round),purchases=[];let spent=0;
  for(let n=0;n<12;n++){
   const available=Object.keys(UPGRADES).filter(k=>team.upgrades[k]<UPGRADES[k].max && upgradePrice(team.upgrades,k)<=team.budget);
   if(!available.length)break;
   const weights=available.map(k=>["engine","aero","tyres","suspension","brakes"].includes(k) ? 2.3+random() : 1+random());
   let pick=random()*weights.reduce((s,v)=>s+v,0),key=available.at(-1);
   for(let i=0;i<available.length;i++){pick-=weights[i];if(pick<=0){key=available[i];break;}}
   const cost=upgradePrice(team.upgrades,key);team.budget-=cost;spent+=cost;team.upgrades[key]++;
   purchases.push({key,level:team.upgrades[key],cost});
  }
  team.contractId=teamSponsor(team,round,career.developmentSeed).id;
  team.lastRound=round;team.history.unshift({round,spent,purchases,balance:team.budget});team.history=team.history.slice(0,12);changed=true;
 }
 return changed;
}
export function developmentSnapshot(career,trackId){
 const fast=["velocity","sunset","dunes","canyon"].includes(trackId),technical=["harbour","riviera","forest","metro"].includes(trackId);
 return career.teams.map(t=>t.teamIndex===career.profile?.teamIndex
  ? {teamIndex:t.teamIndex,upgrades:normalizeUpgrades(career.upgrades),aeroSpec:aeroUnlocked(career.upgrades) ? career.aeroSpec || "balanced" : "balanced"}
  : {teamIndex:t.teamIndex,upgrades:normalizeUpgrades(t.upgrades),aeroSpec:level(t.upgrades,"aero") ? fast ? "lowDrag" : technical ? "downforce" : "balanced" : "balanced"});
}
// Pick a plausible target before the race, using previous results rather than
// knowing the next classification. The same contract conditions bind both sides.
export function teamSponsor(team,round,seed=1,sponsors=SPONSORS){
 const place=team.lastIncome?.averagePosition ?? 11;
 const candidates=sponsors.filter(s=>["finish","clean","noContact","noPenalty",...(place<=15?["top15"]:[]),...(place<=11?["points"]:[]),...(place<=6?["top5"]:[]),...(place<=3?["podium"]:[])].includes(s.id));
 const random=randomFor(seed,team.teamIndex,round);
 return candidates[Math.floor(random()*candidates.length)] || sponsors[0];
}
export function fundTeams(career,result,sponsors=SPONSORS,difficultyBonus=0){
 migrateDevelopment(career);const round=careerRound(career);
 for(const team of career.teams){
  if(team.teamIndex===career.profile?.teamIndex || team.fundedRound>=round)continue;
  const rows=(result.field || []).filter(r=>r.teamIndex===team.teamIndex);
  const contract=sponsors.find(s=>s.id===team.contractId) || teamSponsor(team,round,career.developmentSeed,sponsors);
  const incomes=rows.map(row=>{
   const prize=racePrize(row,difficultyBonus);
   return {prize:prize.base+prize.bonus,sponsor:contract && sponsorMet(contract.id,{...row,raceFormat:row.raceFormat || result.raceFormat}) ? sponsorPayout(team.upgrades,contract.amount) : 0};
  });
  const average=key=>incomes.length ? Math.round(incomes.reduce((sum,row)=>sum+row[key],0)/incomes.length) : key==='prize'?750:0;
  const prize=average('prize'),sponsor=average('sponsor'),earned=prize+sponsor;
  team.budget+=earned;team.fundedRound=round;
  team.lastIncome={round,earned,prize,sponsor,contract:contract?.name || 'No contract',averagePosition:rows.length ? rows.reduce((sum,row)=>sum+row.position,0)/rows.length : 22};
 }
}
