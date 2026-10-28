// Time gaps are measured when cars reach the same distance around the lap.
// World-space separation and the follower's current speed never enter the sum.
const SPACING=20;
export function recordTiming(car,time,progress,lapLength){
 let trace=car.timing;
 if(!trace){car.timing={time,progress,points:[{s:progress,t:time}],frontier:{s:progress,t:time},next:(Math.floor(progress/SPACING)+1)*SPACING};return;}
 const from=trace.progress,at=trace.time,delta=progress-from;
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
 if(ahead.finished&&car.finished)return Math.max(0,car.trackFinishTime-ahead.trackFinishTime);
 const passed=passageTime(ahead,progress);
 return passed===null || !car.timing ? null : Math.max(0,car.timing.time-passed);
}
