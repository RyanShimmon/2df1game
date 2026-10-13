import {TRACK, sample, clamp, angleDiff, targetSpeed} from '../src/core.js';
export function driveQualifyingOuting(q, seconds=180) {
  q.autoPitLimiter=false; // This helper exercises manual outings and garage release.
  const starting=q.player.stops;
  for(let i=0;i<60*seconds && !q.done && q.player.stops===starting;i++) {
    const p=q.player;
    q.pitLimiter=!!p.pit;
    let input;
    if(p.garage) input={throttle:true};
    else if(p.pit) {
      const remaining=p.pit.boxDistance-p.pit.distance;
      input=!p.pit.serviced && remaining<p.speed*p.speed/480+15 ? {brake:true} : {throttle:true};
    } else {
      const goal=sample(p.s+clamp(p.speed*.55,35,100));
      const approaching=q.pitRequested && p.s%TRACK.length>TRACK.pitEntry-400;
      if(approaching) {
        const offset=104*clamp((p.s%TRACK.length-TRACK.pitEntry+400)/240,0,1);
        goal.x-=Math.sin(goal.angle)*offset;goal.y+=Math.cos(goal.angle)*offset;
      }
      const desired=Math.atan2(goal.y-p.y,goal.x-p.x), target=approaching ? 75 : targetSpeed(p)*.8;
      input={steer:clamp(angleDiff(desired,p.angle)*3.5,-1,1),throttle:p.speed<target,brake:p.speed>target+3};
    }
    q.step(1/60,input);
  }
  return q;
}
