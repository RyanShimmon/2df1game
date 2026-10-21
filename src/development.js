// Shared development prices and mechanical effects: player and AI buy the same parts.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const UPGRADES={
 engine:{name:"V10 development",desc:"Stronger acceleration, especially out of slow corners. Normal top speed stays capped at 330 km/h.",cost:6000,max:5,group:"Powertrain"},
 efficiency:{name:"Fuel efficiency",desc:"2% less fuel per level. Start lighter or spend longer in Push.",cost:5000,max:5,group:"Powertrain"},
 aero:{name:"Aerodynamics",desc:"More high-speed corner support. Unlocks High downforce and Low drag packages at level 1.",cost:5000,max:5,group:"Chassis"},
 suspension:{name:"Suspension & differential",desc:"More progressive traction and stronger countersteer recovery. You still control the slide.",cost:5000,max:5,group:"Chassis"},
 brakes:{name:"Brakes & balance",desc:"Stronger, more stable braking. Compound, wear, temperature and rain still limit stopping power.",cost:4500,max:5,group:"Chassis"},
 tyres:{name:"Tyre engineering",desc:"7% less wear per level, a gentler grip cliff and better control of excess heat.",cost:4500,max:5,group:"Race operations"},
 crew:{name:"Pit crew training",desc:"Narrower service-time range and better tyre preparation. Minimum tyre change remains 2.3 seconds.",cost:3500,max:4,group:"Race operations"},
 engineer:{name:"Race engineer",desc:"L1: fuel and tyre estimates. L2: weather crossover windows. L3: pit rejoin and traffic estimates.",cost:3500,max:3,group:"Race operations"},
 commercial:{name:"Commercial development",desc:"10% more sponsor income per level. Contract conditions still have to be met.",cost:4500,max:3,group:"Team business"},
};
export const AERO_PACKAGES={
 balanced:{name:"Balanced",desc:"An all-round package for mixed circuits.",grip:0,drag:1,top:1},
 downforce:{name:"High downforce",desc:"More grip in fast corners; extra drag and a lower straight-line ceiling.",grip:.10,drag:1.08,top:.975},
 lowDrag:{name:"Low drag",desc:"Less drag and stronger straight-line speed; less cornering support.",grip:-.05,drag:.92,top:1.015},
};
export const emptyUpgrades=()=>Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0]));
export const level=(upgrades,key)=>clamp(Number(upgrades?.[key])||0,0,UPGRADES[key]?.max || 0);
export function normalizeUpgrades(upgrades={}){return Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,Math.floor(level(upgrades,k))]));}
export const upgradePrice=(upgrades,key)=>UPGRADES[key] ? Math.round(UPGRADES[key].cost*(1+level(upgrades,key)*.6)) : Infinity;
export const fuelMultiplier=upgrades=>1-level(upgrades,"efficiency")*.02;
export const sponsorMultiplier=upgrades=>1+level(upgrades,"commercial")*.10;
export const sponsorPayout=(upgrades,amount)=>Math.round(amount*sponsorMultiplier(upgrades));
export function aeroPackage(upgrades,spec="balanced"){return level(upgrades,"aero")>0 && AERO_PACKAGES[spec] ? AERO_PACKAGES[spec] : AERO_PACKAGES.balanced;}
export function aeroGrip(car){
 const speed=clamp(Math.abs(car.speed || 0)/280,0,1),support=.35+.65*speed*speed;
 return (1+level(car.upgrades,"aero")*.035*support)*(1+aeroPackage(car.upgrades,car.aeroSpec).grip*support);
}
export function setAeroPackage(career,spec){
 if(career.weekend || !AERO_PACKAGES[spec] || (spec!=="balanced" && level(career.upgrades,"aero")===0))return false;
 career.aeroSpec=spec;return true;
}
export function createTeamDevelopment(){return Array.from({length:11},(_,teamIndex)=>({teamIndex,budget:7000,upgrades:emptyUpgrades(),aeroSpec:"balanced",lastRound:0,fundedRound:0,history:[]}));}
export function migrateDevelopment(career){
 career.aeroSpec=AERO_PACKAGES[career.aeroSpec] && (career.aeroSpec==="balanced" || level(career.upgrades,"aero")>0) ? career.aeroSpec : "balanced";
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
 const round=(career.season-1)*6+career.round;let changed=false;
 for(const team of career.teams){
  if(team.teamIndex===career.profile?.teamIndex || team.lastRound>=round)continue;
  const random=randomFor(career.developmentSeed,team.teamIndex,round),purchases=[];let spent=0;
  for(let n=0;n<2;n++){
   const available=Object.keys(UPGRADES).filter(k=>team.upgrades[k]<UPGRADES[k].max && upgradePrice(team.upgrades,k)<=team.budget);
   if(!available.length || (n>0 && random()<.5))break;
   const weights=available.map(k=>["engine","aero","tyres","suspension","brakes"].includes(k) ? 2.3+random() : 1+random());
   let pick=random()*weights.reduce((s,v)=>s+v,0),key=available.at(-1);
   for(let i=0;i<available.length;i++){pick-=weights[i];if(pick<=0){key=available[i];break;}}
   const cost=upgradePrice(team.upgrades,key);team.budget-=cost;spent+=cost;team.upgrades[key]++;
   purchases.push({key,level:team.upgrades[key],cost});
  }
  team.lastRound=round;team.history.unshift({round,spent,purchases,balance:team.budget});team.history=team.history.slice(0,12);changed=true;
 }
 return changed;
}
export function developmentSnapshot(career,trackId){
 const fast=["velocity","sunset","dunes","canyon"].includes(trackId),technical=["harbour","riviera","forest","metro"].includes(trackId);
 return career.teams.map(t=>t.teamIndex===career.profile?.teamIndex
  ? {teamIndex:t.teamIndex,upgrades:normalizeUpgrades(career.upgrades),aeroSpec:career.aeroSpec || "balanced"}
  : {teamIndex:t.teamIndex,upgrades:normalizeUpgrades(t.upgrades),aeroSpec:level(t.upgrades,"aero") ? fast ? "lowDrag" : technical ? "downforce" : "balanced" : "balanced"});
}
export function sponsorMet(id,row){
 const legal=!row.dnf && row.legal!==false;
 return legal && (id==="finish" || id==="top15" && row.position<=15 || id==="points" && row.position<=10 || id==="clean" && !row.penalties && (row.contacts || 0)<=2);
}
export function fundTeams(career,result,sponsors,difficultyBonus=0){
 migrateDevelopment(career);const round=(career.season-1)*6+career.round;
 for(const team of career.teams){
  if(team.teamIndex===career.profile?.teamIndex || team.fundedRound>=round)continue;
  const rows=(result.field || []).filter(r=>r.teamIndex===team.teamIndex);
  const contract=sponsors[(team.teamIndex+round)%sponsors.length];
  const earned=rows.length ? Math.round(rows.reduce((sum,row)=>{
   const base=!row.dnf && row.legal!==false ? 2500+(23-row.position)*300 : 750;
   return sum+base+(!row.dnf && row.legal!==false ? Math.round(base*difficultyBonus) : 0)+(sponsorMet(contract.id,row)?sponsorPayout(team.upgrades,contract.amount):0);
  },0)/rows.length) : 750;
  team.budget+=earned;team.fundedRound=round;team.lastIncome={round,earned,contract:contract.name};
 }
}
