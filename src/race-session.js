import {addWetRaceSets} from "./tyre-stock.js";
import {hasWetRaceConditions} from "./weather.js";
import {Race,TRACK,gridSlot,sample,raceProgress,completedRaceLaps} from "./core.js";
import {seededRandom} from "./racecraft.js";
import {restoreSectorDisplay,startSectorLap} from "./sectors.js";
import {outstandingPenalty} from "./timing.js";

const fields=["gridPosition","tyre","wear","wheelWear","tyreTemperatures","tyreAge","aeroSpec","drive",
  "stops","history","contacts","penalties","penaltySecondsTotal","trackLimits","lastLap",
  "finished","dnf","finishTime","trackFinishTime","nonStartReason","weatherPitTime"];
const raceFields=["time","weather","sectors","nextTyre","nextSetId","nextAeroSpec","pitTyreChoice","pitAeroChosen","pitRequested","difficulty"];
const pick=(object,keys)=>Object.fromEntries(keys.filter(key=>object[key]!==undefined).map(key=>[key,object[key]]));

export function raceSnapshot(race){
  const cars=race.order().map(car=>({
    id:car.id,completed:completedRaceLaps(car),progress:raceProgress(car),
    fuel:car.fuel,lapStartFuel:car.lapStartFuel ?? car.fuel,bestLap:Number.isFinite(car.bestLap)?car.bestLap:null,
    state:pick(car,fields),penalty:outstandingPenalty(car),used:[...car.used],
    inventory:car.tyreInventory,tyreId:car.tyreSet?.id,
    random:car.aiRandom.state(),ai:pick(car.ai,["pace","mode","nextDecision","pacePhase","paceHoldUntil","savingFuel","cooling"]),
    strategy:pick(car.ai.strategy,["lastStop","plannedMode"])
  }));
  return structuredClone({...pick(race,raceFields),cars,
    pitRequested:race.pitRequested || !!(race.player.pit && !race.player.pit.serviced)});
}

export function beginRaceSession(race,career){
  const start=raceSnapshot(race);
  return {version:1,mode:race.mode,setup:{...structuredClone(race.setup),aiSeed:race.raceSeed},
    upgrades:{...race.player.upgrades},season:career?.season,round:career?.round,
    restarts:0,start,current:start};
}
export function restartPenalty(session,count=session.restarts+1){
  const original=session.start.cars.find(c=>c.id===21).state.gridPosition;
  const target=original+5*count;
  return {grid:Math.min(session.start.cars.length,target),seconds:Math.max(0,target-session.start.cars.length)};
}

export function restoreRaceSession(session,career,{restart=false}={}){
  if(session?.version!==1 || !["career","quick"].includes(session.mode) ||
    !Number.isSafeInteger(session.restarts) || session.restarts<0)return null;
  const weekend=session.mode==="career" ? career?.weekend : null;
  if(session.mode==="career" && (weekend?.phase!=="R" || career.round!==session.round ||
    career.season!==session.season || weekend.setup.aiSeed!==session.setup.aiSeed ||
    weekend.setup.track!==session.setup.track))return null;
  const snapshot=structuredClone(restart ? session.start : session.current);
  if(!Array.isArray(snapshot?.cars) || snapshot.cars.length!==22 || new Set(snapshot.cars.map(c=>c.id)).size!==22 ||
    !snapshot.cars.every(c=>Number.isInteger(c.id) && c.id>=0 && c.id<22 && Number.isFinite(c.fuel) && Number.isInteger(c.completed)))return null;
  const race=new Race(session.setup,session.upgrades,session.mode,career?.profile);
  Object.assign(race,pick(snapshot,raceFields));
  if(weekend){
    race.weekend=weekend;
    weekend.weather=race.weather;
  }
  const grid=snapshot.cars;
  if(restart){
    grid.sort((a,b)=>a.state.gridPosition-b.state.gridPosition);
    const penalty=restartPenalty(session);
    const [player]=grid.splice(grid.findIndex(c=>c.id===21),1);
    grid.splice(penalty.grid-1,0,player);
    grid.forEach((c,i)=>{c.state.gridPosition=i+1;});
    player.penalty+=penalty.seconds;
    player.state.penaltySecondsTotal+=penalty.seconds;
    if(penalty.seconds)player.state.penalties++;
  }
  let slot=0;
  for(const saved of grid){
    const car=race.cars[saved.id];
    Object.assign(car,saved.state,{used:new Set(saved.used),penalty:saved.penalty,bestLap:saved.bestLap ?? Infinity});
    if(weekend){
      car.tyrePhase="R";
      car.tyreInventory=weekend.inventories[car.id]=saved.inventory;
      if(hasWetRaceConditions(race.weather))addWetRaceSets(car.tyreInventory);
      car.tyreSet=car.tyreInventory.find(t=>t.id===saved.tyreId) || null;
    }
    car.aiRandom=seededRandom(saved.random);
    Object.assign(car.ai,saved.ai);
    Object.assign(car.ai.strategy,saved.strategy);
    car.completedLaps=saved.completed;
    car.fuel=saved.fuel;
    car.s=saved.progress;
    const racing=!car.finished && !car.dnf;
    if(racing){
      const position=gridSlot(slot++);
      car.offset=position.offset;
      car.gridLap=saved.completed;
      car.s=saved.completed*TRACK.length+position.s;
      car.ai.launch={s:car.s,offset:car.offset};
      car.fuel=car.lapStartFuel=saved.lapStartFuel;
      car.lapStart=race.time;
    }
    const loc=sample(car.s);
    car.x=loc.x-Math.sin(loc.angle)*car.offset;
    car.y=loc.y+Math.cos(loc.angle)*car.offset;
    car.motionAngle=car.angle=loc.angle;
    restoreSectorDisplay(race.sectors,car);
    if(racing)startSectorLap(car,race.time,saved.completed*TRACK.length);
  }
  if(weekend)weekend.setup.aeroSpec=race.player.aeroSpec;
  if(restart)session.restarts++;
  return race;
}
