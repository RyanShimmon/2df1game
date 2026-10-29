// Shared by the physics, strategy planner and driver-facing estimates.
// Mechanical grip dominates below 80 km/h. Aero builds smoothly through
// medium-speed bends and reaches its full package effect at 280 km/h.
export function aeroGripMultiplier(speed,level=0,corner=1){
 const v=Math.max(0,Math.min(1,(Math.abs(speed)-80)/200)),support=.35+.65*Math.min(1,Math.abs(speed)/280)**2;
 return (1+level*.035*support)*(1+(corner-1)*v*v*(3-2*v))**2;
}
// Resolve the corner's own speed, rather than carrying straight-line downforce
// into a hairpin. Both AI braking and passing projections use this same curve.
export function corneringSpeed(grip,curvature,top,commitment=1,aero=null){
 const base=225*Math.max(.001,grip)/(Math.max(.0001,Math.abs(curvature))*(aero?.gripScale || 1));
 let speed=Math.min(top,Math.sqrt(base)*commitment);
 if(aero)for(let i=0;i<6;i++)speed=Math.min(top,Math.sqrt(base*aeroGripMultiplier(speed,aero.level,aero.corner))*commitment);
 return speed;
}

export const PACE_MODES = {
 save:{name:"Save",power:.88,top:.94,fuel:.90,wear:.82,response:2.8,description:"Gentler power. Save fuel and tyre life; recover hot tyres."},
 balanced:{name:"Balanced",power:1,top:1,fuel:1,wear:1,response:5,description:"Sustainable race pace with predictable power delivery."},
 push:{name:"Push",power:1.08,top:1.02,fuel:1.12,wear:1.20,response:7,description:"Stronger acceleration. Spend fuel and tyre life to attack."},
};
export const paceMode=value=>PACE_MODES[typeof value==="string" ? value : value?.drive] || PACE_MODES.balanced;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const paceOrder=Object.keys(PACE_MODES);
// Directional controls stop at each end; pressing again never wraps around.
export function stepPaceMode(current,direction){
 const index=paceOrder.indexOf(current);
 return paceOrder[clamp((index<0 ? 1 : index)+Math.sign(direction),0,paceOrder.length-1)];
}
export const fuelPerLap=(mode="balanced",upgrades={},load=1)=>1.1*paceMode(mode).fuel*(1-clamp(upgrades.efficiency || 0,0,5)*.02)*clamp(load,.82,1.15);
export function applyThrottle(car,requested,dt){
 const previous=car.throttleApplied || 0,target=clamp(requested,0,1);
 // Lifting is immediate. Power builds progressively, most gently in Save.
 car.throttleApplied=target<previous ? target : Math.min(target,previous+paceMode(car).response*dt);
 return car.throttleApplied;
}
export function tyreWearFactor(compound,wear,engineering=0){
 const profile={S:[.12,1.25,.78],M:[.09,1.5,.82],H:[.065,1.8,.86],I:[.10,1.5,.82],W:[.10,1.5,.82]}[compound] || [.09,1.5,.82];
 const w=Math.max(0,wear || 0),late=clamp((w-profile[2])/(1.08-profile[2]+clamp(engineering,0,5)*.012),0,1);
 return Math.max(.4,1-profile[0]*w**profile[1]-.55*late*late*(3-2*late));
}
export const usefulWear=compound=>({S:.82,M:.86,H:.90,I:.86,W:.86}[compound] || .86);
export function wearPerLap(compound,tyres,{mode="balanced",upgrades={},wetness=0,thermal=1,stress=1}={}){
 const water=clamp(wetness,0,1),weather=["I","W"].includes(compound) ? 1+Math.max(0,(compound==="W"?.55:.28)-water)*5 : 1-water*.25;
 return paceMode(mode).wear*weather*thermal*stress*(1-clamp(upgrades.tyres || 0,0,5)*.07)/tyres[compound].life;
}
export function stintLaps(compound,tyres,{wear=0,limit=usefulWear(compound),...options}={}){
 return Math.max(0,limit-wear)/wearPerLap(compound,tyres,options);
}

// Lateral and longitudinal tyre forces share one grip budget. A tyre with
// reserve grip can put power down earlier as a corner opens.
export function cornerAccelerationLimit(speed,curvature,grip){
 const force=225*Math.max(.001,grip),used=Math.min(1,speed*speed*Math.abs(curvature)/force);
 return force*Math.sqrt(Math.max(0,1-used*used));
}

// Net engine thrust used by live physics and the complete-lap line planner.
export function engineAcceleration(speed,{basePower,power,drag,packageTop=1,top,cleanTop=top,tow=0}){
 if(speed>cleanTop+.01 && tow<.02)return 0;
 const resistance=basePower*.82*(Math.max(0,speed)/330)**1.3*drag;
 const approach=clamp((speed/top-.60)/.40,0,1);
 const reserve=1-.84*approach*approach*(3-2*approach);
 return Math.max(0,power-resistance*(1-.16*tow)-4-speed*.012-Math.max(0,speed-330*packageTop)*.55)*reserve;
}
