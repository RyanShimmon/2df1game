// Sector clocks use interpolated physical crossings, never estimated interval gaps.
// Session records are plain data so qualifying can retain them between outings.
export function createSectorSession(name="Race") {
  return {name,bestSectors:[null,null,null],drivers:{},fastestLap:null};
}
export function startSectorLap(car,at,from=0) {
  car.sectorTiming ||= {bars:[null,null,null],event:null,sequence:0,active:null,lap:null};
  car.sectorTiming.lap={from,start:at,lastAt:at,next:0,valid:true,sectorValid:true,times:[]};
  car.sectorTiming.active=0;
}
export function restoreSectorDisplay(session,car){
  const saved=session.drivers[car.id]?.lastSectors;
  car.sectorTiming={bars:saved ? saved.map(result=>result && {...result}) : [null,null,null],
    event:null,sequence:0,active:null,lap:null};
}
export function invalidateSector(car) {
  const lap=car.sectorTiming?.lap;
  if(lap){lap.valid=false;lap.sectorValid=false;}
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
export function advanceSectors(session,car,from,to,before,after,length,{invalid=false,lapInvalid=false,pit=false,repeat=true}={}) {
  const state=car.sectorTiming;
  if(!state?.lap)return null;
  if(lapInvalid)state.lap.valid=false;
  if(invalid||pit)invalidateSector(car);
  if(to<=from||after<=before)return null;
  // Recovery/branch jumps cannot manufacture a sector or fastest lap.
  const jumped=to-from>length/4;
  if(jumped)invalidateSector(car);
  let completed=null;
  while(state.lap){
    const lap=state.lap,index=lap.next,boundary=lap.from+(index===2 ? length : (index+1)*length/3);
    if(boundary>to)break;
    if(jumped||boundary<from-1e-6)invalidateSector(car);
    const at=before+(after-before)*Math.max(0,Math.min(1,(boundary-from)/(to-from)));
    const time=at-lap.lastAt,valid=lap.sectorValid&&time>0;
    const driver=driverRecord(session,car.id),overall=session.bestSectors[index],personal=driver.sectors[index];
    const colour=!valid ? "invalid" : overall===null||time<overall.time-1e-9 ? "purple" :
      personal===null||time<personal-1e-9 ? "green" : "yellow";
    if(valid){
      if(personal===null||time<personal)driver.sectors[index]=time;
      if(overall===null||time<overall.time-1e-9)session.bestSectors[index]={driverId:car.id,time};
    }
    state.bars[index]={time,colour};
    driver.lastSectors=state.bars.map(result=>result && {...result});
    state.event={sector:index,time,colour,sequence:++state.sequence};
    lap.times[index]=time;lap.lastAt=at;lap.next++;
    // A deleted lap stays ineligible, but a later clean sector still has a
    // useful personal/session comparison. Only the affected sector is grey.
    lap.sectorValid=true;
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
