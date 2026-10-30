// Sector clocks use interpolated physical crossings, never estimated interval gaps.
// Session records are plain data so qualifying can retain them between outings.
export function createSectorSession(name="Race") {
  return {name,bestSectors:[null,null,null],drivers:{},fastestLap:null};
}
export function startSectorLap(car,at,from=0) {
  car.sectorTiming ||= {bars:[null,null,null],event:null,sequence:0,active:null,lap:null};
  car.sectorTiming.lap={from,start:at,lastAt:at,next:0,valid:true,times:[]};
  car.sectorTiming.active=0;
}
export function stopSectorLap(car) {
  if(car.sectorTiming){car.sectorTiming.lap=null;car.sectorTiming.active=null;}
}
function driverRecord(session,id) {
  return session.drivers[id] ||= {sectors:[null,null,null],bestLap:null};
}
export function recordSessionLap(session,id,time) {
  if(!Number.isFinite(time)||time<=0)return;
  const driver=driverRecord(session,id);
  if(driver.bestLap===null||time<driver.bestLap)driver.bestLap=time;
  // Equal laps retain the first driver to set the time.
  if(!session.fastestLap||time<session.fastestLap.time-1e-9)session.fastestLap={driverId:id,time};
}
export function advanceSectors(session,car,from,to,before,after,length,{invalid=false,pit=false,repeat=true}={}) {
  const state=car.sectorTiming;
  if(!state?.lap)return null;
  if(invalid||pit)state.lap.valid=false;
  if(to<=from||after<=before)return null;
  // Recovery/branch jumps cannot manufacture a sector or fastest lap.
  if(to-from>length/4)state.lap.valid=false;
  let completed=null;
  while(state.lap){
    const lap=state.lap,index=lap.next,boundary=lap.from+(index===2 ? length : (index+1)*length/3);
    if(boundary>to)break;
    if(boundary<from-1e-6)lap.valid=false;
    const at=before+(after-before)*Math.max(0,Math.min(1,(boundary-from)/(to-from)));
    const time=at-lap.lastAt,valid=lap.valid&&time>0;
    const driver=driverRecord(session,car.id),overall=session.bestSectors[index],personal=driver.sectors[index];
    const colour=!valid ? "invalid" : overall===null||time<overall.time-1e-9 ? "purple" :
      personal===null||time<personal-1e-9 ? "green" : "yellow";
    if(valid){
      if(personal===null||time<personal)driver.sectors[index]=time;
      if(overall===null||time<overall.time-1e-9)session.bestSectors[index]={driverId:car.id,time};
    }
    state.bars[index]={time,colour};
    state.event={sector:index,time,colour,sequence:++state.sequence};
    lap.times[index]=time;lap.lastAt=at;lap.next++;
    if(index===2){
      completed={time:at-lap.start,at,valid:lap.valid&&lap.times.every(t=>t>0)};
      if(completed.valid)recordSessionLap(session,car.id,completed.time);
      if(repeat)startSectorLap(car,at,lap.from+length);
      else stopSectorLap(car);
    }else state.active=lap.next;
  }
  return completed;
}

// A live lap clock is distinct from elapsed race time and the qualifying deadline.
export function currentLapTime(run) {
  const car=run.player;
  if(run.qualifying)return car.qState==="timed" && Number.isFinite(car.qStart) ? Math.max(0,run.time-car.qStart) : null;
  if(car.finished)return car.lastLap || null;
  return Math.max(0,run.time-car.lapStart);
}
