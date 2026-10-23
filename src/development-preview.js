import {UPGRADES,level,fuelMultiplier,sponsorPayout,aeroPackage} from "./development.js";
import {TRACK,AI_LINE,TYRES,acceleration,accelerationGrip,brakingDeceleration,grip,maximumSpeed,estimatedTyreLife,clamp} from "./core.js";
import {brakingTarget,racingPoint} from "./racecraft.js";
const cache=new Map();
export function developmentBench(upgrades={},aeroSpec="balanced"){
 const key=TRACK.id+JSON.stringify(upgrades)+aeroSpec;if(cache.has(key))return cache.get(key);
 const c={upgrades,aeroSpec,tyre:"M",wear:0,wheelWear:[0,0,0,0],fuel:6,speed:0,s:0,offset:0,pace:.94,drive:"balanced",trackWetness:0,tyreTemperatureEnabled:false};
 let accelerate=0;
 for(;accelerate<30&&c.speed<250;accelerate+=.02)c.speed+=acceleration(c)*clamp(accelerationGrip(c),.25,1)*.02;
 c.speed=250;let braking=0;
 for(;braking<30&&c.speed>.5;braking+=.01)c.speed=Math.max(0,c.speed-(brakingDeceleration(c)+4+c.speed*.012)*.01);
 const ceiling=330*aeroPackage(upgrades,aeroSpec).top;
 const rollStart=Math.round(ceiling*.75),rollEnd=Math.round(ceiling*.95);
 c.speed=rollStart;c.drive="push";c.pace=1;let highSpeed=0;
 for(;highSpeed<30 && c.speed<rollEnd;highSpeed+=.02)c.speed+=acceleration(c)*clamp(accelerationGrip(c),.25,1)*.02;
 c.drive="balanced";c.pace=.94;
 let clock=0,lapStart=null;c.s=0;c.speed=180;
 for(let n=0;n<12000&&c.s<2*TRACK.length;n++){
  const brake=brakingDeceleration(c),target=brakingTarget(AI_LINE,c.s,grip(c),brake*.82,maximumSpeed(c));
  c.speed+=clamp(target-c.speed,-brake*.05,acceleration(c)*clamp(accelerationGrip(c),.25,1)*.05);
  c.s+=c.speed*.05/Math.max(.6,racingPoint(AI_LINE,c.s).distanceScale);clock+=.05;
  if(lapStart===null&&c.s>=TRACK.length)lapStart=clock;
 }
 c.speed=220;
 const data={accelerate,highSpeed,rollStart,rollEnd,braking,lap:lapStart===null?Infinity:clock-lapStart,corner:Math.sqrt(225*grip(c)/.006),medium:estimatedTyreLife("M",{upgrades}),soft:estimatedTyreLife("S",{upgrades}),fuel:24*1.1*fuelMultiplier(upgrades),crewMax:Math.max(2.3,5.5-level(upgrades,"crew")*.5),traction:level(upgrades,"suspension")*2.5,recovery:level(upgrades,"suspension")*6,sponsor:sponsorPayout(upgrades,6500),package:aeroPackage(upgrades,aeroSpec).name};
 cache.set(key,data);return data;
}
export function upgradePreview(career,key,{tyreTemperatureEnabled=true}={}){
 const before=developmentBench(career.upgrades,career.aeroSpec),next={...career.upgrades,[key]:level(career.upgrades,key)+1},after=developmentBench(next,career.aeroSpec);
 const metric=(label,a,b,unit="",digits=1)=>({label,before:typeof a==="number"?a.toFixed(digits)+unit:a,after:typeof b==="number"?b.toFixed(digits)+unit:b});
 const rows={
 engine:[metric("0–250 km/h",before.accelerate,after.accelerate,"s",2),metric(`${before.rollStart}–${before.rollEnd} km/h`,before.highSpeed,after.highSpeed,"s",2)],
 efficiency:[metric("Fuel for 24 balanced laps",before.fuel,after.fuel," fuel laps")],
 aero:[metric("Reference corner speed",before.corner,after.corner," km/h"),metric("Available packages",level(career.upgrades,"aero")?"3":"1","3")],
 suspension:[metric("Traction support",before.traction,after.traction,"%"),metric("Countersteer support",before.recovery,after.recovery,"%")],
 brakes:[metric("250–0 km/h",before.braking,after.braking,"s",2)],
 tyres:[metric("Soft life",before.soft,after.soft," laps"),metric("Medium life",before.medium,after.medium," laps")],
 crew:[metric("Tyre service",`2.3–${before.crewMax.toFixed(1)}s`,`2.3–${after.crewMax.toFixed(1)}s`),...(tyreTemperatureEnabled ? [metric("Tyre preparation",`+${level(career.upgrades,"crew")*1.5}°C`,`+${level(next,"crew")*1.5}°C`)] : [])],
 engineer:[metric("Engineer briefing",["Basic radio","Fuel + tyre estimates","Weather crossover windows","Pit rejoin + traffic"][level(career.upgrades,key)],["Basic radio","Fuel + tyre estimates","Weather crossover windows","Pit rejoin + traffic"][level(next,key)])],
 commercial:[metric("Successful £6,500 contract",`£${before.sponsor.toLocaleString("en-GB")}`,`£${after.sponsor.toLocaleString("en-GB")}`)],
 }[key] || [];
 if(["engine","aero","brakes","suspension"].includes(key))rows.push(metric(`${TRACK.name} · solo lap`,before.lap,after.lap,"s",2));
 return {name:UPGRADES[key].name,rows,lapGain:before.lap-after.lap};
}
