// Passage traces remain available for measured splits. Live gaps use one
// shared circuit clock: progress through each road section converted to racing
// seconds. It stays continuous when a car stops in the pit or passes a flyover.
export function createTimingReference(length,sample){
 const count=Math.ceil(length/80),step=length/count;
 const rates=Array.from({length:count},(_,i)=>{
  const p=sample((i+.5)*step);return Math.max(.4,p.distanceScale || 1)/Math.max(30,p.speed);
 });
 return {length,step,rates,baseline:[...rates],revision:0,cachedRevision:-1,prefix:[]};
}
export function circuitTime(reference,progress){
 if(reference.cachedRevision!==reference.revision){
  const prefix=[0];for(const rate of reference.rates)prefix.push(prefix.at(-1)+reference.step*rate);
  reference.prefix=prefix;reference.cachedRevision=reference.revision;
 }
 const lap=Math.floor(progress/reference.length),s=progress-lap*reference.length;
 const index=Math.min(reference.rates.length-1,Math.floor(s/reference.step));
 return lap*reference.prefix.at(-1)+reference.prefix[index]+(s-index*reference.step)*reference.rates[index];
}
export const outstandingPenalty=car=>(car.penalty || 0)+(car.pit?.penaltyRemaining || 0);
export function timingCoordinate(car,progress,now=car.timing?.time || 0){
 const reference=car.timing?.reference;
 if(!reference)return null;
 const finish=car.finished ? Math.max(0,now-(car.trackFinishTime ?? now)) : 0;
 const penalty=car.finished && Number.isFinite(car.finishTime) && Number.isFinite(car.trackFinishTime) ? car.finishTime-car.trackFinishTime : outstandingPenalty(car);
 return circuitTime(reference,progress)+finish-penalty;
}
function learnRacingPace(reference,car,from,to,dt){
 // Pit speed, standing starts, spins and shortcuts must not redefine racing
 // pace. Genuine slower racing in rain does update the local clock gradually.
 if(!reference || car.pit || car.garage || car.finished || car.speed<70 || car.sliding>.5 || from<0 || to<=from || to-from>Math.max(40,car.speed*dt*2))return;
 const rate=dt/(to-from),s=((from+to)/2%reference.length+reference.length)%reference.length;
 const index=Math.min(reference.rates.length-1,Math.floor(s/reference.step));
 const target=Math.max(reference.baseline[index]*.5,Math.min(reference.baseline[index]*4,rate));
 reference.rates[index]+=(target-reference.rates[index])*(1-Math.exp(-dt/4));reference.revision++;
}
const SPACING=20;
export function recordTiming(car,time,progress,lapLength,reference=null){
 let trace=car.timing;
 if(!trace){car.timing={reference,time,progress,points:[{s:progress,t:time}],frontier:{s:progress,t:time},next:(Math.floor(progress/SPACING)+1)*SPACING};return;}
 if(reference)trace.reference=reference;
 const from=trace.progress,at=trace.time,delta=progress-from;
 if(time>at)learnRacingPace(trace.reference,car,from,progress,time-at);
 if(delta>0 && time>at){
  // Ignore coordinate resets/recovery jumps instead of fabricating split times.
  if(delta<=Math.max(40,Math.abs(car.speed || 0)*(time-at)*3)){
   while(trace.next<=progress){
    if(trace.next>=from)trace.points.push({s:trace.next,t:at+(time-at)*(trace.next-from)/delta});
    trace.next+=SPACING;
   }
  }else {
   if(progress>trace.frontier.s)trace.points.push({s:progress,t:time,discontinuous:true});
   trace.next=Math.max(trace.next,(Math.floor(progress/SPACING)+1)*SPACING);
  }
  if(progress>trace.frontier.s)trace.frontier={s:progress,t:time};
 }
 trace.time=time;trace.progress=progress;
 // Two laps cover every interval shown in seconds; larger gaps use lap counts.
 const cutoff=progress-lapLength*2;
 if(trace.points.length>1500 || trace.points[0]?.s<cutoff){
  const index=trace.points.findIndex(p=>p.s>=cutoff);if(index>1)trace.points.splice(0,index-1);
 }
}
export function passageTime(car,progress){
 const trace=car.timing,points=trace?.points;
 if(!points?.length || progress<points[0].s)return null;
 let lo=0,hi=points.length;
 while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].s<=progress)lo=mid;else hi=mid;}
 const a=points[lo],b=points[lo+1] || (trace.frontier.s>a.s ? trace.frontier : a);
 if(progress>b.s || b.discontinuous && progress>a.s && progress<b.s)return null;
 return b.s===a.s ? a.t : a.t+(b.t-a.t)*(progress-a.s)/(b.s-a.s);
}
export function intervalSeconds(ahead,car,progress){
 if(ahead===car)return 0;
 if(ahead.finished&&car.finished)return (car.finishTime ?? car.trackFinishTime+outstandingPenalty(car))-(ahead.finishTime ?? ahead.trackFinishTime+outstandingPenalty(ahead));
 if(ahead.timing?.reference && ahead.timing.reference===car.timing?.reference){
  const now=Math.max(ahead.timing.time,car.timing.time);
  return timingCoordinate(ahead,ahead.timing.progress,now)-timingCoordinate(car,progress,now);
 }
 const passed=passageTime(ahead,progress);
 return passed===null || !car.timing ? null : car.timing.time-passed+outstandingPenalty(car)-outstandingPenalty(ahead);
}
