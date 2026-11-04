// Sample connected tyre trails, extending the live segment every physics step.
// Keep the original 12 Hz storage budget without leaving gaps between stamps.
export function recordSkid(car,marks,time,active){
 const previous=car.skidTrail;
 if(!active){car.skidTrail=null;return;}
 const pose={x:car.x,y:car.y,a:car.angle};
 const continuous=previous && time>previous.time && time-previous.time<.1 &&
  Math.hypot(pose.x-previous.pose.x,pose.y-previous.pose.y)<Math.abs(car.speed)*(time-previous.time)*2+10;
 if(!continuous){car.skidTrail={pose,time,segment:null};return;}
 let segment=previous.segment;
 if(!segment || time-segment.started>=1/12){
  // Discard the oldest trail when busy, never interrupt a current slide.
  if(marks.length>=1400)marks.shift();
  segment={from:previous.pose,...pose,t:time,started:previous.time};
  marks.push(segment);
 }else Object.assign(segment,pose,{t:time});
 car.skidTrail={pose,time,segment};
}
export function drawSkids(ctx,marks,time){
 ctx.save();
 ctx.strokeStyle="#12191d";ctx.lineWidth=3;ctx.lineCap="round";
 for(const mark of marks){
  ctx.globalAlpha=Math.max(0,.35*(1-(time-mark.t)/16));
  ctx.beginPath();
  for(const offset of [-8.5,8.5]){
   ctx.moveTo(mark.from.x-Math.sin(mark.from.a)*offset,mark.from.y+Math.cos(mark.from.a)*offset);
   ctx.lineTo(mark.x-Math.sin(mark.a)*offset,mark.y+Math.cos(mark.a)*offset);
  }
  ctx.stroke();
 }
 ctx.restore();
}
