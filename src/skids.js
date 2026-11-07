// Sample connected tyre trails, extending the live segment every physics step.
// Keep the original 12 Hz storage budget without leaving gaps between stamps.
export function recordSkid(car,marks,time,active){
 const previous=car.skidTrail;
 if(!active){car.skidTrail=null;return;}
 const pose={x:car.x,y:car.y,a:car.angle};
 const continuous=previous && time>previous.time && time-previous.time<.1 &&
  Math.hypot(pose.x-previous.pose.x,pose.y-previous.pose.y)<Math.abs(car.speed)*(time-previous.time)*2+10;
 if(!continuous){car.skidTrail={pose,time,trail:{},segment:null};return;}
 let segment=previous.segment;
 if(!segment || time-segment.started>=1/12){
  // Discard the oldest trail when busy, never interrupt a current slide.
  if(marks.length>=1400)marks.shift();
  segment={trail:previous.trail,from:previous.pose,...pose,t:time,started:previous.time};
  marks.push(segment);
 }else Object.assign(segment,pose,{t:time});
 car.skidTrail={pose,time,trail:previous.trail,segment};
}
export function drawSkids(ctx,marks,time){
 // Cars record into a shared time-ordered buffer. Stroke each wheel's
 // connected path once so adjacent translucent caps never darken the joins.
 const groups=new Map();
 for(const mark of marks){
  let segments=groups.get(mark.trail);
  if(!segments){segments=[];groups.set(mark.trail,segments);}
  segments.push(mark);
 }
 ctx.save();
 ctx.strokeStyle="#12191d";ctx.lineWidth=3;ctx.lineCap="butt";ctx.lineJoin="round";
 for(const segments of groups.values()){
  for(let start=0;start<segments.length;){
   const age=Math.max(0,Math.floor(time-segments[start].t));
   let end=start+1;
   while(end<segments.length && Math.max(0,Math.floor(time-segments[end].t))===age)end++;
   ctx.globalAlpha=.35*Math.max(0,1-age/16);
   ctx.beginPath();
   for(const offset of [-8.5,8.5]){
    const first=segments[start].from;
    ctx.moveTo(first.x-Math.sin(first.a)*offset,first.y+Math.cos(first.a)*offset);
    for(let i=start;i<end;i++){
     const p=segments[i];
     ctx.lineTo(p.x-Math.sin(p.a)*offset,p.y+Math.cos(p.a)*offset);
    }
   }
   ctx.stroke();start=end;
  }
 }
 ctx.restore();
}
