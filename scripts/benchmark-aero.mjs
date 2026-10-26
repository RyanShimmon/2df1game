import {pathToFileURL} from 'node:url';
import {Race,TRACK,AI_LINE,CIRCUITS,sample,angleDiff} from '../src/core.js';
import {racingPoint} from '../src/racecraft.js';

// Equal car, driver, fuel and tyre condition, with no traffic or strategy changes.
// Two warm-up laps, then one measured flying lap split into 24 distance bins.
// Fractional boundary crossings avoid a frame of error at every section boundary.
export function benchmarkAero(track,condition='dry'){
 if(!CIRCUITS.some(t=>t.id===track))throw Error(`Unknown circuit: ${track}`);
 if(!['dry','wet','worn'].includes(condition))throw Error(`Unknown condition: ${condition}`);
 const water=condition==='wet'?.8:0,tyre=condition==='wet'?'W':'M',wear=condition==='worn'?.65:0;
 const results={},dt=1/60;
 for(const aeroSpec of ['balanced','downforce','lowDrag']){
  const race=new Race({track,laps:3,fuel:6,tyre,weather:'dry',aiSeed:42,tyreTemperatureEnabled:false});
  const car=race.cars[0],point=sample(0),ref=racingPoint(AI_LINE,0);
  Object.assign(car,{s:0,offset:ref.offset,x:point.x-Math.sin(point.angle)*ref.offset,y:point.y+Math.cos(point.angle)*ref.offset,
   angle:ref.angle,motionAngle:ref.angle,tyre,pace:1,speed:230,wear,upgrades:{aero:1},aeroSpec});
  car.driverStyle.line=0;car.ai.nextDecision=Infinity;car.ai.strategy.nextReview=Infinity;
  car.ai.mode='cruise';car.ai.strategy.plannedMode='balanced';race.cars=[car];race.traffic=[car];
  const bins=Array(24).fill(0),speed=Array(24).fill(0),start=TRACK.length*2,end=TRACK.length*3,binLength=TRACK.length/24;
  let maxHeadingError=0,top=0;
  for(let frame=0;frame<60*(60+TRACK.length*3/65)&&car.s<end;frame++){
   Object.assign(car,{fuel:6,wear,wheelWear:Array(4).fill(wear),trackWetness:water});
   const {x,y,s:oldS}=car;race.time+=dt;race.stepAI(car,dt);
   if(car.drive!=='balanced')throw Error('Benchmark pace mode changed');
   if(car.s<=start)continue;
   const error=Math.abs(angleDiff(Math.atan2(car.y-y,car.x-x),car.angle+car.ai.slip));
   maxHeadingError=Math.max(maxHeadingError,error);top=Math.max(top,car.speed);
   for(let from=Math.max(oldS,start);from<Math.min(car.s,end)-1e-9;){
    const bin=Math.min(23,Math.floor((from-start+1e-8)/binLength));
    const to=Math.min(car.s,end,start+(bin+1)*binLength),seconds=dt*(to-from)/(car.s-oldS);
    bins[bin]+=seconds;speed[bin]+=car.speed*seconds;from=to;
   }
  }
  if(car.s<end)throw Error(`${track}/${aeroSpec} did not complete three laps`);
  const rounded=n=>+n.toFixed(4);
  results[aeroSpec]={lap:rounded(bins.reduce((a,b)=>a+b,0)),top:rounded(top),
   bins:bins.map(rounded),speeds:speed.map((n,i)=>rounded(n/bins[i])),maxHeadingError,trackLimits:car.trackLimits};
 }
 const d=results.downforce,l=results.lowDrag;
 return {track,condition,length:+TRACK.length.toFixed(0),
  controls:{tyre,wear,water,fuel:6,temperature:'ideal',mode:'balanced',difficulty:'normal',seed:42,upgrades:{aero:1},traffic:false},results,
  downforceAdvantagePct:+((l.lap-d.lap)/l.lap*100).toFixed(2),
  downforceSections:d.bins.filter((t,i)=>t<l.bins[i]-.02).length,lowDragSections:d.bins.filter((t,i)=>t>l.bins[i]+.02).length};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const id=process.argv[2],condition=process.argv[3] || 'dry';
 if(id&&!CIRCUITS.some(t=>t.id===id))throw Error(`Unknown circuit: ${id}`);
 const output=CIRCUITS.filter(t=>!id||t.id===id).map(t=>{
  const row=benchmarkAero(t.id,condition);console.error(t.id,row.downforceAdvantagePct,row.downforceSections,row.lowDragSections);return row;
 });
 console.log(JSON.stringify(output,null,2));
}
