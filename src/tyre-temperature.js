import {paceMode} from "./performance.js";
import {level} from "./development.js";
// FL, FR, RL, RR. Temperatures are degrees Celsius; wear is permanent.
export const WHEELS = ['FL','FR','RL','RR'];
export const THERMAL = {
  S:{low:82,high:110,heat:1.04}, M:{low:86,high:116,heat:1},
  H:{low:90,high:124,heat:.92}, I:{low:62,high:90,heat:1}, W:{low:52,high:74,heat:1},
};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const average=a=>a.reduce((s,v)=>s+v,0)/a.length;
const valid=a=>Array.isArray(a)&&a.length===4&&a.every(Number.isFinite);
export function holdOptimalTemperature(car){
  const {low,high}=THERMAL[car.tyre] || THERMAL.M;
  car.tyreTemperatures=Array(4).fill((low+high)/2);
  if(car.tyreSet)car.tyreSet.temperatures=[...car.tyreTemperatures];
}
export function prepareTyres(car,set=null,grid=false){
  const spec=THERMAL[car.tyre] || THERMAL.M;
  const prepared=spec.low-(grid ? -4 : 9-level(car.upgrades,"crew")*1.5);
  car.tyreTemperatures=valid(set?.temperatures) ? set.temperatures.map(t=>Math.max(prepared,t)) : Array(4).fill(prepared);
  car.wheelWear=valid(set?.wheelWear) ? [...set.wheelWear] : Array(4).fill(car.wear || 0);
  if(car.tyreTemperatureEnabled===false)holdOptimalTemperature(car);
  if(set){set.temperatures=[...car.tyreTemperatures];set.wheelWear=[...car.wheelWear];}
}
export function thermalFactor(compound,temp){
  const {low,high}=THERMAL[compound] || THERMAL.M;
  if(temp<low)return 1-.16*clamp((low-temp)/45,0,1);
  // Mild heat is recoverable; substantial traction loss requires sustained overheating.
  if(temp>high)return 1-.16*clamp((temp-high)/55,0,1)**1.5;
  return 1;
}
export function thermalGrip(car,axis='all'){
  if(car.tyreTemperatureEnabled===false)return 1;
  if(!valid(car.tyreTemperatures))return 1;
  const factors=car.tyreTemperatures.map(t=>thermalFactor(car.tyre,t));
  return average(axis==='front' ? factors.slice(0,2) : axis==='rear' ? factors.slice(2) : factors);
}
const hotWear=(temp,high)=>1+1.2*clamp((temp-high-5)/45,0,1)**1.3;
export function thermalWear(car){
  if(car.tyreTemperatureEnabled===false)return 1;
  if(!valid(car.tyreTemperatures))return 1;
  const {high}=THERMAL[car.tyre] || THERMAL.M;
  return average(car.tyreTemperatures.map(t=>hotWear(t,high)));
}
export function temperatureStatus(compound,temp){
  const {low,high}=THERMAL[compound] || THERMAL.M;
  return temp<low-12 ? 'Cold' : temp<low ? 'Ready' : temp<=high ? 'Ideal' : temp<high+18 ? 'Hot' : 'Overheated';
}
export function temperatureColour(compound,temp){
  const {low,high}=THERMAL[compound] || THERMAL.M;
  const stops=[[low-35,[126,201,255]],[low-12,[92,190,164]],[low,[172,220,105]],[(low+high)/2,[247,211,96]],[high+12,[255,146,71]],[high+30,[244,71,80]]];
  if(temp<=stops[0][0])return 'rgb(126,201,255)';
  for(let i=1;i<stops.length;i++)if(temp<=stops[i][0]){
    const a=stops[i-1],b=stops[i],t=(temp-a[0])/(b[0]-a[0]);return `rgb(${a[1].map((v,j)=>Math.round(v+(b[1][j]-v)*t)).join(',')})`;
  }
  return 'rgb(244,71,80)';
}
export function coolStoredSets(car,dt,ambient=24){
  if(car.tyreTemperatureEnabled===false){
    for(const set of car.tyreInventory || []){const {low,high}=THERMAL[set.compound] || THERMAL.M;set.temperatures=Array(4).fill((low+high)/2);}
    return;
  }
  for(const set of car.tyreInventory || [])if(set!==car.tyreSet && valid(set.temperatures))
    set.temperatures=set.temperatures.map(t=>ambient+(t-ambient)*Math.exp(-.022*dt));
}
export function updateTyreTemperatures(car,dt,load={}){
  if(car.tyreTemperatureEnabled===false){holdOptimalTemperature(car);return;}
  if(!valid(car.tyreTemperatures))prepareTyres(car,car.tyreSet,true);
  const spec=THERMAL[car.tyre] || THERMAL.M,water=clamp(car.trackWetness || 0,0,1);
  const speed=Math.abs(car.speed || 0),moving=clamp(speed/150,0,1);
  const parked=car.garage || car.pit?.stage==='service';
  const ambient=24-6*water,target=parked ? spec.low-9 : ambient;
  const throttle=clamp(load.throttle || 0,0,1),brake=clamp(load.brake || 0,0,1);
  const corner=clamp(Math.abs(load.corner || 0),0,1.3)*moving;
  const turn=Math.sign(load.corner || 0),slide=clamp(car.sliding || 0,0,1);
  const dryWet=car.tyre==='W' ? 1-clamp(water/.55,0,1) : car.tyre==='I' ? 1-clamp(water/.18,0,1) : 0;
  const cooling=parked ? .055 : .033+speed*.00018+water*.075;
  car.tyreTemperatures=car.tyreTemperatures.map((temp,i)=>{
    const front=i<2,outside=(turn>0 ? i%2===0 : i%2===1); // Positive yaw is a right turn on canvas.
    const roll=4.4*(speed/200)**.7;
    const cornerHeat=corner*(outside ? 2.2 : 1.1);
    const braking=brake*moving*(front ? 4 : 2);
    const power=throttle*paceMode(car).power*moving*(front ? .35 : 1.25+2.2*clamp(load.wheelspin || 0,0,1));
    const sliding=slide*moving*(front ? 1.1 : 2); // Capped: one slide cannot cause runaway heat.
    const heat=parked ? 0 : (roll+cornerHeat+braking+power+sliding+dryWet*6*moving)*spec.heat;
    const excessCooling=parked ? 0 : level(car.upgrades,"tyres")*.006*clamp((temp-spec.high)/20,0,1);
    const rate=cooling+excessCooling;
    const equilibrium=target+heat/rate;
    // Warm-up remains responsive, but the carcass absorbs sustained heat gradually.
    // Cooling retains full authority so backing off actually helps recovery.
    const response=equilibrium>temp && temp>=spec.low ? .55 : 1;
    return clamp(equilibrium+(temp-equilibrium)*Math.exp(-rate*dt*response),ambient,175);
  });
  if(car.tyreSet)car.tyreSet.temperatures=[...car.tyreTemperatures];
}
export function distributeWear(car,amount,load={}){
  if(!valid(car.wheelWear))car.wheelWear=Array(4).fill(car.wear || 0);
  // Reconcile old saves or callers that update the aggregate condition directly.
  const shift=(car.wear || 0)-average(car.wheelWear);
  const corner=Math.sign(load.corner || 0),magnitude=clamp(Math.abs(load.corner || 0),0,1);
  const factors=car.wheelWear.map((_,i)=>1+(i<2 ? (load.brake || 0)*.25 : (load.throttle || 0)*.12)+
    ((corner>0 ? i%2===0 : i%2===1) && corner ? magnitude*.2 : 0));
  const {high}=THERMAL[car.tyre] || THERMAL.M;
  if(car.tyreTemperatureEnabled!==false && valid(car.tyreTemperatures))for(let i=0;i<4;i++)factors[i]*=hotWear(car.tyreTemperatures[i],high);
  const mean=average(factors);
  car.wheelWear=car.wheelWear.map((w,i)=>clamp(w+shift+amount*factors[i]/mean,0,1.12));
  car.wear=average(car.wheelWear);
  if(car.tyreSet){car.tyreSet.wear=car.wear;car.tyreSet.wheelWear=[...car.wheelWear];}
}
