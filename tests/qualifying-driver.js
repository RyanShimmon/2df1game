import {TRACK, sample, clamp, angleDiff, targetSpeed, samplePit, wrap} from '../src/core.js';
export function driveQualifyingOuting(q, seconds=60+TRACK.length*3/130, {pace=.8}={}) {
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
      const toEntry=wrap(TRACK.pitEntry-p.s,TRACK.length);
      const approaching=q.pitRequested && toEntry<400;
      const goal=approaching && toEntry<130 ? samplePit(90) : sample(p.s+clamp(p.speed*.55,35,100));
      const desired=Math.atan2(goal.y-p.y,goal.x-p.x), target=approaching ? 75 : targetSpeed(p)*pace;
      input={steer:clamp(angleDiff(desired,p.angle)*3.5,-1,1),throttle:p.speed<target,brake:p.speed>target+3};
    }
    q.step(1/60,input);
  }
  return q;
}
