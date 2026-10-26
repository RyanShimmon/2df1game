import {planRaceStrategy} from "./strategy.js";
import {cornerAccelerationLimit} from "./performance.js";
import {optimizeRacingLine} from "./racing-line.js";
import {tyreWeatherGrip, projectWeather, trackWater} from './weather.js';
import {selectableSets} from './tyre-stock.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=(v,n)=>((v%n)+n)%n;
const angleDiff=(a,b)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function seededRandom(seed){
  let state=seed>>>0;
  return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
}
export function driverSeed(seed,id){return (Math.imul((seed>>>0)^0x9e3779b9,(id+1)*2+1)^0x85ebca6b)>>>0;}

// Cache immutable geometry; repeated races on a circuit need no new optimization.
const racingLines=new Map();
export function buildRacingLine(track,sample,apexes){
  const key=JSON.stringify([track.id,track.width,track.layoutScale,track.anchors ?? track.pts?.map(p=>[p.x,p.y]) ?? track.length]);
  if(racingLines.has(key))return racingLines.get(key);
  const optimized=optimizeRacingLine(track,sample);
  const {points,step}=optimized,count=points.length;
  for(let i=0;i<count;i++){
    const a=points[wrap(i-1,count)],b=points[i],c=points[(i+1)%count];
    b.angle=Math.atan2(c.y-a.y,c.x-a.x);
    const ab=Math.hypot(b.x-a.x,b.y-a.y),bc=Math.hypot(c.x-b.x,c.y-b.y),ac=Math.hypot(c.x-a.x,c.y-a.y);
    b.curvature=2*((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))/Math.max(1,ab*bc*ac);
    b.distanceScale=(ab+bc)/(2*step);
    b.slope=(c.offset-a.offset)/(2*step);
  }
  const finalApex=apexes.at(-1)?.s ?? track.length*.94;
  // Prefer the road edge least used by the racing line; hold it through linked
  // corners instead of repeatedly sweeping from one edge to the other.
  const edge=track.width/2-14;
  const conflict=side=>points.filter(p=>Math.abs(p.offset-side*edge)<30).length;
  const line={...optimized,centers:track.pts,length:track.length,width:track.width,
    yieldSide:conflict(-1)<=conflict(1) ? -1 : 1,
    finalCornerStart:Math.max(track.length*.5,finalApex-180)};
  racingLines.set(key,line);return line;
}
export function racingPoint(line,s){
  const f=wrap(s,line.length)/line.step,i=Math.floor(f),t=f-i,a=line.points[i],b=line.points[(i+1)%line.points.length];
  if(!line.centers)return {slope:(a.slope || 0)+((b.slope || 0)-(a.slope || 0))*t,offset:a.offset+(b.offset-a.offset)*t,angle:a.angle+angleDiff(b.angle,a.angle)*t,curvature:a.curvature+(b.curvature-a.curvature)*t,distanceScale:a.distanceScale+(b.distanceScale-a.distanceScale)*t};
  // Interpolate the actual world-space racing arc. Interpolating lateral
  // offsets alone introduces steering reversals as the centreline bends below
  // a nearly straight racing line (especially at corner exits).
  const before=line.points[wrap(i-1,line.points.length)],after=line.points[(i+2)%line.points.length];
  const component=key=>{
    const m0=(b[key]-before[key])/2,m1=(after[key]-a[key])/2;
    return {p:(2*t**3-3*t*t+1)*a[key]+(t**3-2*t*t+t)*m0+(-2*t**3+3*t*t)*b[key]+(t**3-t*t)*m1,
      d:(6*t*t-6*t)*a[key]+(3*t*t-4*t+1)*m0+(-6*t*t+6*t)*b[key]+(3*t*t-2*t)*m1,
      dd:(12*t-6)*a[key]+(6*t-4)*m0+(-12*t+6)*b[key]+(6*t-2)*m1};
  };
  const x=component('x'),y=component('y'),speed=Math.hypot(x.d,y.d);
  const pos=wrap(s,line.length),centers=line.centers;let lo=0,hi=centers.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(centers[mid].s<=pos)lo=mid;else hi=mid;}
  const c=centers[lo],d=centers[hi],u=(pos-c.s)/(d.s-c.s),angle=c.angle+angleDiff(d.angle,c.angle)*u;
  const cx=c.x+(d.x-c.x)*u,cy=c.y+(d.y-c.y)*u,nx=-Math.sin(angle),ny=Math.cos(angle);
  const centerTurn=angleDiff(d.angle,c.angle)/(d.s-c.s);
  const offset=(x.p-cx)*nx+(y.p-cy)*ny;
  const slope=(x.d/line.step-(d.x-c.x)/(d.s-c.s))*nx+(y.d/line.step-(d.y-c.y)/(d.s-c.s))*ny-
    centerTurn*((x.p-cx)*Math.cos(angle)+(y.p-cy)*Math.sin(angle));
  return {x:x.p,y:y.p,offset,slope,angle:Math.atan2(y.d,x.d),curvature:(x.d*y.dd-y.d*x.dd)/Math.max(1,speed**3),distanceScale:speed/line.step};
}
// Out/in laps yield away from the fast line. A side is held while a timed
// car approaches, avoiding a last-second sweep across its path. Out laps may
// merge for the final corner only when the adjacent fast line is clear.
export function qualifyingLane(car,line,traffic){
  if(!["out","in"].includes(car.qState)) {car.ai.yieldSide=null;car.ai.yieldFor=null;return null;}
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
  const yieldingTo=traffic.find(other=>other.id===car.ai.yieldFor);
  if(!yieldingTo || yieldingTo.pit || yieldingTo.garage || wrap(yieldingTo.s-car.s+line.length/2,line.length)-line.length/2>130)car.ai.yieldFor=null;
  if(approaching && !committed && car.ai.yieldFor!==approaching.id){
    const behind=wrap(car.s-approaching.s,line.length);
    // Choose the free edge several seconds ahead of the pass, then commit.
    if(behind>Math.max(180,approaching.speed*1.1)){
      const catchTime=clamp(behind/Math.max(20,approaching.speed-car.speed),0,3);
      const fastLine=racingPoint(line,car.s+car.speed*catchTime).offset;
      if(Math.abs(fastLine)>8) car.ai.yieldSide=fastLine>=0 ? -1 : 1;
      car.ai.yieldFor=approaching.id;
    }
  }
  // With a clear road, anticipate the next section's racing line. Cross only
  // while no car is near; once a timed car approaches, hold the chosen edge.
  // A fixed edge for the entire lap blocks the fast line through half the bends.
  if(!nearby.length && Math.abs(look.offset)>16 && !car.ai.yieldFor &&
    Math.abs(car.offset-car.ai.yieldSide*(line.width/2-14))<12){
    car.ai.yieldSide=look.offset>0 ? -1 : 1;
  }
  const preparing=car.qState==="out" && pos>=line.finalCornerStart;
  const mergeBlocked=preparing && nearby.some(other=>{
    const gap=wrap(other.s-car.s+line.length/2,line.length)-line.length/2;
    return other.qState==="timed" && gap<65 && gap>-Math.max(110,other.speed*1.1) && Math.abs(other.offset-look.offset)<30;
  });
  return {offset:car.ai.yieldSide*(line.width/2-14),preparing:preparing&&!mergeBlocked,mergeBlocked};
}
// Pick one car and one side for a pass. A timer can abandon a stalled move,
// but never chooses a new side while the cars are still alongside each other.
export function planRacingLane(car,line,traffic,{time=0,allowPass=true,yieldOffset=null,baseOffset=null,paceAdvantage=null}={}){
 const state=car.ai.lane ||= {phase:"line",targetId:null,side:0,startedAt:0,minUntil:0,cooldownUntil:0,nextDecision:0};
 const edge=line.width/2-18,base=yieldOffset ?? baseOffset ?? racingPoint(line,car.s).offset+(car.driverStyle?.line || 0)*.12;
 const aggression=car.driverStyle?.aggression ?? .5;
 const gapTo=other=>wrap(other.s-car.s+line.length/2,line.length)-line.length/2;
 const nearby=traffic.filter(other=>other.id!==car.id&&!other.pit&&!other.garage&&!other.dnf&&!other.finished&&Math.abs(other.offset)<line.width/2+10 && Math.abs(gapTo(other))<360)
  .map(other=>{
   const gap=gapTo(other);
   // Circuit progress measures the centreline. On a tight inside arc, a gap
   // of 50 along that line may leave less than one car length on the road.
   // Use physical longitudinal separation for clearance and following speed.
   const heading=car.angle+angleDiff(other.angle,car.angle)/2;
   const measured=(other.x-car.x)*Math.cos(heading)+(other.y-car.y)*Math.sin(heading);
   const spaceGap=Number.isFinite(measured) && Math.sign(measured)===Math.sign(gap) ? measured : gap;
   return {car:other,gap,spaceGap};
  }).filter(other=>Math.abs(other.gap)<360).sort((a,b)=>a.gap-b.gap||a.car.id-b.car.id);
 const ahead=nearby.filter(other=>other.gap>0),leader=ahead.find(other=>Math.abs(other.car.offset-car.offset)<38&&Math.abs(other.car.offset-base)<38);
 const candidate=shift=>clamp(base+shift,-edge,edge);
 const laneClear=(shift,target)=>{
  const offset=candidate(shift),look=Math.min(150,car.speed*.6);
  const future=clamp(racingPoint(line,car.s+look).offset+(car.driverStyle?.line || 0)*.12+shift,-edge,edge);
  if(state.phase!=="passing" && (Math.abs(offset-target.car.offset)<30 || Math.abs(future-racingPoint(line,car.s+look).offset)<27))return false;
  return !nearby.some(other=>{
   if(other.car.id===target.car.id)return false;
   const rear=-70-Math.max(0,other.car.speed-car.speed)*1.5;
   const occupied=other.gap>rear&&other.gap<target.gap+70&&(Math.abs(other.car.offset-offset)<31||Math.abs(other.car.offset-future)<31);
   const crossing=Math.abs(other.spaceGap)<50&&other.car.offset>Math.min(car.offset,offset)-27&&other.car.offset<Math.max(car.offset,offset)+27;
   return occupied||crossing;
  });
 };
 const endPass=()=>{state.aborting=false;state.phase="return";state.targetId=null;state.side=0;state.cooldownUntil=time+2.5;};
 if(yieldOffset!==null){state.phase="line";state.targetId=null;state.side=0;state.cooldownUntil=time+1;}
 if(state.phase==="passing"){
  let target=nearby.find(other=>other.car.id===state.targetId);
  // Clearing one car does not end a battle with another car still alongside.
  // Keep the existing lane and attack until the whole overlap is resolved.
  if(target?.gap < -55 && !state.aborting && allowPass){
   const next=nearby.find(other=>other.car.id!==target.car.id && Math.abs(other.spaceGap)<55 &&
    Math.abs(other.car.offset-car.offset)>=27 && (paceAdvantage ? paceAdvantage(other.car)>.5 : car.speed>other.car.speed+2));
   if(next){target=next;state.targetId=next.car.id;state.bestGap=next.gap;state.progressAt=time;state.startedAt=time;state.minUntil=time+1.5;}
  }
  const alongside=target&&Math.abs(target.spaceGap)<55;
  if(target && target.gap<(state.bestGap ?? Infinity)-5){state.bestGap=target.gap;state.progressAt=time;}
  // If an outside attempt stops making progress, keep its lane while dropping
  // behind. Only then merge and prepare a different exit or braking move.
  if(alongside && time-(state.progressAt ?? state.startedAt)>6+aggression*4)state.aborting=true;
  if(state.aborting && target?.gap>65)endPass();
  else if(!target || target.gap < -55 || (!alongside&&time>state.minUntil&&
    (target.gap>220 || time-(state.progressAt ?? state.startedAt)>8+aggression*4 || target.gap>95&&target.car.speed>car.speed+8 || !laneClear(state.shift ?? state.side*34,target))))endPass();
 }
 if(state.phase==="return" && Math.abs(car.offset-base)<3 && Math.abs(car.ai.lineVelocity || 0)<12)state.phase="line";
 if(state.phase==="line"&&yieldOffset===null&&allowPass&&time>=state.cooldownUntil&&time>=state.nextDecision){
  state.nextDecision=time+.4;
  const bend=Math.max(Math.abs(racingPoint(line,car.s).curvature),Math.abs(racingPoint(line,car.s+100).curvature));
  // Matching a slower car while following must not erase an overtaking
  // opportunity. Compare available pace through the upcoming section too.
  const advantage=leader&&paceAdvantage ? paceAdvantage(leader.car) : 0;
  if(leader&&leader.gap>38&&leader.gap<140+45*aggression&&car.speed>90&&
    (car.speed>leader.car.speed+2 || advantage>.8)&&bend<.0032){
   // Look for real corridors across the road, including the far side of a
   // two-car battle. Two fixed offsets miss open space outside that pair.
   const offsets=[candidate(-34),candidate(34),-edge,edge,car.offset,
    leader.car.offset-34,leader.car.offset+34];
   const ordered=ahead.filter(o=>o.gap<leader.gap+70).map(o=>o.car.offset).sort((a,b)=>a-b);
   for(let i=1;i<ordered.length;i++)if(ordered[i]-ordered[i-1]>=64)offsets.push((ordered[i]+ordered[i-1])/2);
   const shifts=[...new Set([-34,34,...offsets.map(offset=>clamp(offset,-edge,edge)-base)])];
   const passCost=shift=>{
    let cost=Math.abs(candidate(shift)-car.offset)*.15;
    for(let d=0;d<=600;d+=60){const p=racingPoint(line,car.s+d);cost-=p.curvature*(clamp(p.offset+shift,-edge,edge)-p.offset)*60;}
    return cost;
   };
   const evaluate=values=>values.filter(shift=>laneClear(shift,leader)).map(shift=>({shift,
    gain:paceAdvantage ? paceAdvantage(leader.car,shift) : 0,cost:passCost(shift)}))
    .filter(choice=>!paceAdvantage || choice.gain>.5 || car.speed-leader.car.speed>Math.max(2,choice.cost*car.speed/600));
   // Prefer the usual passing lines when viable; only search wider when
   // traffic blocks them. Avoid unnecessary lane movement and extra projections.
   const standard=evaluate([-34,34].filter(shift=>Math.abs(candidate(shift)-base)>=30));
   const choices=(standard.length ? standard : evaluate(shifts)).sort((a,b)=>(paceAdvantage ? b.gain-a.gain : a.cost-b.cost) || a.cost-b.cost || a.shift-b.shift);
   if(choices.length){state.phase="passing";state.targetId=leader.car.id;state.shift=choices[0].shift;state.aborting=false;
    state.side=Math.sign(candidate(state.shift)-leader.car.offset);state.startedAt=time;state.progressAt=time;state.bestGap=leader.gap;state.minUntil=time+1.2+aggression*.7;}
  }
 }
 let desired=state.phase==="passing" ? candidate(state.shift ?? state.side*34) : base,min=-edge,max=edge;
 // Preserve lateral order beside another car. Combine constraints once instead
 // of repeatedly pushing left/right according to the iteration order of traffic.
 for(const other of nearby)if(Math.abs(other.spaceGap)<(
  state.phase==="passing"&&state.targetId===other.car.id || other.car.passingTarget===car.id ? 85 : 50
 )&&Math.abs(other.car.offset-car.offset)>6){
  if(other.car.offset>car.offset)max=Math.min(max,other.car.offset-34);
  else min=Math.max(min,other.car.offset+34);
 }
 if(yieldOffset!==null){min=Math.min(min,yieldOffset);max=Math.max(max,yieldOffset);}
 desired=min<=max ? clamp(desired,min,max) : clamp(car.offset,-edge,edge);
 let followingSpeed=Infinity;
 if(state.phase==="passing" && state.aborting){
  const target=nearby.find(o=>o.car.id===state.targetId);
  // Two abandoned passes must not make both cars brake for each other until
  // stationary. The trailing car drops back; the leading car holds its lane
  // and continues. IDs break a genuinely side-by-side tie deterministically.
  if(target && (target.gap>1 || Math.abs(target.gap)<=1 && car.id>target.car.id))
   followingSpeed=Math.max(0,target.car.speed-12);
 }
 for(const other of ahead)if(other.gap<180&&Math.abs(car.offset-other.car.offset)<27&&
  (Math.abs(desired-other.car.offset)<30||other.spaceGap<38+car.speed*.055)){
  followingSpeed=Math.min(followingSpeed,Math.max(0,other.car.speed+(other.spaceGap-38-car.speed*.055)*.7));
 }
 return {offset:desired,min,max,followingSpeed,phase:state.phase,targetId:state.targetId,side:state.side};
}
// Compare both cars over the same upcoming road, starting at the same speed.
// These profiles come from the actual grip/power model, not a compound ranking.
// A worn Soft or a fuel-saving car can therefore be slower than a fresh Medium.
export function laneGeometry(line,s,shift=0){
 const p=racingPoint(line,s),edge=line.width/2-18;
 const delta=shift ? clamp(p.offset+shift,-edge,edge)-p.offset : 0;
 const scale=clamp(1-p.curvature*delta,.65,1.4);
 return {...p,curvature:p.curvature/scale,distanceScale:(p.distanceScale || 1)*scale};
}
// Future pace projections need curvature and distance, not a full steering
// pose. Cache the spline coefficients and evaluate its exact derivatives;
// sampled curvature would smooth over the joins and alter braking targets.
const paceRoads=new WeakMap();
function paceRoad(line){
 let road=paceRoads.get(line);if(road)return road;
 const points=line.points,n=points.length;
 road=points.map((a,i)=>{
  const before=points[(i+n-1)%n],b=points[(i+1)%n],after=points[(i+2)%n];
  const polynomial=key=>{
   const m0=(b[key]-before[key])/2,m1=(after[key]-a[key])/2;
   return [a[key],m0,-3*a[key]-2*m0+3*b[key]-m1,2*a[key]+m0-2*b[key]+m1];
  };
  return {x:polynomial('x'),y:polynomial('y')};
 });
 paceRoads.set(line,road);return road;
}
export function paceGeometry(line,s,shift=0){
 if(!line.centers)return laneGeometry(line,s,shift);
 const pos=wrap(s,line.length),f=pos/line.step,i=Math.floor(f),t=f-i,{x,y}=paceRoad(line)[i];
 const dx=x[1]+t*(2*x[2]+3*t*x[3]),dy=y[1]+t*(2*y[2]+3*t*y[3]);
 const ddx=2*x[2]+6*t*x[3],ddy=2*y[2]+6*t*y[3],speed=Math.hypot(dx,dy);
 const k=(dx*ddy-dy*ddx)/Math.max(1,speed**3);
 let delta=0;
 if(shift){
  const centers=line.centers;let lo=0,hi=centers.length-1;
  while(lo+1<hi){const mid=(lo+hi)>>1;if(centers[mid].s<=pos)lo=mid;else hi=mid;}
  const c=centers[lo],d=centers[hi],u=(pos-c.s)/(d.s-c.s),angle=c.angle+angleDiff(d.angle,c.angle)*u;
  const px=x[0]+t*(x[1]+t*(x[2]+t*x[3])),py=y[0]+t*(y[1]+t*(y[2]+t*y[3]));
  const offset=(px-c.x-(d.x-c.x)*u)*-Math.sin(angle)+(py-c.y-(d.y-c.y)*u)*Math.cos(angle),edge=line.width/2-18;
  delta=clamp(offset+shift,-edge,edge)-offset;
 }
 const scale=clamp(1-k*delta,.65,1.4);
 return {curvature:k/scale,distanceScale:speed/line.step*scale};
}
export function projectedPaceAdvantage(line,s,speed,own,other,{ownShift=0,otherShift=0}={}){
 if(!own || !other)return 0;
 const distance=clamp(speed*3,600,1000),step=50,count=Math.ceil(distance/step);
 const pace=(profile,shift)=>{
  const road=Array.from({length:count+1},(_,i)=>paceGeometry(line,s+i*step,shift));
  const limits=road.map(p=>Math.min(profile.top,Math.sqrt(225*Math.max(.001,profile.grip)/Math.max(.0001,Math.abs(p.curvature)))*profile.commitment));
  for(let i=count-1;i>=0;i--)limits[i]=Math.min(limits[i],Math.sqrt(limits[i+1]**2+2*profile.braking*step*road[i].distanceScale));
  let v=Math.min(speed,limits[0]),time=0;
  for(let i=1;i<=count;i++){
   const ds=step*road[i].distanceScale,accel=Math.min(profile.acceleration,cornerAccelerationLimit(v,road[i].curvature,profile.rearGrip ?? profile.grip));
   const next=Math.min(limits[i],Math.sqrt(v*v+2*Math.max(0,accel)*ds));
   time+=2*ds/Math.max(20,v+next);v=next;
  }
  return count*step/time;
 };
 return pace(own,ownShift)-pace(other,otherShift);
}
export function brakingTarget(line,s,grip,braking,top,commitment=1,laneShift=0,ceiling=top){
  const horizon=clamp(top*top/(2*Math.max(braking,1))+110,220,Math.min(3000,line.length/2));
  let target=Math.min(top,ceiling),distance=0;
  for(let d=0;d<=horizon;d+=30){
    const p=paceGeometry(line,s+d,laneShift);
    if(d)distance+=30*p.distanceScale;
    const stopping=2*braking*Math.max(0,distance-18);
    // Beyond this point even a zero-speed corner could be reached safely
    // from our current target. Later positive distances cannot lower it.
    if(stopping>=target*target)break;
    const corner=Math.min(top,Math.sqrt(225*Math.max(.001,grip)/Math.max(Math.abs(p.curvature),.0001))*commitment);
    target=Math.min(target,Math.sqrt(corner*corner+stopping));
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
  const projected=projectWeather(weather,seconds);
  return projected.sectors.reduce((total,_,i)=>total+trackWater(projected,i,32,0),0)/32;
}
export function createStrategy(random){
  return {risk:random(),wearLimit:.80+random()*.10,reaction:1+random()*4,forecastHorizon:20+random()*50,
    forecastBias:(random()-.5)*.08,compoundBias:{S:random()*.003,M:random()*.003,H:random()*.003,I:random()*.002,W:random()*.002},
    nextReview:0,pitRequested:false,reason:null,choice:null,lastStop:-100,lastReview:0};
}
export function availableAISets(car,qualifying=false){
  // Unlimited replacements belong only to quick races, for player and AI alike.
  if(!car.tyreInventory)return car.tyrePhase ? [] : ['S','M','H','I','W'].map(compound=>({id:null,compound,wear:0}));
  return selectableSets(car.tyreInventory,car.tyrePhase || 'R',qualifying ? null : car.tyreSet?.id);
}
export function rankTyres(car,{tyres,remaining,water,futureWater,lapTime=35,pitLoss=18,qualifying=false,starting=false}){
  if(!qualifying && remaining<=60){
    const plans=planRaceStrategy(car,{tyres,sets:availableAISets(car,starting),remaining,water,futureWater,lapTime,pitLoss,starting});
    if(plans.length)return plans;
  }
  const strategy=car.ai.strategy;
  const estimate=clamp(water*.7+futureWater*.3+(Math.max(water,futureWater)>.02 ? strategy.forecastBias : 0),0,1);
  const needDry=car.raceFormat!=="sprint" && !qualifying && !starting && !car.used.has('I')&&!car.used.has('W')&&['S','M','H'].filter(t=>car.used.has(t)).length<2;
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
