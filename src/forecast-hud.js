import {weatherTimeline} from "./weather.js";

const sun='<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>';
const cloud='<path d="M6 15H5a4 4 0 0 1 0-8 6 6 0 0 1 11-2 5 5 0 0 1 2 10h-1"/>';
const rainSymbol=rain=>rain>.6 ? cloud+'<path d="m7 18-1 4m7-4-1 4m7-4-1 4"/>' : rain>.05 ? cloud+'<path d="m9 18-1 2m7-2-1 2"/>' : sun;
const rainLabel=rain=>rain>.6 ? "Heavy rain" : rain>.05 ? "Light rain" : "Dry";

// The HUD reads the same physical rain/runoff projection as the garage and AI.
// Pixel-sized viewBox coordinates keep text and icons undistorted on resize.
export function forecastHUD(state,width){
  const points=weatherTimeline(state,360,15),left=38,right=Math.max(280,width)-8,top=4,bottom=40;
  const x=point=>left+(right-left)*(point.time-state.elapsed)/360,y=water=>bottom-(bottom-top)*Math.max(0,Math.min(1,water));
  const value=n=>n.toFixed(2),at=(point)=>`${value(x(point))},${value(y(point.water))}`;
  let path=`M${at(points[0])}`;
  for(let i=1;i<points.length;i++){
    const previous=points[i-1],point=points[i],middle=(x(previous)+x(point))/2;
    path+=` C${value(middle)},${value(y(previous.water))} ${value(middle)},${value(y(point.water))} ${at(point)}`;
  }
  const current=Math.round(state.wetness*100),change=points[8].water-state.wetness;
  const trend=change>.015 ? "rising" : change<-.015 ? "drying" : "holding";
  const landmarks=[0,8,16,24].map(i=>points[i]);
  const icons=landmarks.map((point,i)=>`<span><svg viewBox="0 0 24 24" aria-hidden="true">${rainSymbol(point.rain)}</svg><span>${rainLabel(point.rain)}</span></span>`).join("");
  const chart=[0,.5,1].map(water=>`<line class="forecast-gridline" x1="${left}" x2="${right}" y1="${y(water)}" y2="${y(water)}"/><text x="0" y="${y(water)+3}">${water*100}%</text>`).join("")+
    `<path class="forecast-fill" d="${path} L${right},${bottom} L${left},${bottom} Z"/><path class="forecast-water-line" d="${path}"/><line class="forecast-now-line" x1="${left}" x2="${left}" y1="0" y2="${bottom+3}"/><circle class="forecast-water-dot" cx="${left}" cy="${y(state.wetness)}" r="3"/>`+
    landmarks.map((point,i)=>`<text x="${x(point)}" y="56" text-anchor="${i===0 ? "start" : i===3 ? "end" : "middle"}">${i===0 ? "Now" : `+${i*2} min`}</text>`).join("");
  const description=landmarks.map((point,i)=>`${i===0 ? "Now" : `In ${i*2} minutes`}: ${rainLabel(point.rain).toLowerCase()}, ${Math.round(point.water*100)} percent track wetness`).join(". ");
  return {summary:`${current}% wet · ${trend}`,icons,chart,description};
}
