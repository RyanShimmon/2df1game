import {prepareTyres,updateTyreTemperatures,coolStoredSets} from "./tyre-temperature.js";
import {
  createWeather,
  advanceWeather,
  trackWater,
  tyreWeatherGrip,
  recommendedTyre,
  rainAt,
} from "./weather.js";
import { selectTrack, normalizeDifficulty, Race, TRACK, TYRES, sample, resources, clamp, PIT_LANE, samplePit, wrap, capturePoses, tyreServiceTime } from "./core.js";
export const WEEKENDS = [
  { name: "Northline Opener", track:"northline", laps: 24, weather: "showers" },
  { name: "Velocity Trophy", track:"velocity", laps: 24, weather: "wetToDry" },
  { name: "Sunset Grand Prix", track:"sunset", laps: 20, weather: "dry" },
  { name: "Harbour Sprint", track:"harbour", laps: 14, weather: "lateRain" },
  { name: "Crossover Challenge", track:"crossover", laps: 24, weather: "showers" },
  { name: "Alpine Finale", track:"alpine", laps: 24, weather: "lateRain" },
];
export const weekendSchedule = (round) =>
  WEEKENDS[(round - 1) % WEEKENDS.length];
export function migrateWeekend(w) {
  if (!w) return;
  if(w.setup && !w.setup.track) w.setup.track="northline";
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
    const schedule = weekendSchedule(w.round);
    const ratio = Math.max(
      0.85,
      Math.min(1.35, (w.setup?.fuel || 0) / (w.setup?.laps || schedule.laps)),
    );
    w.eventName = schedule.name;
    w.setup = {
      ...w.setup,
      laps: schedule.laps,
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
  if (!w.weather) w.weather = createWeather(weekendSchedule(w.round).weather);
}
export function startRaceWeather(w) {
  if (w.raceWeatherReady) return;
  migrateWeekend(w);
  w.weather.elapsed = 0;
  w.weather.rain = rainAt(w.weather, 0);
  w.raceWeatherReady = true;
}
export const Q_STAGES = [
  { name: "Q1", duration: 18 * 60, keep: 16 },
  { name: "Q2", duration: 15 * 60, keep: 10 },
  { name: "Q3", duration: 13 * 60, keep: 10 },
];
export function tyreAllocation() {
  return ["H", "M", "S", "I", "W"].flatMap((compound) =>
    Array.from(
      { length: { H: 2, M: 3, S: 8, I: 5, W: 2 }[compound] },
      (_, i) => ({
        id: compound + (i + 1),
        compound,
        wear: 0,
        distance: 0,
        used: false,
        returned:
          compound === "H"
            ? i === 1
            : compound === "M"
              ? i === 2
              : compound === "S"
                ? i >= 4
                : false,
        reserved: compound === "S" && i === 3,
      }),
    ),
  );
}
export function selectableSets(inventory, phase, currentId = null) {
  return inventory.filter(
    (t) =>
      !t.returned &&
      t.wear < 1.05 &&
      t.id !== currentId &&
      (!t.reserved || phase === "Q3" || phase === "R"),
  );
}
export function createWeekend(career, setup) {
  const schedule = weekendSchedule(career.round);
  return {
    version: 1,
    tyreModelVersion: 2,
    season: career.season,
    round: career.round,
    setup: {
      ...setup,
      track:schedule.track,
      difficulty:normalizeDifficulty(setup.difficulty),
      aiSeed:setup.aiSeed ?? Math.floor(Math.random()*2147483646)+1,
      laps: schedule.laps,
      fuel: +(schedule.laps * 1.15).toFixed(1),
      weather: schedule.weather,
    },
    eventName: schedule.name,
    weather: createWeather(schedule.weather),
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
    [8, 12, 14, 16, 18, 20, 24].includes(w.setup?.laps) &&
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
  if (!Number.isFinite(lap) || lap <= 0) return;
  w.attempts ||= {};w.attempts[id]=(w.attempts[id] || 0)+1;
  const row = w.results.find((r) => r.id === id);
  if (!row) w.results.push({ id, time: lap, at });
  else if (lap < row.time) {
    row.time = lap;
    row.at = at;
  }
}
export function pendingFirstRuns(w) {
  return w.active.filter(id=>id!==21 && !(w.attempts?.[id]>0 || w.results.some(r=>r.id===id)));
}
export function qualifyingReady(w) {
  return pendingFirstRuns(w).length===0 && (w.attempts?.[21]>0 || w.results.some(r=>r.id===21));
}
export function stageOrder(w) {
  return [...w.active].sort((a, b) => {
    const x = w.results.find((r) => r.id === a),
      y = w.results.find((r) => r.id === b);
    if (x && y) return x.time - y.time || x.at - y.at;
    if (x) return -1;
    if (y) return 1;
    return w.active.indexOf(a) - w.active.indexOf(b);
  });
}
function aiTime(car, set, w) {
  const variation =
    ((car.id * 17 + w.round * 13 + w.sessions.length * 7) % 23) / 100;
  return (
    (26 /
      ((car.pace || 1) *
        Math.sqrt(
          TYRES[set.compound].grip *
            tyreWeatherGrip(set.compound, w.weather?.wetness || 0),
        ))) *
      (1 + set.wear * 0.11) +
    variation
  );
}
export function finishQualifyingStage(w, upgrades, profile) {
  if (w.phase === "R") return;
  const stage = Q_STAGES.find((q) => q.name === w.phase);
  const model = new Race(w.setup, upgrades, "career", profile);
  for (const id of w.active) {
    if (id === 21 || w.results.some((r) => r.id === id)) continue;
    const car = model.cars[id],
      inv = w.inventories[id];
    for (let run = 0; run < 2; run++) {
      const sets = selectableSets(inv, w.phase);
      const set = sets.sort(
        (a, b) =>
          (a.compound ===
          ((w.weather?.wetness || 0) > 0.17
            ? recommendedTyre(w.weather.wetness)
            : "S")
            ? 0
            : 1) -
            (b.compound ===
            ((w.weather?.wetness || 0) > 0.17
              ? recommendedTyre(w.weather.wetness)
              : "S")
              ? 0
              : 1) || a.wear - b.wear,
      )[0];
      if (!set) continue;
      recordLap(w, id, aiTime(car, set, w), run * 100 + id);
      set.used = true;
      set.distance += TRACK.length * 3;
      set.wear = clamp(set.wear + 2.15 / TYRES[set.compound].life, 0, 1.12);
    }
  }
  const order = stageOrder(w);
  w.sessions.push({
    name: w.phase,
    order: [...order],
    results: w.results.map((r) => ({ ...r })),
  });
  if (w.phase === "Q3") {
    w.grid = [...order, ...w.grid];
    for (const id of w.active) {
      const reserved = w.inventories[id].find((t) => t.reserved);
      if (reserved) reserved.returned = true;
    }
    w.phase = "R";
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
}
export function finishRemainingQualifying(w, upgrades, profile) {
  while (w.phase !== "R") finishQualifyingStage(w, upgrades, profile);
}
export function prepareRace(r, w, startId) {
  if (w.phase !== "R" || w.grid.length !== 22)
    throw Error("Qualifying must be completed first");
  const start = selectableSets(w.inventories[21], "R").find(
    (t) => t.id === startId,
  );
  if (!start) throw Error("Starting tyre set unavailable");
  r.weekend = w;
  r.setup = { ...w.setup };
  r.laps = w.setup.laps;
  migrateWeekend(w);
  startRaceWeather(w);
  r.weather = w.weather;
  for (const [position, id] of w.grid.entries()) {
    const c = r.cars.find((c) => c.id === id);
    c.gridPosition = position + 1;
    c.s = -(Math.floor(position / 2) * 38 + 25);
    c.offset = position % 2 === 0 ? -22 : 22;
    const p = sample(c.s);
    c.x = p.x - Math.sin(p.angle) * c.offset;
    c.y = p.y + Math.cos(p.angle) * c.offset;
    c.angle = p.angle;
    c.fuel = c.player ? w.setup.fuel : w.setup.laps * 1.1 + 0.9;
    c.tyreInventory = w.inventories[id];
    c.tyrePhase = "R";
    const set =
      id === 21
        ? start
        : selectableSets(c.tyreInventory, "R").sort(
            (a, b) =>
              (a.compound === recommendedTyre(w.weather.wetness) ? 0 : 1) -
                (b.compound === recommendedTyre(w.weather.wetness) ? 0 : 1) ||
              a.wear - b.wear,
          )[0];
    c.used = new Set();
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
export const getQualifyingFuel=()=>+( ((3 + (PIT_LANE.length -
  (TRACK.length - TRACK.pitEntry + TRACK.pitExit)) / TRACK.length) *
  (0.85 + 0.25 * 1.18)) + 0.06 ).toFixed(2);
export const QUALIFYING_FUEL=getQualifyingFuel();
export class QualifyingRun extends Race {
  constructor(w, setId, upgrades, profile) {
    selectTrack(w.setup.track);
    super({ ...w.setup, laps: 10000, fuel: getQualifyingFuel() }, upgrades, "career", profile);
    const selected = selectableSets(w.inventories[21], w.phase).find(t => t.id === setId);
    if (!selected) throw Error("Select an available tyre set");
    this.qualifying = true;
    this.profile=profile;
    this.timeScale=1;
    migrateWeekend(w);
    this.weather = w.weather;
    this.weekend = w;
    this.stage = Q_STAGES.find(q => q.name === w.phase);
    this.countdown = 0;
    this.pitLimiter = true;
    this.stageStart = w.elapsed;
    this.cars = this.cars.filter(c => w.active.includes(c.id));
    w.runInProgress = true;
    w.runCount++;
    for (const c of this.cars) {
      c.tyreInventory = w.inventories[c.id];
      c.tyrePhase = w.phase;
      const set = c.player ? selected : selectableSets(c.tyreInventory, w.phase)
        .sort((a,b) => (a.compound === (this.weather.wetness > .17 ? recommendedTyre(this.weather.wetness) : "S") ? 0 : 1) -
          (b.compound === (this.weather.wetness > .17 ? recommendedTyre(this.weather.wetness) : "S") ? 0 : 1) || a.wear-b.wear)[0];
      if (set) fitSet(c,set);
      c.qualifyingRun = true;
      c.fuel = getQualifyingFuel();
      c.qLaps = 0;
      c.qStart = null;
      c.qInvalid = false;
      c.qState = "garage";
      c.garage = true;
      c.speed = 0;
      c.qReleaseAt = this.time + this.releaseDelay(c);
      const distance = this.pitBoxForCar(c);
      c.pit = { distance, boxDistance: distance, startS: TRACK.pitEntry,
        stage: "exit", serviced: true, entryOffset: 0, timer: 0,
        nextSet: set, nextTyre: c.tyre };
      const loc = samplePit(distance);
      c.s = TRACK.pitEntry + loc.progress;
      const bay = c.player ? 26 : (c.id % 2 ? 45 : 26);
      c.x = loc.x - Math.sin(loc.angle)*bay;
      c.y = loc.y + Math.cos(loc.angle)*bay;
      c.angle = loc.angle;
      c.offset = 0;
    }
    this.nextSetId = selected.id;
    this.nextTyre = selected.compound;
    this.say(this.stage.name + " · press W / ↑ to leave. Out lap → timed lap → in lap. Same tyres by default.");
  }
  releaseDelay(c) {
    // Individual, varied departure times; another delay follows each serviced run.
    return 5 + Math.random()*65 + c.id*.4;
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
    return stageOrder(this.weekend).map(id => this.cars.find(c => c.id === id)).filter(Boolean);
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
    p.serviceDuration=set===c.tyreSet ? 2.3 : tyreServiceTime(c.upgrades.crew,this.pitRandom || Math.random);
    p.timer=Math.max(p.timer || 0,p.serviceDuration);
    c.qNeedsRelease=true;
    this.say("Tyres selected. Minimum service wait, then press W / ↑ when ready to leave.");
    return true;
  }
  cycleTimeScale() {
    const speeds=[1,2,4,8];this.timeScale=speeds[(speeds.indexOf(this.timeScale)+1)%speeds.length];return this.timeScale;
  }
  canEndSession() { return qualifyingReady(this.weekend); }
  sessionAction() {
    const waiting=pendingFirstRuns(this.weekend).length;
    if(waiting) return `Waiting for ${waiting} opponent${waiting===1 ? "" : "s"} to complete a first run`;
    if(!this.canEndSession())return "Complete your first timed lap before ending the session";
    const rank=stageOrder(this.weekend).indexOf(21)+1;
    const timed=this.weekend.results.some(r=>r.id===21);
    return this.stage.name!=="Q3" && timed && rank<=this.stage.keep
      ? "Move to " + (this.stage.name==="Q1" ? "Q2" : "Q3")
      : "End qualifying in P"+rank;
  }
  endSession() {
    if (this.sessionEnded || !this.canEndSession()) return null;
    this.sessionEnded=true;this.finishingSession=true;
    // Withdraw the player; fast-forward the remaining AI outings before the cutoff is decided.
    this.player.garage=true;this.player.speed=0;
    this.player.qState="garage";this.player.pit=null;
    // Simulate the rest of the session with repeated AI outings, fresh choices and weather.
    for(let i=0;i<60*(this.stage.duration+90) && !this.done;i++)this.step(1/60,{});
    this.endRun();
    const rank=stageOrder(this.weekend).indexOf(21)+1;
    finishQualifyingStage(this.weekend,this.player.upgrades,this.profile);
    const through=this.weekend.active.includes(21) && this.weekend.phase!=="R";
    if(!through) finishRemainingQualifying(this.weekend,this.player.upgrades,this.profile);
    return {through,position:rank,phase:this.weekend.phase};
  }
  endRun() {
    if (this.done) return;
    this.done = true;
    this.weekend.elapsed = Math.min(this.stage.duration,this.stageStart+this.time);
    this.weekend.runInProgress = false;
    this.result = { qualifying:true };
  }
  crossLine(c) {
    if (c.qState === "out" && this.weekend.elapsed < this.stage.duration) {
      c.qState = "timed";
      c.qStart = this.time;
      c.qInvalid = false;
    } else if (c.qState === "timed") {
      const lap = this.time-c.qStart;
      c.lastLap = lap;
      c.qLaps = 1;
      if (!c.qInvalid) {
        c.bestLap = Math.min(c.bestLap,lap);
        recordLap(this.weekend,c.id,lap,this.stageStart+this.time);
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
    if(this.done) return;
    dt=Math.min(dt,.05);
    capturePoses(this.cars);
    this.time+=dt;
    advanceWeather(this.weather,dt);
    this.weekend.elapsed=Math.min(this.stage.duration,this.stageStart+this.time);
    this.traffic=this.cars.map(c=>({id:c.id,s:c.s,speed:c.speed,offset:c.offset,pit:c.pit,
      garage:c.garage,finished:c.finished,dnf:c.dnf}));
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
          c.fuel=getQualifyingFuel();
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
            this.say("Service complete. Choose tyres here, then press W / ↑ to leave when ready.");
          }
        }
      } else if(c.player) {
        if(c.qState==="in") this.pitRequested=true;
        this.stepPlayer(c,dt,input);
      }
      else {
        super.stepAI(c,dt);
      }
      if(!c.pit && Math.floor(c.s/TRACK.length)>Math.floor(old/TRACK.length)) this.crossLine(c);
      if(c.player && c.qState==="timed") {
        const p=sample(c.s);
        if(Math.hypot(c.x-p.x,c.y-p.y)>TRACK.width/2+8) c.qInvalid=true;
      }
      if(!c.pit && c.fuel<=0 && c.speed<4) {
        c.garage=true;
        c.qState="stranded";
        if(c.player) { this.say("Out of fuel. Return to the garage to prepare another outing."); this.endRun(); }
      }
    }
    this.collisions();
    if((this.weekend.elapsed>=this.stage.duration && this.cars.every(c=>c.garage)) ||
      this.stageStart+this.time>this.stage.duration+90) this.endRun();
    this.skids=this.skids.filter(s=>this.time-s.t<16);
  }
}

export function qualifyingProgress(w, playerId=21) {
  const stage=Q_STAGES.find(q=>q.name===w.phase);
  if(!stage) return null;
  const order=stageOrder(w), rank=order.indexOf(playerId)+1;
  const cutoffId=order[w.phase==='Q3' ? 0 : stage.keep-1], cutoff=w.results.find(r=>r.id===cutoffId);
  const player=w.results.find(r=>r.id===playerId);
  const rival=w.results.find(r=>r.id===order[w.phase==='Q3' ? 0 : rank<=stage.keep ? stage.keep : stage.keep-1]);
  return {keep:stage.keep,rank,cutoffId,cutoffTime:cutoff?.time??null,
    playerTime:player?.time??null,through:!!player && rank<=stage.keep,
    margin:player && rival ? player.time-rival.time : null,
    final:w.phase==='Q3'};
}
export function qualifyingStatus(car) {
  if(car.garage || car.pit) return 'PITS';
  return {out:'OUT LAP',timed:'TIMED LAP',in:'IN LAP',stranded:'STOPPED'}[car.qState] || 'PITS';
}
