import {fuelPerLap} from "./performance.js";
import {aeroUnlocked,developTeams,developmentSnapshot,fuelMultiplier,normalizeUpgrades} from "./development.js";
import {seededRandom,driverSeed} from "./racecraft.js";
import {tyreAllocation,selectableSets,limitWeekendStock,numberSoftSets} from "./tyre-stock.js";
export {tyreAllocation,selectableSets,WEEKEND_SET_IDS} from "./tyre-stock.js";
import {prepareTyres,updateTyreTemperatures,coolStoredSets} from "./tyre-temperature.js";
import {
  createWeather,
  migrateWeather,
  raceWeatherDuration,
  advanceWeather,
  trackWater,
  tyreWeatherGrip,
  recommendedTyre,
} from "./weather.js";
import { makeTrack, circuitById, selectTrack, normalizeDifficulty, Race, TRACK, TYRES, sample, clamp, PIT_LANE, samplePit, wrap, capturePoses, tyreServiceTime, gridSlot } from "./core.js";
import {weekendSchedule,careerSchedule} from "./calendar.js";
export {WEEKENDS,weekendSchedule,careerSchedule} from "./calendar.js";
export function migrateWeekend(w) {
  if (!w) return;
  if(w.setup && !w.setup.track) w.setup.track="northline";
  if(w.setup && w.distanceVersion!==3){
    const ratio=Math.max(.85,Math.min(1.35,(w.setup.fuel || 0)/(w.setup.laps || 24)));
    const laps=weekendSchedule(w.round,w.seasonOrder).laps;
    w.setup.laps=laps;w.setup.fuel=+(laps*ratio).toFixed(1);
    w.setup.weatherDuration=raceWeatherDuration(w.setup.laps,makeTrack(circuitById(w.setup.track)).length);
    if(w.phase==="R")w.raceWeatherReady=false;
    w.distanceVersion=3;
  }
  if(w.setup)w.setup.raceFormat=weekendSchedule(w.round,w.seasonOrder).raceFormat || "grandPrix";
  if(w.setup?.playerUpgrades && !aeroUnlocked(w.setup.playerUpgrades))w.setup.aeroSpec="balanced";
  if(w.setup) w.setup.difficulty=normalizeDifficulty(w.setup.difficulty);
  if(w.setup && !Number.isInteger(w.setup.aiSeed)) w.setup.aiSeed=Math.floor(Math.random()*2147483646)+1;
  const legacyTyres =
    !w.tyreModelVersion &&
    !w.weather &&
    (w.inventories || []).every((inv) => inv.length === 13);
  if (legacyTyres)
    for (const inv of w.inventories)
      for (const t of inv) {
        const ratio = { S: 5.2 / 10, M: 8.5 / 13, H: 13.5 / 19 }[t.compound];
        if (ratio) t.wear *= ratio;
      }
  w.tyreModelVersion = 2;
  if (!w.eventName) {
    const schedule = weekendSchedule(w.round,w.seasonOrder);
    const ratio = Math.max(
      0.85,
      Math.min(1.35, (w.setup?.fuel || 0) / (w.setup?.laps || schedule.laps)),
    );
    w.eventName = schedule.name;
    w.setup = {
      ...w.setup,
      laps: schedule.laps,
      raceFormat:schedule.raceFormat || "grandPrix",
      fuel: +(schedule.laps * ratio).toFixed(1),
      weather: schedule.weather,
    };
  }
  for (const inv of w.inventories || []) {
    for (const compound of ["I", "W"])
      if (!inv.some((t) => t.compound === compound))
        for (let i = 1; i <= (compound === "I" ? 5 : 2); i++)
          inv.push({
            id: compound + i,
            compound,
            wear: 0,
            distance: 0,
            used: false,
            returned: false,
            reserved: false,
          });
  }
  for(const [id,inv] of (w.inventories || []).entries())
    limitWeekendStock(inv,id===21 ? [w.selectedSetId,w.phase==="R" ? w.startSetId : null].filter(Boolean) : []);
  if(w.softSetNumbering!==1){
    for(const [driver,inv] of (w.inventories || []).entries()){
      const ids=numberSoftSets(inv);
      if(driver===21)for(const key of ["selectedSetId","startSetId"])if(ids.has(w[key]))w[key]=ids.get(w[key]);
    }
    w.softSetNumbering=1;
  }
  w.allocationVersion=3;
  if(!w.qualifyingDurations){
    w.qualifyingDurations=qualifyingDurations(w.setup.track);
    // An old save may already exceed the new clock. Leave one final outing
    // rather than declaring the driver out as soon as that save is opened.
    if(w.phase!=="R" && w.elapsed>w.qualifyingDurations[w.phase]-60)
      w.qualifyingDurations[w.phase]=Math.ceil((w.elapsed+w.qualifyingDurations[w.phase]/3)/15)*15;
  }
  restoreQualifyingGrid(w);
  w.setup.weatherSeed ??= (w.setup.aiSeed^0x9e3779b9)>>>0;
  w.setup.weatherDuration ??= raceWeatherDuration(w.setup.laps,makeTrack(circuitById(w.setup.track)).length);
  if (!w.weather) w.weather = createWeather(w.setup.weather || weekendSchedule(w.round,w.seasonOrder).weather,{seed:w.setup.weatherSeed,duration:qualifyingWeatherDuration(w)});
  migrateWeather(w.weather,{seed:w.setup.weatherSeed,duration:qualifyingWeatherDuration(w)});
}
export function startRaceWeather(w) {
  if (w.raceWeatherReady) return;
  migrateWeekend(w);
  const next=createWeather(w.setup.weather,{seed:(w.setup.weatherSeed^0xa511e9b3)>>>0,duration:w.setup.weatherDuration,
    wetness:w.weather.wetness,sectors:w.weather.sectors,initialRain:w.weather.rain});
  Object.assign(w.weather,next);
  w.raceWeatherReady = true;
}
export const Q_STAGES = [
  { name: "Q1", keep: 16 },
  { name: "Q2", keep: 10 },
  { name: "Q3", keep: 10 },
];
// Budget three out/timed/in outings, not real-world F1 minutes on arcade laps.
// Eight laps reach the third timed-lap finish; allow pit travel, two services
// and a short preparation window. This is a time budget, never a lap limit.
const qualifyingClockCache=new Map();
export function qualifyingDurations(trackId="northline") {
  if(!qualifyingClockCache.has(trackId)){
    const track=makeTrack(circuitById(trackId));
    const referenceLap=Math.max(25,track.length/225);
    const budget=8*referenceLap+100;
    qualifyingClockCache.set(trackId,Object.fromEntries(Q_STAGES.map((stage,i)=>
      [stage.name,Math.ceil((budget-i*10)/15)*15])));
  }
  return {...qualifyingClockCache.get(trackId)};
}
export function qualifyingStage(w,name=w.phase) {
  const stage=Q_STAGES.find(q=>q.name===name);
  return stage ? {...stage,duration:(w.qualifyingDurations || qualifyingDurations(w.setup.track))[name]} : null;
}
export function qualifyingWeatherDuration(w) {
  return Object.values(w.qualifyingDurations || qualifyingDurations(w.setup.track)).reduce((sum,seconds)=>sum+seconds,0);
}
// Both the first Start qualifying button and later saved outings enter the
// same on-track garage. Honour the compound chosen before the weekend opens.
export function beginQualifying(w,upgrades,profile,{setId,compound=w.setup.tyre}={}) {
  const sets=selectableSets(w.inventories[21],w.phase);
  const selected=sets.find(t=>t.id===setId) || sets.filter(t=>t.compound===compound).sort((a,b)=>a.wear-b.wear)[0] || sets[0];
  if(!selected)throw Error("No qualifying tyre sets available");
  w.selectedSetId=selected.id;w.selectedPhase=w.phase;
  return new QualifyingRun(w,selected.id,upgrades,profile);
}
export function createWeekend(career, setup) {
  const schedule = careerSchedule(career);
  developTeams(career,setup.aiSeed);
  const aiSeed=setup.aiSeed ?? Math.floor(Math.random()*2147483646)+1;
  const weatherSeed=setup.weatherSeed ?? (aiSeed^0x9e3779b9)>>>0;
  const weatherDuration=raceWeatherDuration(schedule.laps,makeTrack(circuitById(schedule.track)).length);
  return {
    version: 1,
    qualifyingDurations:qualifyingDurations(schedule.track),
    distanceVersion:3,
    tyreModelVersion: 2,
    allocationVersion: 3,
    softSetNumbering:1,
    season: career.season,
    round: career.round,
    seasonOrder:[...career.seasonOrder],
    setup: {
      ...setup,
      track:schedule.track,
      difficulty:normalizeDifficulty(setup.difficulty),
      aiSeed,weatherSeed,weatherDuration,
      laps: schedule.laps,
      raceFormat:schedule.raceFormat || "grandPrix",
      fuel: +(schedule.laps * 1.15*fuelMultiplier(career.upgrades)).toFixed(1),
      weather: schedule.weather,
      aeroSpec:aeroUnlocked(career.upgrades) ? career.aeroSpec || "balanced" : "balanced",
      playerUpgrades:normalizeUpgrades(career.upgrades),
      teamDevelopment:developmentSnapshot(career,schedule.track),
    },
    eventName: schedule.name,
    weather: createWeather(schedule.weather,{seed:weatherSeed,duration:qualifyingWeatherDuration({setup:{track:schedule.track}})}),
    conditions: { weather: "Dry", temperature: 24 },
    phase: "Q1",
    active: Array.from({ length: 22 }, (_, i) => i),
    grid: [],
    sessions: [],
    elapsed: 0,
    results: [],
    inventories: Array.from({ length: 22 }, tyreAllocation),
    runCount: 0,
    runInProgress: false,
    startSetId: "M1",
  };
}
export function validWeekend(w, c) {
  return (
    !!w &&
    w.version === 1 &&
    w.season === c.season &&
    w.round === c.round &&
    ["Q1", "Q2", "Q3", "R"].includes(w.phase) &&
    [8, 12, 14, 16, 18, 20, 24, 32, 40].includes(w.setup?.laps) &&
    Array.isArray(w.inventories) &&
    w.inventories.length === 22 &&
    w.inventories.every(
      (inv) =>
        Array.isArray(inv) &&
        inv.length === 20 &&
        inv.every(
          (t) =>
            typeof t.id === "string" &&
            !!TYRES[t.compound] &&
            Number.isFinite(t.wear) &&
            t.wear >= 0 &&
            t.wear <= 1.12 &&
            Number.isFinite(t.distance),
        ),
    ) &&
    Array.isArray(w.active) &&
    Array.isArray(w.grid) &&
    Array.isArray(w.results) &&
    Array.isArray(w.sessions) &&
    Number.isFinite(w.elapsed)
  );
}
export function ensureWeekend(c, setup) {
  migrateWeekend(c.weekend);
  if (!validWeekend(c.weekend, c)) c.weekend = createWeekend(c, setup);
  return c.weekend;
}
export function fitSet(car, set) {
  if (!set || set.returned) throw Error("Tyre set unavailable");
  car.tyre = set.compound;
  car.wear = set.wear;
  car.tyreAge = 0;
  car.tyreSet = set;
  prepareTyres(car,set);
  car.used.add(set.compound);
}
export function recordLap(w, id, lap, at) {
  if (w.phase === "R" || !w.active.includes(id) || !Number.isFinite(lap) || lap <= 0) return;
  w.attempts ||= {};w.attempts[id]=(w.attempts[id] || 0)+1;
  const row = w.results.find((r) => r.id === id);
  if (!row) w.results.push({ id, time: lap, at });
  else if (lap < row.time) {
    row.time = lap;
    row.at = at;
  }
}
export function qualifyingExpired(w) {
  const stage=qualifyingStage(w);
  return !!stage && w.elapsed>=stage.duration;
}
export function pendingFirstRuns(w) {
  if(qualifyingExpired(w))return [];
  return w.active.filter(id=>id!==21 && !(w.attempts?.[id]>0 || w.results.some(r=>r.id===id)));
}
export function qualifyingReady(w) {
  return qualifyingExpired(w) || (pendingFirstRuns(w).length===0 && (w.attempts?.[21]>0 || w.results.some(r=>r.id===21)));
}
// Archived classifications are authoritative after a stage is completed. Live
// results are cleared between stages and must never stand in for the final Q3 order.
export function qualifyingClassification(w, stage=w.phase) {
  const saved=w.sessions.find(session=>session.name===stage);
  if(saved)return saved;
  return {name:stage,order:stageOrder(w),results:w.results};
}
export function restoreQualifyingGrid(w) {
  if(w.phase!=="R")return;
  const sessions=Q_STAGES.map(stage=>w.sessions?.find(s=>s.name===stage.name));
  if(sessions.some((s,i)=>!Array.isArray(s?.order) || s.order.length!==[22,16,10][i]))return;
  const grid=[...sessions[2].order,...sessions[1].order.slice(10),...sessions[0].order.slice(16)];
  if(new Set(grid).size!==22 || grid.some(id=>!Number.isInteger(id)||id<0||id>21))return;
  w.grid=grid;
}
export function stageOrder(w) {
  if(w.phase==="R")return [...w.grid];
  return [...w.active].sort((a, b) => {
    const x = w.results.find((r) => r.id === a),
      y = w.results.find((r) => r.id === b);
    if (x && y) return x.time - y.time || x.at - y.at;
    if (x) return -1;
    if (y) return 1;
    return w.active.indexOf(a) - w.active.indexOf(b);
  });
}
function* simulateAIQualifyingSteps(w,upgrades,profile,options={}) {
  const stage=qualifyingStage(w);
  const ids=w.active.filter(id=>id!==21 && !w.results.some(r=>r.id===id));
  if(!stage || w.elapsed>=stage.duration || !ids.length)return;
  const q=new QualifyingRun(w,null,upgrades,profile,{...options,aiOnly:true,driverIds:ids});
  // Two complete outings where the remaining clock and real tyre stock allow.
  // This is the same weather, pit, temperature and wear simulation as live play.
  for(let i=0;(i<20*(stage.duration+90) || q.hasTimedLaps()) && !q.done;i++){
    q.step(.05,{});
    for(const c of q.cars)if(c.stops>=2)c.qReleaseAt=Infinity;
    if(q.cars.every(c=>c.stops>=2 || c.qUnavailable))break;
    yield;
  }
  q.endRun();
}
function exhaustSimulation(steps){
 let result=steps.next();while(!result.done)result=steps.next();return result.value;
}
// Timer nesting imposes a minimum delay on repeated setTimeout(0) yields.
// A posted task gives rendering/input a turn without adding that delay to
// every small physics batch. Ports close immediately after each yield.
export function yieldSimulation(){
 return new Promise(resolve=>{
  const channel=new MessageChannel();
  channel.port1.onmessage=()=>{channel.port1.close();channel.port2.close();resolve();};
  channel.port2.postMessage(null);
 });
}
async function responsiveSimulation(steps,{yieldControl=yieldSimulation,budgetMs=16,now=()=>performance.now()}={}){
 let deadline=now()+budgetMs,result=steps.next();
 while(!result.done){
  if(now()>=deadline){await yieldControl();deadline=now()+budgetMs;}
  result=steps.next();
 }
 return result.value;
}
export function simulateAIQualifying(w,upgrades,profile){return exhaustSimulation(simulateAIQualifyingSteps(w,upgrades,profile));}
function* finishQualifyingStageSteps(w, upgrades, profile, options={}) {
  if (w.phase === "R") return;
  const stage = qualifyingStage(w);
  yield* simulateAIQualifyingSteps(w,upgrades,profile,options);
  if(w.phase!==stage.name)return null;
  const order = stageOrder(w);
  const session={name:stage.name,keep:stage.keep,order:[...order],results:w.results.map(r=>({...r}))};
  w.sessions.push(session);
  if (w.phase === "Q3") {
    w.grid = [...order, ...w.grid];
    for (const id of w.active) {
      const reserved = w.inventories[id].find((t) => t.reserved);
      if (reserved) reserved.returned = true;
    }
    w.phase = "R";
    restoreQualifyingGrid(w);
    startRaceWeather(w);
  } else {
    w.grid = [...order.slice(stage.keep), ...w.grid];
    w.active = order.slice(0, stage.keep);
    w.phase = w.phase === "Q1" ? "Q2" : "Q3";
  }
  w.results = [];
  w.attempts = {};
  w.elapsed = 0;
  w.runCount = 0;
  w.runInProgress = false;
  return session;
}
export function finishQualifyingStage(w,upgrades,profile){return exhaustSimulation(finishQualifyingStageSteps(w,upgrades,profile));}
function* finishRemainingQualifyingSteps(w,upgrades,profile){
 while(w.phase!=="R")yield* finishQualifyingStageSteps(w,upgrades,profile);
}
export function finishRemainingQualifying(w,upgrades,profile){return exhaustSimulation(finishRemainingQualifyingSteps(w,upgrades,profile));}
export function finishRemainingQualifyingAsync(w,upgrades,profile,options){return responsiveSimulation(finishRemainingQualifyingSteps(w,upgrades,profile),options);}
export function prepareRace(r, w, startId) {
  restoreQualifyingGrid(w);
  if (w.phase !== "R" || w.grid.length !== 22)
    throw Error("Qualifying must be completed first");
  const requestedSet=w.inventories?.[21]?.find(t=>t.id===startId);
  migrateWeekend(w);
  const start = selectableSets(w.inventories[21], "R").find(
    (t) => t.id === (requestedSet?.id ?? startId),
  );
  if (!start) throw Error("Starting tyre set unavailable");
  r.weekend = w;
  r.setup = { ...w.setup };
  r.laps = w.setup.laps;
  startRaceWeather(w);
  r.weather = w.weather;
  for (const [position, id] of w.grid.entries()) {
    const c = r.cars.find((c) => c.id === id);
    c.raceFormat=w.setup.raceFormat;
    c.gridPosition = position + 1;
    Object.assign(c,gridSlot(position));
    const p = sample(c.s);
    c.x = p.x - Math.sin(p.angle) * c.offset;
    c.y = p.y + Math.cos(p.angle) * c.offset;
    c.angle = p.angle;
    c.fuel = c.player ? w.setup.fuel : (w.setup.laps * 1.1 + 0.9)*fuelMultiplier(c.upgrades);
    c.tyreInventory = w.inventories[id];
    c.tyrePhase = "R";
    const set =
      id === 21
        ? start
        : r.chooseAIStartingTyre(c);
    c.used = new Set();
    if(!set){c.dnf=true;c.nonStartReason="No available tyre sets";c.tyreSet=null;c.wear=1.12;continue;}
    fitSet(c, set);
    c.tyreAge = 600;prepareTyres(c,set,true);
  }
  r.nextSetId = selectableSets(r.player.tyreInventory, "R", startId)
    .filter((t) => t.compound !== start.compound)
    .sort((a, b) => a.wear - b.wear)[0]?.id;
  r.nextTyre =
    r.player.tyreInventory.find((t) => t.id === r.nextSetId)?.compound || "H";
}
// Fuel covers one out lap, one push lap and one in lap, including the pit detour.
export function getQualifyingFuel(upgrades={}) {
  const laps=3+(PIT_LANE.length-(TRACK.length-TRACK.pitEntry+TRACK.pitExit))/TRACK.length;
  return +(laps*fuelPerLap("push",upgrades)+.12).toFixed(2);
}
export const QUALIFYING_FUEL=getQualifyingFuel();
export function nextQualifyingSession(previous,upgrades,profile) {
  const w=previous.weekend;
  if(w.phase===previous.stage.name || !Q_STAGES.some(q=>q.name===w.phase) || !w.active.includes(21))return null;
  return qualifyingGarage(previous,upgrades,profile);
}
export function resumeQualifyingSession(previous,upgrades,profile) {
  const w=previous.weekend,stage=qualifyingStage(w);
  if(!stage || w.phase!==previous.stage.name || !w.active.includes(21) || w.elapsed>=stage.duration)return null;
  return qualifyingGarage(previous,upgrades,profile);
}
function qualifyingGarage(previous,upgrades,profile) {
  const w=previous.weekend,available=selectableSets(w.inventories[21],w.phase);
  const set=available.find(t=>t.id===previous.player.tyreSet?.id) ||
    available.filter(t=>t.compound===previous.player.tyre).sort((a,b)=>a.wear-b.wear)[0] || available[0];
  if(!set)return null;
  w.selectedSetId=set.id;w.selectedPhase=w.phase;
  const next=new QualifyingRun(w,set.id,upgrades,profile);
  next.player.drive=previous.player.drive;next.player.qNeedsRelease=true;
  next.timeScale=previous.timeScale;
  return next;
}
export class QualifyingRun extends Race {
  constructor(w, setId, upgrades, profile, options={}) {
    selectTrack(w.setup.track);
    super({ ...w.setup, laps: 10000, fuel: getQualifyingFuel(w.setup.playerUpgrades || upgrades) }, w.setup.playerUpgrades || upgrades, "career", profile);
    const requestedSet=w.inventories?.[21]?.find(t=>t.id===setId);
    migrateWeekend(w);
    const selected = selectableSets(w.inventories[21], w.phase).find(t => t.id === (requestedSet?.id ?? setId));
    if (!selected && !options.aiOnly) throw Error("Select an available tyre set");
    this.qualifying = true;
    this.freezeWeather=!!options.freezeWeather;
    this.profile=profile;
    this.timeScale=1;
    this.weather = w.weather;
    this.weekend = w;
    this.stage = qualifyingStage(w);
    this.countdown = 0;
    this.pitLimiter = true;
    this.stageStart = w.elapsed;
    this.cars = this.cars.filter(c => w.active.includes(c.id) &&
      (!options.aiOnly || c.id!==21 && options.driverIds.includes(c.id)));
    w.runInProgress = true;
    w.runCount++;
    for (const c of this.cars) {
      c.tyreInventory = w.inventories[c.id];
      c.tyrePhase = w.phase;
      c.trackWetness=trackWater(this.weather,c.s,TRACK.length,c.offset);
      c.aiRandom=seededRandom(driverSeed(this.raceSeed,c.id)^Math.imul(w.phase.charCodeAt(1),0x27d4eb2d));
      const set = c.player ? selected : this.chooseAITyres(c,3)[0]?.set;
      if (set) fitSet(c,set);
      else {c.tyreSet=null;c.wear=1.12;}
      c.qUnavailable=!set;
      c.qualifyingRun = true;
      c.fuel = getQualifyingFuel(c.upgrades);
      c.qLaps = 0;
      c.qStart = null;
      c.qInvalid = false;
      c.qState = "garage";
      c.garage = true;
      c.speed = 0;
      c.qReleaseAt = this.time + this.releaseDelay(c);
      const distance = this.pitBoxForCar(c);
      c.pit = set ? { distance, boxDistance: distance, startS: TRACK.pitEntry,
        stage: "exit", serviced: true, entryOffset: 0, timer: 0,
        nextSet: set, nextTyre: c.tyre } : null;
      const loc = samplePit(distance);
      c.s = TRACK.pitEntry + loc.progress;
      const bay = c.player ? 26 : (c.id % 2 ? 45 : 26);
      c.x = loc.x - Math.sin(loc.angle)*bay;
      c.y = loc.y + Math.cos(loc.angle)*bay;
      c.angle = loc.angle;
      c.offset = 0;
    }
    this.nextSetId = selected?.id;
    this.nextTyre = selected?.compound || this.player.tyre;
    this.say(this.stage.name + " · press W / ↑ to leave. Out lap → timed lap → in lap. Same tyres by default.");
  }
  releaseDelay(c) {
    // Individual, varied departure times; another delay follows each serviced run.
    return (c.stops ? 6 : 4) + c.aiRandom()*(c.stops ? 12 : 24) + c.ai.strategy.reaction*1.5;
  }
  launch(c) {
    if (c.qState !== "garage" || !c.pit || !c.pit.serviced || this.weekend.elapsed >= this.stage.duration) return false;
    if (this.finishingSession && c.player) return false;
    const blocked = this.cars.some(other => other !== c && !other.garage && other.pit &&
      Math.abs(other.pit.distance-c.pit.distance)<65);
    if (blocked) return false;
    c.garage = false;
    c.qState = "out";
    c.qStart = null;
    c.qInvalid = false;
    c.qLaps = 0;
    c.drive = c.player ? c.drive : "push";
    if (c.player) this.say("Out lap. Cross the line to start your one timed lap.");
    return true;
  }
  order() {
    return qualifyingClassification(this.weekend,this.stage.name).order.map(id => this.cars.find(c => c.id === id)).filter(Boolean);
  }
  requestPit() {
    if (this.player.garage) { this.say("Crew ready. Press W / ↑ when you want to leave."); return; }
    if (this.player.qState === "in") { this.pitRequested=true; this.say("In lap: pit entry is automatic. Steer into the pit road."); return; }
    super.requestPit();
  }
  selectGarageSet(id) {
    const c=this.player,p=c.pit;
    if (!p || (!c.garage && p.stage!=="service")) return false;
    const set=selectableSets(c.tyreInventory,this.weekend.phase).find(t=>t.id===id);
    if (!set) return false;
    this.nextSetId=set.id;this.nextTyre=set.compound;
    if (p.nextSet===set) return true;
    p.previousSet=c.tyreSet;p.nextSet=set;p.nextTyre=set.compound;
    p.serviced=false;p.stage="service";c.speed=0;
    p.serviceDuration=set===c.tyreSet ? 2.3 : tyreServiceTime(c.upgrades.crew,this.pitRandom || c.aiRandom);
    p.timer=Math.max(0,(p.timer || 0)-(p.aeroRemaining || 0),p.serviceDuration)+(p.aeroRemaining || 0);
    c.qNeedsRelease=true;
    this.say("Tyres selected. Minimum service wait, then press W / ↑ when ready to leave.");
    return true;
  }
  cycleTimeScale() {
    const speeds=[1,2,4,8];this.timeScale=speeds[(speeds.indexOf(this.timeScale)+1)%speeds.length];return this.timeScale;
  }
  canEndSession() { return this.weekend.phase===this.stage.name && this.weekend.active.includes(21) && qualifyingReady(this.weekend); }
  sessionAction() {
    const completed=this.weekend.sessions.find(session=>session.name===this.stage.name);
    if(completed)return `${this.stage.name} complete · P${completed.order.indexOf(21)+1}`;
    const waiting=pendingFirstRuns(this.weekend).length;
    if(waiting) return `Waiting for ${waiting} opponent${waiting===1 ? "" : "s"} to complete a first run`;
    if(!this.canEndSession())return "Complete your first timed lap before ending the session";
    const rank=stageOrder(this.weekend).indexOf(21)+1;
    const timed=this.weekend.results.some(r=>r.id===21);
    return this.stage.name!=="Q3" && timed && rank<=this.stage.keep
      ? "Move to " + (this.stage.name==="Q1" ? "Q2" : "Q3")
      : this.stage.name==="Q3" ? "Finish Q3 · provisional P"+rank : "End qualifying in P"+rank;
  }
  endSession(){return exhaustSimulation(this.endSessionSteps());}
  endSessionAsync(options){return responsiveSimulation(this.endSessionSteps(),options);}
  *endSessionSteps() {
    if (this.sessionEnded || !this.canEndSession()) return null;
    const provisionalPosition=stageOrder(this.weekend).indexOf(21)+1;
    this.sessionEnded=true;this.finishingSession=true;this.freezeWeather=true;
    // Withdraw the player; fast-forward the remaining AI outings before the cutoff is decided.
    this.player.garage=true;this.player.speed=0;
    this.player.qState="garage";this.player.pit=null;
    // Keep the conditions the player chose to finish in. Remaining AI outings
    // still use real tyres and wear, but cannot gain an AI-only drying-track advantage.
    // Use the supported 50 ms physics step for unseen runs. Every car still
    // drives its full route with traffic, tyre wear, fuel and pit service.
    for(let i=0;(i<20*(this.stage.duration+90) || this.hasTimedLaps()) && !this.done;i++){this.step(.05,{});yield;}
    this.endRun();
    if(this.weekend.phase!==this.stage.name)return null;
    const session=yield* finishQualifyingStageSteps(this.weekend,this.player.upgrades,this.profile,{freezeWeather:true});
    if(!session)return null;
    // Read the completed stage's banked times, including any previously missing AI results.
    const rank=session.order.indexOf(21)+1;
    const playerTime=session.results.find(r=>r.id===21)?.time ?? null;
    const cutoffTime=session.results.find(r=>r.id===session.order[this.stage.keep-1])?.time ?? null;
    const through=this.stage.name!=="Q3" && rank<=this.stage.keep;
    // One activation completes one stage. Eliminated players explicitly choose
    // to simulate the other stages; the Q2/Q3 action cannot silently open the race.
    const gridPosition=through ? null : this.weekend.grid.indexOf(21)+1+(this.weekend.phase==="R" ? 0 : this.weekend.active.length);
    const outcome={through,position:rank,phase:this.weekend.phase,stage:this.stage.name,keep:this.stage.keep,
      eliminated:this.stage.name!=="Q3"&&!through,provisionalPosition,playerTime,cutoffTime,
      gridPosition};
    this.weekend.qualifyingOutcome=outcome;
    return outcome;
  }
  endRun() {
    if (this.done) return;
    this.done = true;
    if(this.weekend.phase===this.stage.name){
      this.weekend.elapsed = Math.min(this.stage.duration,this.stageStart+this.time);
      this.weekend.runInProgress = false;
    }
    this.result = { qualifying:true };
  }
  hasTimedLaps() {
    return this.cars.some(c=>!c.garage && !c.pit && !c.dnf && c.qState==="timed" &&
      Number.isFinite(c.qStart) && this.stageStart+c.qStart<this.stage.duration);
  }
  crossLine(c,at=this.time) {
    if (c.qState === "out") {
      c.qState = this.stageStart+at < this.stage.duration ? "timed" : "in";
      c.qStart = c.qState === "timed" ? at : null;
      c.qInvalid = false;
      if(c.player && c.qState === "in") {
        this.pitRequested=true;
        this.say("Chequered flag. Return to the pits; this out lap cannot start a timed lap.");
      }
    } else if (c.qState === "timed") {
      const lap = at-c.qStart;
      c.lastLap = lap;
      c.qLaps = 1;
      if (!c.qInvalid && Number.isFinite(c.qStart) && this.stageStart+c.qStart<this.stage.duration) {
        c.bestLap = Math.min(c.bestLap,lap);
        recordLap(this.weekend,c.id,lap,this.stageStart+at);
      } else {
        this.weekend.attempts ||= {};this.weekend.attempts[c.id]=(this.weekend.attempts[c.id] || 0)+1;
        if(c.player) this.say("Lap deleted: track limits. Complete your in lap.");
      }
      c.qState = "in";
      c.qStart = null;
      if(c.player) { this.pitRequested = true; this.say("Timed lap complete. In lap: return to the box. Extra laps will not count."); }
    }
    // In laps and every extra lap are untimed until a complete pit service.
  }
  step(dt,input={}) {
    if(this.done || this.weekend.phase!==this.stage.name) return;
    dt=Math.min(dt,.05);
    // Complete qualifying in batches, but keep the same physics, weather and
    // decision steps as live driving. Coarse updates could skip short braking
    // features and change tyre temperatures/wear enough to reverse the result.
    if(dt>1/60+1e-8){
      const steps=Math.ceil(dt*60);
      for(let i=0;i<steps;i++)this.step(dt/steps,input);
      return;
    }
    capturePoses(this.cars);
    this.time+=dt;
    if(!this.freezeWeather)advanceWeather(this.weather,dt);
    this.weekend.elapsed=Math.min(this.stage.duration,this.stageStart+this.time);
    this.traffic=this.cars.map(c=>({id:c.id,x:c.x,y:c.y,angle:c.angle,team:c.team.name,boxRequested:!!c.ai.strategy.pitRequested,s:c.s,speed:c.speed,offset:c.offset,pit:c.pit,
      garage:c.garage,qState:c.qState,finished:c.finished,dnf:c.dnf}));
    this.updateDrafting(dt);
    for(const c of this.cars) {
      coolStoredSets(c,dt);
      if(c.garage && c.pit?.stage!=="service") {
        updateTyreTemperatures(c,dt);
        if(c.qNeedsRelease && !input.throttle) c.qNeedsRelease=false;
        if(c.player ? input.throttle && !c.qNeedsRelease : this.time>=c.qReleaseAt) this.launch(c);
        continue;
      }
      const old=c.s, oldStops=c.stops;
      c.trackWetness=trackWater(this.weather,c.s,TRACK.length,c.offset);
      c.contactCooldown=Math.max(0,c.contactCooldown-dt);
      if(c.pit) {
        if(!c.pit.serviced) { c.qState=c.garage ? "garage" : "in"; c.qStart=null; }
        this.stepPit(c,dt,input);
        if(c.stops>oldStops) {
          c.fuel=getQualifyingFuel(c.upgrades);
          c.qStart=null;
          c.qState="garage";
          c.garage=true;
          c.qInvalid=false;
          c.qNeedsRelease=!!input.throttle;
          c.speed=0;
          c.qReleaseAt=this.time+this.releaseDelay(c);
          if(c.player) {
            this.nextSetId=c.tyreSet.id;
            this.nextTyre=c.tyre;
            this.say("Service complete. Choose tyres or aero here, then press W / ↑ to leave when ready.");
          }
        }
      } else if(c.player) {
        if(c.qState==="in") this.pitRequested=true;
        this.stepPlayer(c,dt,input);
      }
      else {
        super.stepAI(c,dt);
      }
      if(!c.pit && Math.floor(c.s/TRACK.length)>Math.floor(old/TRACK.length)) {
        // The crossing can precede zero even when this physics step ends after it.
        const line=(Math.floor(old/TRACK.length)+1)*TRACK.length;
        const crossedAt=this.time-dt+dt*(line-old)/(c.s-old);
        this.crossLine(c,crossedAt);
      }
      if(c.player && c.qState==="timed") {
        const p=sample(c.s);
        if(Math.hypot(c.x-p.x,c.y-p.y)>TRACK.width/2+8) c.qInvalid=true;
      }
      if(!c.pit && c.fuel<=0 && c.speed<4) {
        c.garage=true;
        c.qState="stranded";
        if(c.player) { this.say("Out of fuel. Return to the garage to prepare another outing."); if(!this.hasTimedLaps())this.endRun(); }
      }
    }
    this.collisions();
    if((this.weekend.elapsed>=this.stage.duration && this.cars.every(c=>c.garage)) ||
      this.stageStart+this.time>this.stage.duration+90 && !this.hasTimedLaps()) this.endRun();
    this.skids=this.skids.filter(s=>this.time-s.t<16);
  }
}

export function qualifyingProgress(w, playerId=21, stageName=w.phase) {
  const stage=qualifyingStage(w,stageName);
  if(!stage) return null;
  const {order,results}=qualifyingClassification(w,stageName), rank=order.indexOf(playerId)+1;
  const cutoffId=order[stageName==='Q3' ? 0 : stage.keep-1], cutoff=results.find(r=>r.id===cutoffId);
  const player=results.find(r=>r.id===playerId);
  const rival=results.find(r=>r.id===order[stageName==='Q3' ? 0 : rank<=stage.keep ? stage.keep : stage.keep-1]);
  return {keep:stage.keep,rank,cutoffId,cutoffTime:cutoff?.time??null,
    playerTime:player?.time??null,through:!!player && rank<=stage.keep,
    margin:player && rival ? player.time-rival.time : null,
    final:stageName==='Q3'};
}
export function qualifyingStatus(car) {
  if(car.garage || car.pit) return 'PITS';
  return {out:'OUT LAP',timed:'TIMED LAP',in:'IN LAP',stranded:'STOPPED'}[car.qState] || 'PITS';
}
