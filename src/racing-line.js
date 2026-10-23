// Optimize the complete closed lap, including acceleration between linked bends.
// Smooth, overlapping lateral moves minimize an estimated lap time while staying
// inside the road. No separate apex targets force unnecessary changes of side.
// The forward/backward speed envelope penalizes a line that spoils the next exit.
export function optimizeRacingLine(track,sample){
 const n=Math.ceil(track.length/24),step=track.length/n,margin=track.width/2-22;
 const center=Array.from({length:n},(_,i)=>sample(i*step));
 const normals=center.map(p=>[-Math.sin(p.angle),Math.cos(p.angle)]);
 const offsets=new Float64Array(n),x=new Float64Array(n),y=new Float64Array(n),ds=new Float64Array(n),k=new Float64Array(n),v=new Float64Array(n);
 function score(){
  for(let i=0;i<n;i++){x[i]=center[i].x+normals[i][0]*offsets[i];y[i]=center[i].y+normals[i][1]*offsets[i];}
  let roughness=0;
  for(let i=0;i<n;i++){
   const a=(i+n-1)%n,c=(i+1)%n,ax=x[i]-x[a],ay=y[i]-y[a],bx=x[c]-x[i],by=y[c]-y[i];
   const ab=Math.hypot(ax,ay),bc=Math.hypot(bx,by),ac=Math.hypot(x[c]-x[a],y[c]-y[a]);
   ds[i]=bc;k[i]=2*(ax*by-ay*bx)/Math.max(1,ab*bc*ac);
   v[i]=Math.min(330,Math.sqrt(225/Math.max(.0001,Math.abs(k[i]))));
   roughness+=(offsets[a]-2*offsets[i]+offsets[c])**2;
  }
  for(let pass=0;pass<2;pass++){
   for(let i=n-1;i>=0;i--)v[i]=Math.min(v[i],Math.sqrt(v[(i+1)%n]**2+2*195*ds[i]));
   for(let i=0;i<n;i++)v[(i+1)%n]=Math.min(v[(i+1)%n],Math.sqrt(v[i]**2+2*70*ds[i]));
  }
  let time=0;for(let i=0;i<n;i++)time+=2*ds[i]/(v[i]+v[(i+1)%n]);
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
 score();return {baselineTime:initial,estimatedTime:cost,step,points:Array.from(offsets,(offset,i)=>({s:i*step,offset,x:x[i],y:y[i],curvature:k[i],speed:v[i]}))};
}
