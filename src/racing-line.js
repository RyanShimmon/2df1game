import {engineAcceleration,cornerAccelerationLimit} from "./performance.js";
// Periodic cubic B-spline: position, tangent AND curvature remain continuous
// between control points. Planning and driving must evaluate this same curve.
export function racingSplineCoefficients(before,a,b,after){
 return [(before+4*a+b)/6,(b-before)/2,(before-2*a+b)/2,(-before+3*a-3*b+after)/6];
}
// Optimize the complete closed lap, including acceleration between linked bends.
// Smooth, overlapping lateral moves minimize an estimated lap time while staying
// inside the road. No separate apex targets force unnecessary changes of side.
// The forward/backward speed envelope penalizes a line that spoils the next exit.
export function optimizeRacingLine(track,sample){
 const n=Math.ceil(track.length/24),step=track.length/n,margin=track.width/2-22;
 const center=Array.from({length:n},(_,i)=>sample(i*step));
 const normals=center.map(p=>[-Math.sin(p.angle),Math.cos(p.angle)]);
 const offsets=new Float64Array(n),x=new Float64Array(n),y=new Float64Array(n),ds=new Float64Array(n*2),k=new Float64Array(n*2),v=new Float64Array(n*2);
 const roadX=new Float64Array(n*2),roadY=new Float64Array(n*2),m=n*2;
 // Reference Balanced car with six fuel laps and attainable racing pace.
 // A theoretical driver at the grip limit undervalues opening fast corners:
 // it chooses the shorter inside line wherever its ideal speed hits the cap.
 // Live drivers apply their own tyre, weather, upgrades and difficulty.
 // On a flat-out oval the inside arc is fastest; there is no linked-corner
 // sequence to straighten and extra outside distance cannot buy more speed.
 const commitment=track.ovalRadius?1:.9,braking=track.ovalRadius?195:240*.68,throttle=track.ovalRadius?.86:.81;
 const power={basePower:88.92,power:88.92,drag:1,top:328.812};
 // Reuse the reference car's thrust curve while comparing thousands of lines.
 // Half-unit interpolation changes only the planning estimate; live cars still
 // evaluate their own exact power, grip, weather and tyre state every frame.
 const acceleration=Float64Array.from({length:Math.ceil(power.top*2)+1},(_,i)=>engineAcceleration(Math.min(i*.5,power.top),power)*throttle);
 // End the last interval at the exact cap: sampling beyond it would include
 // the engine's overspeed cut and wrongly dilute thrust below the cap.
 function thrust(speed){const i=Math.min(acceleration.length-2,Math.floor(speed*2)),span=Math.min((i+1)*.5,power.top)-i*.5;return acceleration[i]+(acceleration[i+1]-acceleration[i])*(speed-i*.5)/span;}
 function score(curvatureOnly=false){
  for(let i=0;i<n;i++){x[i]=center[i].x+normals[i][0]*offsets[i];y[i]=center[i].y+normals[i][1]*offsets[i];}
  let roughness=0;
  // Score the very same continuous curve the driver will follow, twice per
  // control segment. Chord curvature hid sharp changes between old samples.
  for(let i=0;i<n;i++){
   const a=(i+n-1)%n,b=(i+1)%n,c=(i+2)%n;
   const x0=(x[a]+4*x[i]+x[b])/6,x1=(x[b]-x[a])/2,x2=(x[a]-2*x[i]+x[b])/2,x3=(-x[a]+3*x[i]-3*x[b]+x[c])/6;
   const y0=(y[a]+4*y[i]+y[b])/6,y1=(y[b]-y[a])/2,y2=(y[a]-2*y[i]+y[b])/2,y3=(-y[a]+3*y[i]-3*y[b]+y[c])/6;
   roughness+=(offsets[a]-2*offsets[i]+offsets[b])**2;
   for(let j=0;j<2;j++){
    const t=j/2,h=i*2+j,dx=x1+t*(2*x2+3*t*x3),dy=y1+t*(2*y2+3*t*y3);
    roadX[h]=x0+t*(x1+t*(x2+t*x3));roadY[h]=y0+t*(y1+t*(y2+t*y3));
    k[h]=(dx*(2*y2+6*t*y3)-dy*(2*x2+6*t*x3))/Math.max(1,(dx*dx+dy*dy)**1.5);
    v[h]=Math.min(power.top**2,225*commitment*commitment/Math.max(.0001,Math.abs(k[h])));
   }
  }
  for(let i=0;i<m;i++)ds[i]=Math.sqrt((roadX[(i+1)%m]-roadX[i])**2+(roadY[(i+1)%m]-roadY[i])**2);
  // Establish a smooth route through connected bends before chasing lap time.
  // This escapes the centreline local minimum at a loop exit, where moving
  // just one apex first looks slower until its neighbours move with it.
  if(curvatureOnly){let turnCost=0;for(let i=0;i<m;i++)turnCost+=k[i]*k[i]*ds[i];return turnCost*10000+roughness*.00015;}
  // Propagate braking and available exit acceleration around the CLOSED lap.
  // This values the exit of each bend in the context of every later bend,
  // including the final corner's effect on the first sector of the next lap.
  // Squared speeds avoid redundant roots. The second sweep closes the seam.
  for(let pass=0;pass<2;pass++){
   for(let i=m-1;i>=0;i--)v[i]=Math.min(v[i],v[(i+1)%m]+2*braking*ds[i]);
   for(let i=0;i<m;i++){
    const speed=Math.sqrt(v[i]),accel=Math.min(thrust(speed),cornerAccelerationLimit(speed,k[i],1));
    v[(i+1)%m]=Math.min(v[(i+1)%m],v[i]+2*accel*ds[i]);
   }
  }
  let time=0;for(let i=0;i<m;i++)time+=2*ds[i]/(Math.sqrt(v[i])+Math.sqrt(v[(i+1)%m]));
  return time+roughness*.00015;
 }
 let cost=score(),initial=cost;
 // Wide moves choose a route through a whole corner sequence; narrow moves
 // then remove the small entry/exit kinks that a coarse apex-by-apex path keeps.
 // Stagger neighbouring moves between sweeps of each scale: both halves of the
 // 45-unit grid are searched without repeating every candidate twice. This
 // keeps first-time circuit selection fast; completed lines are also cached.
 const bumps=[];
 for(const width of [360,220,130,75,45])for(let at=0;at<track.length;at+=45){
  const indices=[],weights=[];
  for(let i=0;i<n;i++){const d=((i*step-at+track.length*1.5)%track.length)-track.length/2;if(Math.abs(d)<width){indices.push(i);weights.push((1+Math.cos(d/width*Math.PI))/2);}}
  bumps.push({indices,weights,phase:Math.round(at/45)%2});
 }
 for(const curvatureOnly of (track.ovalRadius ? [false] : [true,false])){
  cost=score(curvatureOnly);
  for(const [sweep,amount] of [18,18,9,9,4.5,4.5,2.25,2.25,1.125,1.125,.5625].entries())for(const bump of bumps){
   if(bump.phase!==sweep%2)continue;
   const {indices,weights}=bump;
   let move=0,best=cost;
   for(const sign of [-1,1]){
    const delta=amount*sign;
    if(indices.some((i,j)=>Math.abs(offsets[i]+delta*weights[j])>margin))continue;
    for(let j=0;j<indices.length;j++)offsets[indices[j]]+=delta*weights[j];
    const next=score(curvatureOnly);
    if(next<best){best=next;move=delta;}
    for(let j=0;j<indices.length;j++)offsets[indices[j]]-=delta*weights[j];
   }
   if(move){for(let j=0;j<indices.length;j++)offsets[indices[j]]+=move*weights[j];cost=best;}
  }
 }
 score();return {baselineTime:initial,estimatedTime:cost,step,points:Array.from(offsets,(offset,i)=>({s:i*step,offset,x:x[i],y:y[i],curvature:k[i*2],speed:Math.sqrt(v[i*2])}))};
}
