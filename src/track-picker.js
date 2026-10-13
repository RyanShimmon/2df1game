import {makeTrack} from './core.js';
const thumbnails=new Map();
// Draw a miniature snapshot from the same sampled circuit used by the game.
export function circuitThumbnail(circuit) {
 if(thumbnails.has(circuit.id))return thumbnails.get(circuit.id);
 const t=makeTrack(circuit),b=t.bounds,w=b.maxX-b.minX,h=b.maxY-b.minY;
 const path=points=>points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
 const road=path(t.pts)+' Z',background=t.theme==='desert'?'#65513e':t.theme==='city'?'#303e44':'#29473e';
 const sections=t.bridges.map(([a,b])=>{
  const d=path(t.pts.filter(p=>p.s>=a&&p.s<=b));
  return `<path d="${d}" stroke="#101b20" stroke-width="160" transform="translate(0 20)" opacity=".6"/><path d="${d}" stroke="#d5d8c7" stroke-width="142"/><path d="${d}" stroke="#de665d" stroke-width="136" stroke-dasharray="30 30"/><path d="${d}" stroke="#3c484e" stroke-width="126"/>`;
 }).join('');
 const banks=t.banks.map(([a,b])=>{
  const points=t.pts.filter(p=>p.s>=a&&p.s<=b).map(p=>({x:p.x+Math.sin(p.angle)*43,y:p.y-Math.cos(p.angle)*43}));
  return `<path d="${path(points)}" stroke="#d7c296" stroke-width="8" stroke-dasharray="24 18"/>`;
 }).join('');
 const start=t.pts[0],end=t.pts[1],angle=Math.atan2(end.y-start.y,end.x-start.x);
 const svg=`<svg class="track-thumbnail" style="background:${background}" viewBox="${b.minX} ${b.minY} ${w} ${h}" role="img" aria-label="${circuit.name} circuit layout" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grass-${circuit.id}" width="180" height="180" patternUnits="userSpaceOnUse"><rect width="90" height="180" fill="#ffffff" opacity=".025"/></pattern></defs><rect x="${b.minX}" y="${b.minY}" width="${w}" height="${h}" fill="${background}"/><rect x="${b.minX}" y="${b.minY}" width="${w}" height="${h}" fill="url(#grass-${circuit.id})"/><g fill="none" stroke-linejoin="round"><path d="${road}" stroke="#0d2420" stroke-width="174"/><path d="${road}" stroke="#d5d8c7" stroke-width="142"/><path d="${road}" stroke="#de665d" stroke-width="136" stroke-dasharray="30 30"/><path d="${road}" stroke="#3c484e" stroke-width="126"/>${banks}${sections}</g><path d="M${start.x-Math.sin(angle)*63},${start.y+Math.cos(angle)*63} L${start.x+Math.sin(angle)*63},${start.y-Math.cos(angle)*63}" stroke="#f7f7ec" stroke-width="13"/></svg>`;
 const result={svg,length:t.length};thumbnails.set(circuit.id,result);return result;
}
