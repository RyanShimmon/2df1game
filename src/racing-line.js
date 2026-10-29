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
 // Reference Balanced car with six fuel laps. Live drivers apply their own
 // compound, wear, weather, upgrades and difficulty on this shared route.
 const power={basePower:88.92,power:88.92,drag:1,top:328.812};
 function score(){
  for(let i=0;i<n;i++){x[i]=center[i].x+normals[i][0]*offsets[i];y[i]=center[i].y+normals[i][1]*offsets[i];}
  let roughness=0;
  // Score the very same continuous curve the driver will follow, twice per
  // control segment. Chord curvature hid sharp changes between old samples.
  for(let i=0;i<n;i++){
   const a=(i+n-1)%n,b=(i+1)%n,c=(i+2)%n;
   const cx=racingSplineCoefficients(x[a],x[i],x[b],x[c]),cy=racingSplineCoefficients(y[a],y[i],y[b],y[c]);
   roughness+=(offsets[a]-2*offsets[i]+offsets[b])**2;
   for(let j=0;j<2;j++){
    const t=j/2,h=i*2+j,dx=cx[1]+t*(2*cx[2]+3*t*cx[3]),dy=cy[1]+t*(2*cy[2]+3*t*cy[3]);
    roadX[h]=cx[0]+t*(cx[1]+t*(cx[2]+t*cx[3]));roadY[h]=cy[0]+t*(cy[1]+t*(cy[2]+t*cy[3]));
    k[h]=(dx*(2*cy[2]+6*t*cy[3])-dy*(2*cx[2]+6*t*cx[3]))/Math.max(1,Math.hypot(dx,dy)**3);
    v[h]=Math.min(power.top,Math.sqrt(225/Math.max(.0001,Math.abs(k[h]))));
   }
  }
  for(let i=0;i<m;i++)ds[i]=Math.hypot(roadX[(i+1)%m]-roadX[i],roadY[(i+1)%m]-roadY[i]);
  // Propagate braking and available exit acceleration around the CLOSED lap.
  // This values the exit of each bend in the context of every later bend,
  // including the final corner's effect on the first sector of the next lap.
  for(let pass=0;pass<3;pass++){
   for(let i=m-1;i>=0;i--)v[i]=Math.min(v[i],Math.sqrt(v[(i+1)%m]**2+2*195*ds[i]));
   for(let i=0;i<m;i++){
    const accel=Math.min(engineAcceleration(v[i],power)*.86,cornerAccelerationLimit(v[i],k[i],1));
    v[(i+1)%m]=Math.min(v[(i+1)%m],Math.sqrt(v[i]**2+2*accel*ds[i]));
   }
  }
  let time=0;for(let i=0;i<m;i++)time+=2*ds[i]/(v[i]+v[(i+1)%m]);
  return time+roughness*.00015;
 }
 let cost=score(),initial=cost;
 const bumps=[];
 for(const width of [360,220,130])for(let at=0;at<track.length;at+=90){
  const indices=[],weights=[];
  for(let i=0;i<n;i++){const d=((i*step-at+track.length*1.5)%track.length)-track.length/2;if(Math.abs(d)<width){indices.push(i);weights.push((1+Math.cos(d/width*Math.PI))/2);}}
  bumps.push({indices,weights});
 }
 for(const amount of [18,9,4.5,2.25,1.125])for(const bump of bumps){
  const {indices,weights}=bump;
  let move=0,best=cost;
  for(const sign of [-1,1]){
   const delta=amount*sign;
   if(indices.some((i,j)=>Math.abs(offsets[i]+delta*weights[j])>margin))continue;
   for(let j=0;j<indices.length;j++)offsets[indices[j]]+=delta*weights[j];
   const next=score();
   if(next<best){best=next;move=delta;}
   for(let j=0;j<indices.length;j++)offsets[indices[j]]-=delta*weights[j];
  }
  if(move){for(let j=0;j<indices.length;j++)offsets[indices[j]]+=move*weights[j];cost=best;}
 }
 score();return {baselineTime:initial,estimatedTime:cost,step,points:Array.from(offsets,(offset,i)=>({s:i*step,offset,x:x[i],y:y[i],curvature:k[i*2],speed:v[i*2]}))};
}
