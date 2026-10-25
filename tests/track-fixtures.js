import {TRACK,selectTrack,trackLayer} from '../src/core.js';
export function crossingDistances(id){
 selectTrack(id);const p=TRACK.pts;
 for(let i=0;i<p.length-1;i++)for(let j=i+20;j<p.length-1;j++){
  if(trackLayer(p[i].s)===trackLayer(p[j].s))continue;
  const a=p[i],b=p[i+1],c=p[j],d=p[j+1],rx=b.x-a.x,ry=b.y-a.y,sx=d.x-c.x,sy=d.y-c.y,den=rx*sy-ry*sx;
  if(Math.abs(den)<1e-9)continue;
  const t=((c.x-a.x)*sy-(c.y-a.y)*sx)/den,u=((c.x-a.x)*ry-(c.y-a.y)*rx)/den;
  if(t>=0&&t<=1&&u>=0&&u<=1){const first=a.s+(b.s-a.s)*t,second=c.s+(d.s-c.s)*u;return trackLayer(first)?[first,second]:[second,first];}
 }
 throw Error('No bridge crossing on '+id);
}
