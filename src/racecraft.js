import {tyreWeatherGrip, rainAt} from './weather.js';
import {selectableSets} from './tyre-stock.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=(v,n)=>((v%n)+n)%n;
const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function seededRandom(seed){
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
export function driverSeed(seed,id){return (Math.imul((seed>>>0)^0x9e3779b9,(id+1)*2+1)^0x85ebca6b)>>>0;}

// A continuous, bounded outside/apex/exit path. Curvature and braking are
// measured on this actual path, rather than on a constant-offset centreline.
export function buildRacingLine(track,sample,apexes){
  const count=Math.ceil(track.length/22),step=track.length/count;
  const margin=track.width/2-22;
  let offsets=Array.from({length:count},(_,i)=>{
    const s=i*step;let offset=0;
    for(const apex of apexes){
      const d=wrap(s-apex.s+track.length/2,track.length)-track.length/2;
      if(Math.abs(d)>450)continue;
      offset+=Math.sign(apex.k)*margin*(Math.exp(-((d/100)**2))-.78*Math.exp(-(((d+210)/120)**2))-.6*Math.exp(-(((d-190)/130)**2)));
    }
    return clamp(offset,-margin,margin);
  });
  for(let pass=0;pass<8;pass++)offsets=offsets.map((v,i)=>(offsets[wrap(i-1,count)]+2*v+offsets[(i+1)%count])/4);
  const points=offsets.map((offset,i)=>{const p=sample(i*step);return {s:i*step,offset,x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset};});
  for(let i=0;i<count;i++){
    const a=points[wrap(i-1,count)],b=points[i],c=points[(i+1)%count];
    b.angle=Math.atan2(c.y-a.y,c.x-a.x);
    const ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),ac=Math.hypot(c.x-a.x,c.y-a.y);
    b.curvature=2*((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))/Math.max(1,ab*bc*ac);
    b.distanceScale=(ab+bc)/(2*step);
  }
  const finalApex=apexes.at(-1)?.s ?? track.length*.94;
  // Prefer the road edge least used by the racing line; hold it through linked
  // corners instead of repeatedly sweeping from one edge to the other.
  const edge=track.width/2-14;
  const conflict=side=>points.filter(p=>Math.abs(p.offset-side*edge)<30).length;
  return {points,step,length:track.length,width:track.width,
    yieldSide:conflict(-1)<=conflict(1) ? -1 : 1,
    finalCornerStart:Math.max(track.length*.5,finalApex-180)};
}
export function racingPoint(line,s){
  const f=wrap(s,line.length)/line.step,i=Math.floor(f),t=f-i,a=line.points[i],b=line.points[(i+1)%line.points.length];
  return {offset:a.offset+(b.offset-a.offset)*t,angle:a.angle+angleDiff(b.angle,a.angle)*t,curvature:a.curvature+(b.curvature-a.curvature)*t,distanceScale:a.distanceScale+(b.distanceScale-a.distanceScale)*t};
}
// Out/in laps yield away from the fast line. A side is held while a timed
// car approaches, avoiding a last-second sweep across its path. Out laps may
// merge for the final corner only when the adjacent fast line is clear.
export function qualifyingLane(car,line,traffic){
  if(!["out","in"].includes(car.qState)) {car.ai.yieldSide=null;return null;}
  const pos=wrap(car.s,line.length),look=racingPoint(line,car.s+clamp((car.speed || 0)*.85,45,180));
  const nearby=traffic.filter(other=>{
    if(other.id===car.id || other.pit || other.garage || other.dnf || other.finished) return false;
    const gap=wrap(other.s-car.s+line.length/2,line.length)-line.length/2;
    return (Math.abs(gap)<65) || (other.qState==="timed" && gap<0 && gap>-Math.max(180,other.speed*2.2));
  });
  if(!car.ai.yieldSide) car.ai.yieldSide=line.yieldSide || (look.offset>=0 ? -1 : 1);
  const committed=nearby.some(other=>{
    const gap=wrap(other.s-car.s+line.length/2,line.length)-line.length/2;
    return Math.abs(gap)<65 || (other.qState==="timed" && gap<0 && gap>-Math.max(180,other.speed*1.1));
  });
  const approaching=nearby.find(other=>other.qState==="timed" && other.speed>car.speed+10);
  if(approaching && !committed){
    const behind=wrap(car.s-approaching.s,line.length);
    // Choose the free edge several seconds ahead of the pass, then commit.
    if(behind>Math.max(180,approaching.speed*1.1)){
      const catchTime=clamp(behind/Math.max(20,approaching.speed-car.speed),0,3);
      const fastLine=racingPoint(line,car.s+car.speed*catchTime).offset;
      if(Math.abs(fastLine)>8) car.ai.yieldSide=fastLine>=0 ? -1 : 1;
    }
  }
  const preparing=car.qState==="out" && pos>=line.finalCornerStart;
  const mergeBlocked=preparing && nearby.some(other=>{
    const gap=wrap(other.s-car.s+line.length/2,line.length)-line.length/2;
    return other.qState==="timed" && gap<65 && gap>-Math.max(110,other.speed*1.1) && Math.abs(other.offset-look.offset)<30;
  });
  return {offset:car.ai.yieldSide*(line.width/2-14),preparing:preparing&&!mergeBlocked,mergeBlocked};
}
export function brakingTarget(line,s,grip,braking,top,commitment=1){
  const horizon=clamp(top*top/(2*Math.max(braking,1))+110,220,Math.min(3000,line.length/2));
  let target=top;
  for(let d=0;d<=horizon;d+=30){
    const p=racingPoint(line,s+d);
    const corner=Math.min(top,Math.sqrt(225*Math.max(.001,grip)/Math.max(Math.abs(p.curvature),.0001))*commitment);
    target=Math.min(target,Math.sqrt(corner*corner+2*braking*Math.max(0,d-18)));
  }
  return Math.max(10,target);
}

// Wake benefit builds with distance/alignment. Only momentum (the higher
// speed ceiling) lingers on exit; drag reduction itself clears quickly.
export function updateSlipstream(c,traffic,dt,{width,layer,length}){
  const state=c.slipstream ||= {strength:0,carry:0,source:null};
  let best=0,source=null;
  if(!c.pit&&!c.garage&&!c.dnf&&!c.finished&&c.speed>140&&Math.abs(c.offset)<width/2){
    for(const other of traffic){
      if(other.id===c.id||other.pit||other.garage||other.finished||other.dnf||other.speed<140||Math.abs(other.offset)>width/2||layer(c.s)!==layer(other.s))continue;
      const gap=wrap(other.s-c.s,length);
      if(gap<34||gap>340)continue;
      const dx=other.x-c.x,dy=other.y-c.y,heading=c.motionAngle??c.angle;
      const ahead=dx*Math.cos(heading)+dy*Math.sin(heading),side=Math.abs(-dx*Math.sin(heading)+dy*Math.cos(heading));
      const cone=15+ahead*.045,alignment=Math.abs(angleDiff(other.angle,heading));
      if(ahead<30||ahead>340||side>cone||alignment>.24)continue;
      const strength=(1-ahead/380)**.65*(1-side/cone)**1.5*(1-alignment/.24)*clamp((Math.min(c.speed,other.speed)-140)/90,0,1);
      if(strength>best){best=strength;source=other.id;}
    }
  }
  if(c.pit||c.garage||c.dnf||c.finished||c.speed<100){state.strength=0;state.carry=0;state.source=null;return state;}
  state.strength+=(best-state.strength)*(1-Math.exp(-dt/(best>state.strength ? .45 : .12)));
  state.carry=Math.max(state.strength,state.carry*Math.exp(-dt/1.6));
  state.source=source;
  return state;
}
export function forecastWater(weather,seconds){
  let water=weather.wetness || 0;
  const drainage=.8+3*.07;
  for(let d=0;d<seconds;d+=5){const dt=Math.min(5,seconds-d),rain=rainAt(weather,weather.elapsed+d+dt/2);water=clamp(water+(rain*.012-(1-rain)*(rain>.01 ? .0013 : .0038)*drainage)*dt,0,1);}
  return clamp(water-(rainAt(weather,weather.elapsed+seconds)<.1 ? .06 : 0),0,1);
}
export function createStrategy(random){
  return {risk:random(),wearLimit:.65+random()*.2,reaction:1+random()*4,forecastHorizon:20+random()*50,
    forecastBias:(random()-.5)*.08,compoundBias:{S:random()*.035,M:random()*.035,H:random()*.035,I:random()*.015,W:random()*.015},
    nextReview:0,pitRequested:false,reason:null,choice:null,lastStop:-100,lastReview:0};
}
export function availableAISets(car,qualifying=false){
  // Unlimited replacements belong only to quick races, for player and AI alike.
  if(!car.tyreInventory)return car.tyrePhase ? [] : ['S','M','H','I','W'].map(compound=>({id:null,compound,wear:0}));
  return selectableSets(car.tyreInventory,car.tyrePhase || 'R',qualifying ? null : car.tyreSet?.id);
}
export function rankTyres(car,{tyres,remaining,water,futureWater,lapTime=35,pitLoss=18,qualifying=false,starting=false}){
  const strategy=car.ai.strategy;
  const estimate=clamp(water*.7+futureWater*.3+(Math.max(water,futureWater)>.02 ? strategy.forecastBias : 0),0,1);
  const needDry=!qualifying && !starting && !car.used.has('I')&&!car.used.has('W')&&['S','M','H'].filter(t=>car.used.has(t)).length<2;
  return availableAISets(car,qualifying || starting).map(set=>{
    const tyre=tyres[set.compound];
    const weatherGrip=tyreWeatherGrip(set.compound,estimate),g=tyre.grip*weatherGrip;
    const dryWear=['I','W'].includes(set.compound) ? 1+Math.max(0,(set.compound==='W' ? .55 : .28)-estimate)*5 : 1;
    const usable=tyre.life*Math.max(.03,strategy.wearLimit-set.wear)/(dryWear*(1-(car.upgrades?.tyres || 0)*.07));
    const laps=Math.max(.25,remaining),stint=Math.min(laps,usable);
    const extraStops=qualifying ? 0 : Math.max(0,Math.ceil(laps/Math.max(.5,usable))-1);
    const ruleCost=needDry && car.used.has(set.compound) && !['I','W'].includes(set.compound) ? pitLoss/laps : 0;
    const conditionLoss=set.wear*.1+Math.max(0,stint/(2*tyre.life))*.025;
    // A Q3-only set will be returned afterwards, so spending it carries no
    // opportunity cost for the race. Keep ordinary fresh Softs where possible.
    const q3Set=qualifying && set.reserved && car.tyrePhase==='Q3';
    const freshCost=qualifying && car.tyreSet && !set.used && set.compound==='S' && !q3Set ? .7+.5*car.driverStyle.tyreCare : 0;
    const score=freshCost-(q3Set ? .35 : 0)+lapTime*(Math.pow(1/Math.max(.08,g),.32)+conditionLoss+(strategy.compoundBias[set.compound]||0))+extraStops*pitLoss/laps+ruleCost;
    return {set,score,usable,grip:g};
  }).sort((a,b)=>a.score-b.score || a.set.wear-b.set.wear || String(a.set.id).localeCompare(String(b.set.id)));
}
