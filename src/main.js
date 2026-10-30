import {currentLapTime} from "./sectors.js";
import {raceTimingWindow} from "./timing.js";
import {speedValue,speedUnitLabel,formatSpeed,speedText} from "./units.js";
import {choiceTrigger,bindChoicePicker} from "./choice-picker.js";
import {PACE_MODES,paceMode,stepPaceMode,fuelPerLap,stintLaps} from "./performance.js";
import {QUICK_DISTANCES,quickRaceFormat,raceRuleText,racePoints} from "./race-rules.js";
import {SEASON_LENGTH} from "./calendar.js";
import {sponsorOffers} from "./sponsors.js";
import {AERO_PACKAGES,aeroUnlocked,aeroPackageSummary,upgradeDetails,level,fuelMultiplier,sponsorPayout,setAeroPackage,developTeams,developmentSnapshot} from "./development.js";
import {developmentBench,upgradePreview} from "./development-preview.js";
import {TouchControls,LandscapeGate,stickSteering,mobileLessonText} from "./mobile.js";
import {WHEELS,THERMAL,thermalWear,temperatureStatus,temperatureColour} from "./tyre-temperature.js";
import {RaceSchool,SCHOOL_INTRO,loadSchool} from "./school.js";
import {circuitThumbnail} from "./track-picker.js";
import {engineSoundFrame} from "./sound.js";
import {
  Race,
  DIFFICULTIES,
  normalizeDifficulty,
  TRACK,
  CIRCUITS,
  circuitById,
  selectTrack,
  TYRES,
  estimatedTyreLife,
  TEAMS,
  SPONSORS,
  UPGRADES,
  newCareer,
  loadCareer,
  buyUpgrade,
  upgradeCost,
  settleCareer,
  clamp,
  targetSpeed,
  tyreRuleMet,
  PIT_LANE,
  raceProgress,
  liveInterval,
} from "./core.js";
import {
  qualifyingStage,
  qualifyingWeatherDuration,
  beginQualifying,
  pendingFirstRuns,
  qualifyingReady,
  getQualifyingFuel,
  qualifyingProgress,
  qualifyingTimingWindow,
  qualifyingClassification,
  restoreQualifyingGrid,
  qualifyingStatus,
  selectableSets,
  ensureWeekend,
  validWeekend,
  QualifyingRun,
  nextQualifyingSession,
  resumeQualifyingSession,
  finishQualifyingStage,
  finishRemainingQualifyingAsync,
  prepareRace,
  stageOrder,
  weekendSchedule,careerSchedule,yieldSimulation,
  migrateWeekend,
  startRaceWeather,
} from "./weekend.js";
import { WEATHER_OPTIONS, createWeather, raceWeatherDuration, forecast, recommendedTyre, rainAt, weatherTimeline, raceForecast, tyreWetnessRange } from "./weather.js";
import { Renderer } from "./render.js";
const app = document.querySelector("#app"),
  renderer = new Renderer(document.querySelector("#world"));
let career = loadCareer(localStorage),
  race = null,
  screen = "quick",
  paused = false,
  help = false,
  overview = false,
  saveWarning = "",
  notice = "",
  settlement = null;
let setup = { track:"northline", laps: 16, startingPosition: 22, tyre: "M", fuel: 18.5, weather: "dynamic" },
  keys = new Set(),
  touch = { steer: 0, throttle: false, brake: false },
  last = performance.now(),
  accumulator = 0,
  hudTimer = 0,
  audio = null,
  muted = false;
let settings={speedUnit:"kph",autoPitLimiter:true,difficulty:"normal",tyreTemperature:true,mobileSteering:"stick",steeringSensitivity:1};
try {
 const saved=JSON.parse(localStorage.getItem("v10.settings") || "{}");
 settings.speedUnit=saved.speedUnit==="mph" ? "mph" : "kph";
 settings.autoPitLimiter=saved.autoPitLimiter !== false;
 settings.difficulty=normalizeDifficulty(saved.difficulty);
 settings.tyreTemperature=saved.tyreTemperature!==false;
 settings.mobileSteering=saved.mobileSteering==="arrows" ? "arrows" : "stick";
 settings.steeringSensitivity=Math.max(.6,Math.min(1.5,Number(saved.steeringSensitivity)||1));
} catch {}
renderer.speedUnit=settings.speedUnit;
if(career.weekend?.setup)career.weekend.setup.tyreTemperatureEnabled=settings.tyreTemperature;
let mobileInput=window.matchMedia("(pointer: coarse)").matches;
const mobileControls=new TouchControls(),landscapeGate=new LandscapeGate();
document.body.classList.toggle("mobile-game",mobileInput);renderer.resize();
let school=null;
let quickSetup = { ...setup },
  careerSetup = { ...setup };
const money = (n) => "£" + n.toLocaleString("en-GB");
const time = (n) =>
  Number.isFinite(n)
    ? `${Math.floor(n / 60)}:${(n % 60).toFixed(2).padStart(5, "0")}`
    : "—";
const escapeHTML = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const pickerOptions={
  "speed-units":[{value:"kph",label:"km/h",description:"Kilometres per hour"},{value:"mph",label:"mph",description:"Miles per hour"}],
  laps:QUICK_DISTANCES.map(laps=>({value:laps,label:`${laps} laps`,detail:laps===12 ? "Sprint" : laps===40 ? "Endurance Grand Prix" : "Grand Prix",description: laps===12 ? "Short race · one compound allowed." : laps===24 ? "Career Grand Prix distance · two dry compounds." : "Plan your stops · two dry compounds in dry conditions."})),
  "starting-position":Array.from({length:22},(_,i)=>({value:i+1,label:`P${i+1}`,description:i===0 ? "Pole position" : i===21 ? "Back of grid" : ""})),
  "weather-choice":WEATHER_OPTIONS.map(option=>({value:option.id,label:option.name,description:option.description})),
  "ai-difficulty":Object.entries(DIFFICULTIES).map(([id,d])=>({value:id,label:d.name,detail:d.prizeBonus ? `+${Math.round(d.prizeBonus*100)}% career race prize` : "",description:{easy:"More forgiving pace and earlier braking.",normal:"Balanced pace and a competitive field.",hard:"Faster pace and later braking.",expert:"Fastest pace; closer to the car’s limits."}[id]})),
  "mobile-steering":[{value:"stick",label:"Thumbstick",description:"Drag to steer. Release to centre."},{value:"arrows",label:"Left / right arrows",description:"Hold an arrow to steer in that direction."}],
};
const selector=(id,label,value,describedBy="")=>choiceTrigger({id,label,value,options:pickerOptions[id],describedBy});
function refreshSetup(){
  const top=app.querySelector(".scroll")?.scrollTop || 0;
  menu();
  const scroller=app.querySelector(".scroll");if(scroller)scroller.scrollTop=top;
}
let draftTeam = 10;
let selectedWeekendSet = null,
  weekendSaveClock = 0;
const el = (id) => document.getElementById(id);
function save() {
  if(school){school.save(localStorage);return;}
  try {
    if(career.weekend?.setup.aeroSpec)career.aeroSpec=career.weekend.setup.aeroSpec;
    localStorage.setItem("v10-career-v1", JSON.stringify(career));
    saveWarning = "";
  } catch {
    saveWarning =
      "Storage unavailable. Career progress will only last for this session.";
  }
}
function compounds(selected, prefix) {
  return Object.entries(TYRES)
    .map(
      ([k, t]) =>
        `<button class="compound ${selected === k ? "active" : ""}" data-${prefix}="${k}" style="--tyre:${t.color}" aria-pressed="${selected === k}"><i class="tyre-dot"></i>${k}</button>`,
    )
    .join("");
}
const wetnessBands=Object.fromEntries(Object.keys(TYRES).map(k=>[k,tyreWetnessRange(k,TYRES)]));
function wetnessBand(compound,water=null,name=true){
 const band=wetnessBands[compound],percent=water===null?null:Math.round(water*100);
 return `<div class="wetness-band" style="--tyre:${TYRES[compound].color}" aria-label="${TYRES[compound].name}: suggested ${band.min} to ${band.max}% track wetness${percent===null?"":", currently "+percent+"%"}"><span>${name ? TYRES[compound].name : "Suggested range"} <b>${band.min}–${band.max}% wet</b></span><div class="wetness-scale"><i style="left:${band.min}%;width:${band.max-band.min}%"></i>${percent===null?"":`<em style="left:${Math.min(99,percent)}%"></em>`}</div></div>`;
}
function wetnessGuide(water=null){return `<div class="wetness-guide"><div class="tyre-life-heading"><b>TRACK WETNESS RANGE</b><span>${water===null?"Dry 0% → standing water 100%":"Now "+Math.round(water*100)+"% wet"}</span></div>${Object.keys(TYRES).map(k=>wetnessBand(k,water)).join("")}</div>`;}
function tyreLifeIndicator(selected={compound:setup.tyre,wear:0}) {
  const upgrades=screen==="career" ? career.upgrades : {};
  const remaining=estimatedTyreLife(selected.compound,{wear:selected.wear,upgrades});
  return `<section class="tyre-life" aria-label="Estimated stint life"><div class="tyre-life-heading"><b>ESTIMATED STINT LIFE</b><span>Balanced pace · suitable conditions</span></div><div class="tyre-life-grid">${["S","M","H","I","W"].map(compound=>`<div style="--tyre:${TYRES[compound].color}"><i class="tyre-dot"></i><span>${TYRES[compound].name}</span><b>≈ ${estimatedTyreLife(compound,{upgrades}).toFixed(1).replace(/\.0$/,"")} laps</b></div>`).join("")}</div><p class="tyre-life-remaining">${selected.id ? selected.id+" · " : ""}${TYRES[selected.compound].name} selected <strong>≈ ${remaining.toFixed(1)} laps remaining</strong></p>${wetnessGuide(career.weekend && screen==="career" ? career.weekend.weather.wetness : null)}</section>`;
}
function header() {
  return `<header class="topbar"><div class="brand">V10<span>GRAND PRIX</span></div><div class="version"><i class="dot"></i> VERSION 1.10.0</div></header>`;
}
function tabs() {
  return `<div class="tabs"><button class="tab ${screen === "quick" ? "active" : ""}" data-screen="quick">Quick race</button><button class="tab ${screen === "career" ? "active" : ""}" data-screen="career">Career garage</button><button class="tab" data-action="school">Race School</button><button class="tab" data-action="help">How to drive ↗</button><button class="tab" data-action="settings">Settings</button></div>`;
}
function quickWeatherDescription() {
  setup.weatherSeed ??= Math.floor(Math.random()*4294967296);
  const preview=createWeather(setup.weather,{seed:setup.weatherSeed,duration:raceWeatherDuration(setup.laps,TRACK.length)});
  const condition=preview.rain>.6 ? "Heavy rain" : preview.rain>.05 ? "Light rain" : "Dry";
  return `Start: ${condition} · ${Math.round(preview.wetness*100)}% track wetness. ${WEATHER_OPTIONS.find(option=>option.id===setup.weather)?.description || ""}`;
}
function startingAeroButton(spec) {
  const unlocked=aeroUnlocked(screen==="career" ? career.weekend?.setup.playerUpgrades || career.upgrades : {});
  if(!unlocked)return `<div class="field weather-choice"><span class="field-label">Starting aero package</span><div class="fixed-race-distance"><strong>Balanced · standard setup</strong><span>${screen==="career" ? "Buy Aerodynamics level 1 to unlock package selection." : "Standard car · no aero package bonus or penalty."}</span></div></div>`;
  return `<div class="field weather-choice"><span class="field-label">Starting aero package</span><button class="circuit-picker-trigger" data-action="starting-aero" aria-haspopup="dialog"><span><b data-starting-aero-name>${AERO_PACKAGES[spec || "balanced"].name}</b><small>Choose your setup · free before the start</small></span><span aria-hidden="true">↗</span></button></div>`;
}
function showStartingAeroPicker() {
  if(el("aero-picker"))return;
  const weekend=screen==="career" ? career.weekend : null;
  if(screen!=="career" || weekend?.phase!=="R" || !aeroUnlocked(weekend.setup.playerUpgrades || career.upgrades))return;
  let selected=weekend.setup.aeroSpec || "balanced";
  const trigger=document.activeElement,backdrop=document.createElement("div");backdrop.className="modal-backdrop";backdrop.id="aero-picker";
  backdrop.innerHTML=`<section class="modal aero-picker-modal" role="dialog" aria-modal="true" aria-labelledby="starting-aero-title"><div class="track-picker-heading"><div><div class="eyebrow">RACE PREPARATION</div><h2 id="starting-aero-title">Starting aero package</h2></div><button class="ghost" data-close-aero aria-label="Close aero selector">×</button></div><p class="hint">Free to change before the start. Changes during qualifying or the race add 10 seconds of pit service.</p><div class="aero-packages">${Object.entries(AERO_PACKAGES).map(([spec,pack])=>`<button class="aero-choice" data-choose-aero="${spec}"><b>${pack.name}</b><span>${pack.desc}</span><small>${aeroPackageSummary(spec)}</small></button>`).join("")}</div><button class="primary" id="confirm-starting-aero">CONFIRM AERO →</button></section>`;
  const close=openStrategyPicker(backdrop,race,trigger);
  const refresh=()=>backdrop.querySelectorAll("[data-choose-aero]").forEach(button=>{const active=button.dataset.chooseAero===selected;button.classList.toggle("selected",active);button.setAttribute("aria-pressed",active);});
  backdrop.querySelectorAll("[data-choose-aero]").forEach(button=>button.onclick=()=>{selected=button.dataset.chooseAero;refresh();});
  backdrop.querySelector("[data-close-aero]").onclick=close;backdrop.onclick=event=>{if(event.target===backdrop)close();};
  el("confirm-starting-aero").onclick=()=>{
    if(!setAeroPackage(career,selected))return;save();
    close();app.querySelectorAll("[data-starting-aero-name]").forEach(label=>label.textContent=AERO_PACKAGES[selected].name);
    const garageSummary=app.querySelector('[data-garage-section="aero"] small');if(garageSummary)garageSummary.textContent=AERO_PACKAGES[selected].name+" · Choose your starting setup";
  };
  refresh();backdrop.querySelector('[aria-pressed="true"]').focus();
}
function setupCard() {
  const scheduled = screen === "career" ? careerSchedule(career) : null;
  if (scheduled) {
    const key = career.season + ":" + career.round;
    if (setup.roundKey !== key) {
      setup.fuel = +(scheduled.laps * 1.15).toFixed(1);
      setup.roundKey = key;
      setup.weatherSeed=Math.floor(Math.random()*4294967296);
    }
    setup.track=scheduled.track;
    setup.laps = scheduled.laps;
    setup.raceFormat=scheduled.raceFormat || "grandPrix";
    setup.weather = scheduled.weather;
    if (setup.fuel < setup.laps * 0.85 || setup.fuel > setup.laps * 1.35)
      setup.fuel = +(setup.laps * 1.15).toFixed(1);
  }
  return `<section class="race-card"><div class="track-header"><h3>${TRACK.name}</h3><span class="badge">${scheduled ? scheduled.name : "DYNAMIC WEATHER"}</span></div><div class="specs"><span>GRID<b>22 cars</b></span><span>CHARACTER<b>${TRACK.character}</b></span><span>LAP LENGTH<b>${(TRACK.length/1000).toFixed(2)} km</b></span></div>${!scheduled ? `<div class="field weather-choice"><span class="field-label">Circuit</span><button class="circuit-picker-trigger" id="track-choice" aria-label="Choose circuit: ${TRACK.name}" aria-haspopup="dialog"><span><b>${TRACK.name}</b><small>Choose from 12 circuits</small></span><span aria-hidden="true">▦</span></button></div>` : ""}<div class="form-row"><div class="field">${scheduled ? `<span class="field-label">Race distance</span><div class="fixed-race-distance"><strong>${scheduled.laps} laps</strong><span>Weekend distance · ${DIFFICULTIES[settings.difficulty].name} AI</span></div>` : `<label for="laps">Race distance</label>${selector("laps","Race distance",setup.laps)}<label for="starting-position" class="starting-position-label">Starting position</label>${selector("starting-position","Starting position",setup.startingPosition ?? 22)}`}</div><div class="field"><label>Starting compound</label><div class="compound-row">${compounds(setup.tyre, "start-tyre")}</div></div></div>${!scheduled ? `<div class="field weather-choice"><label for="weather-choice">Weather</label>${selector("weather-choice","Weather",setup.weather,"weather-description")}<p class="hint" id="weather-description">${quickWeatherDescription()}</p></div>` : ""}${!scheduled ? startingAeroButton(setup.aeroSpec) : ""}${scheduled ? `<div class="fuel-row"><span>Qualifying fuel</span><b>${getQualifyingFuel(career.upgrades).toFixed(2)} laps · fixed</b></div><p class="hint">About three timed laps per session. Each outing has an out lap, a timed lap and an in lap; fuel is fixed for that outing.</p>` : `<div class="fuel-row"><span>Starting fuel <b id="fuel-value">${setup.fuel.toFixed(1)} laps</b></span><span id="fuel-risk"></span></div><input id="fuel" type="range" min="${setup.laps * 0.85}" max="${setup.laps * 1.35}" step="0.1" value="${setup.fuel}" aria-label="Starting fuel in laps"><p class="hint">Less fuel means less weight. Balanced driving uses ~1.10 fuel laps per lap; conserve to stretch it. No refuelling.</p>`}${tyreLifeIndicator()}${scheduled ? '<button class="ghost race-forecast-trigger" data-action="qualifying-forecast" aria-haspopup="dialog">Qualifying weather forecast ↗</button>' : ""}<button class="primary" data-action="start"><span>${screen === "career" ? `START QUALIFYING · ROUND ${career.round}` : "TAKE TO THE GRID"}</span><span>→</span></button></section>`;
}
function showTrackPicker() {
  if(el("track-picker-modal")) return;
  const backdrop=document.createElement("div");
  backdrop.className="modal-backdrop track-picker-backdrop";backdrop.id="track-picker-modal";
  backdrop.innerHTML=`<section class="modal track-picker-modal" role="dialog" aria-modal="true" aria-labelledby="track-picker-title"><div class="track-picker-heading"><div><div class="eyebrow">12 CIRCUITS · YOUR NEXT CHALLENGE</div><h2 id="track-picker-title">Choose your track</h2></div><button class="ghost" data-close-tracks aria-label="Close track selector">×</button></div><div class="track-picker-grid">${CIRCUITS.map(t=>{
    const thumbnail=circuitThumbnail(t),selected=t.id===TRACK.id;
    return `<button class="track-card ${selected ? "selected" : ""}" data-choose-track="${t.id}" aria-pressed="${selected}" aria-label="${t.name}, ${(thumbnail.length/1000).toFixed(2)} kilometres"><div class="track-card-image">${thumbnail.svg}${selected ? '<span class="track-selected">✓ SELECTED</span>' : ""}</div><div class="track-card-info"><div><b>${t.name}</b><span>${(thumbnail.length/1000).toFixed(2)} km</span></div><small>${t.country} · ${t.character}</small></div></button>`;
  }).join("")}</div></section>`;
  app.appendChild(backdrop);
  const close=()=>{backdrop.remove();el("track-choice")?.focus();};
  backdrop.querySelector("[data-close-tracks]").onclick=close;
  backdrop.onclick=e=>{if(e.target===backdrop)close();};
  backdrop.querySelectorAll("[data-choose-track]").forEach(button=>button.onclick=()=>{
    const scroll=app.querySelector(".scroll")?.scrollTop || 0;
    setup.track=button.dataset.chooseTrack;backdrop.remove();menu();
    app.querySelector(".scroll").scrollTop=scroll;el("track-choice")?.focus();
  });
  backdrop.addEventListener("keydown",e=>{
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close();}
    if(e.key==="Tab"){
      const buttons=[...backdrop.querySelectorAll("button")],first=buttons[0],last=buttons.at(-1);
      if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  backdrop.querySelector(".track-card.selected")?.focus();
}
function footer() {
  if(mobileInput)return `<footer class="menu-footer"><span>GAS / BRAKE · ${settings.mobileSteering==="arrows" ? "Arrow steering" : "Thumbstick steering"} · Tap Pit or Choose tyre set</span><span class="muted">Race in landscape. Change controls in Settings.</span></footer>`;
  return `<footer class="menu-footer"><div class="keycaps"><span><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> Drive</span><span><kbd>B</kbd> Box</span><span><kbd>L</kbd> Limiter</span><span><kbd>T</kbd> / <kbd>1–5</kbd> Next tyre</span><span><kbd>F</kbd> Pace ←</span><span><kbd>G</kbd> Pace →</span><span><kbd>R</kbd> Reverse in pit</span><span><kbd>P</kbd> / <kbd>Esc</kbd> Pause</span></div><span class="muted">V10 power. Every decision counts.</span></footer>`;
}
function menu() {
  el("garage-section-modal")?.dispatchEvent(new Event("garage-dispose"));
  school=null;
  race = null;
  paused = false;
  overview = false;
  settlement = null;
  if(screen==="career") migrateWeekend(career.weekend);
  selectTrack(screen==="career" ? career.weekend?.setup.track || careerSchedule(career).track : setup.track);
  app.innerHTML =
    header() +
    `<main class="menu-shell scroll">${screen === "quick" ? `<div class="hero"><div class="eyebrow">THE LINE BETWEEN PACE & PATIENCE</div><h1>DRIVE FAST.<br><span style="color:var(--lime)">THINK AHEAD.</span></h1><p>Twenty-two cars. Every corner counts. Find your rhythm, protect your tyres, and make the call that changes your race.</p></div>${tabs()}${setupCard()}<div class="circuit-label"><div class="eyebrow">${TRACK.country.toUpperCase()} · ${(TRACK.length/1000).toFixed(2)} KM</div><div class="display">${TRACK.name.toUpperCase()}</div><p>${TRACK.character}.</p></div>` : careerPage()}${footer()}</main>`;
  bindMenu();
  fuelLabel();
  mountMobileSetupPicker();
  updateMobileSession();
}
function sponsorCard() {
  const chosen=SPONSORS.find(s=>s.id===career.sponsor);
  return chosen ? `<section class="panel signed-sponsor" id="sponsor-panel"><div class="eyebrow">WEEKEND SPONSOR · SIGNED</div><b>${chosen.name} · ${money(sponsorPayout(career.upgrades,chosen.amount))}</b><p>${chosen.desc}${level(career.upgrades,"commercial") ? ` · Includes +${level(career.upgrades,"commercial")*10}% commercial income.` : ""}</p></section>` :
    `<section class="panel" id="sponsor-panel"><div class="panel-heading"><h3>Race sponsor</h3><span class="eyebrow">CHOOSE ONE</span></div><div class="sponsors">${sponsorOffers(career).map(s=>`<button class="sponsor" data-sponsor="${s.id}"><h3>${s.name}</h3><p>${s.desc}</p><b>${money(sponsorPayout(career.upgrades,s.amount))} · ON SUCCESS</b></button>`).join("")}</div><p class="hint">Six offers each weekend · 12 sponsors. Paid only when the condition is met.${level(career.upgrades,"commercial") ? ` Payouts include your +${level(career.upgrades,"commercial")*10}% commercial bonus.` : ""}</p></section>`;
}
function showSettings() {
  const previousPaused=paused;
  if(race) {paused=true;resetDrivingInput();}
  const modal=document.createElement("div");modal.className="modal-backdrop";modal.id="settings-modal";
  modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="eyebrow">RACE SETTINGS</div><h2 id="settings-title">Settings</h2><div class="field"><label for="ai-difficulty">AI difficulty</label>${selector("ai-difficulty","AI difficulty",settings.difficulty)}</div><p class="hint" style="margin:10px 0 20px">Applies to your next quick race or career weekend. An existing weekend keeps its difficulty. Bonuses apply to legal finishes; commercial development increases earned sponsor payouts.</p><div class="field speed-units-field"><label for="speed-units">Speed units</label>${selector("speed-units","Speed units",settings.speedUnit)}</div><label class="setting-choice"><input type="checkbox" id="auto-pit-limiter" ${settings.autoPitLimiter ? "checked" : ""}> Automatic pit stops</label><p class="hint" id="auto-pit-description">Enabled by default: holds ${formatSpeed(80,settings.speedUnit)}, brakes into your box, completes service and drives to pit exit without throttle. Disable this for manual pedals and L limiter control.</p><label class="setting-choice"><input type="checkbox" id="tyre-temperature-setting" ${settings.tyreTemperature ? "checked" : ""}> Tyre temperature simulation</label><p class="hint">Turn off to hold all tyres at ideal temperature and hide the indicator. Wear and weather grip still apply. Applies to all drivers immediately.</p><div class="mobile-settings"><div class="field"><label for="mobile-steering">Mobile steering</label>${selector("mobile-steering","Mobile steering",settings.mobileSteering)}</div><div class="field sensitivity-field"><label for="steering-sensitivity">Thumbstick sensitivity</label><input id="steering-sensitivity" type="range" min=".6" max="1.5" step=".1" value="${settings.steeringSensitivity}"></div><button class="ghost home-screen-help" id="home-screen-help">Play from Home Screen</button></div><button class="primary" id="close-settings">BACK TO GAME</button></section>`;
  app.appendChild(modal);
  bindChoicePicker(el("ai-difficulty"),{title:"AI difficulty",eyebrow:"RACE SETTINGS",options:pickerOptions["ai-difficulty"],onChange:value=>{
    settings.difficulty=normalizeDifficulty(value);
    try {localStorage.setItem("v10.settings",JSON.stringify(settings));} catch {}
  }});
  bindChoicePicker(el("speed-units"),{title:"Speed units",eyebrow:"RACE SETTINGS",options:pickerOptions["speed-units"],onChange:value=>{
    settings.speedUnit=value==="mph" ? "mph" : "kph";renderer.speedUnit=settings.speedUnit;
    try {localStorage.setItem("v10.settings",JSON.stringify(settings));} catch {}
    el("auto-pit-description").textContent=`Enabled by default: holds ${formatSpeed(80,settings.speedUnit)}, brakes into your box, completes service and drives to pit exit without throttle. Disable this for manual pedals and L limiter control.`;
    if(race)updateHUD();
  }});
  if(school)el("auto-pit-limiter").disabled=true;
  el("auto-pit-limiter").onchange=e=>{
    settings.autoPitLimiter=e.target.checked;
    try {localStorage.setItem("v10.settings",JSON.stringify(settings));} catch {}
    if(race) {race.autoPitLimiter=school ? true : settings.autoPitLimiter; if(race.autoPitLimiter) race.pitLimiter=!!race.player.pit;}
  };
  el("tyre-temperature-setting").onchange=e=>{
    settings.tyreTemperature=e.target.checked;
    try {localStorage.setItem("v10.settings",JSON.stringify(settings));} catch {}
    if(career.weekend?.setup)career.weekend.setup.tyreTemperatureEnabled=settings.tyreTemperature;
    if(race){race.setTyreTemperature(settings.tyreTemperature);updateHUD();}
  };
  el("steering-sensitivity").disabled=settings.mobileSteering==="arrows";
  bindChoicePicker(el("mobile-steering"),{title:"Mobile steering",eyebrow:"TOUCH CONTROLS",options:pickerOptions["mobile-steering"],onChange:value=>{settings.mobileSteering=value;el("steering-sensitivity").disabled=settings.mobileSteering==="arrows";saveMobileSettings();if(race)mountMobileControls();}});
  el("steering-sensitivity").oninput=e=>{settings.steeringSensitivity=+e.target.value;saveMobileSettings();resetDrivingInput();};
  el("home-screen-help").onclick=showFullscreenHelp;
  el("close-settings").onclick=()=>{modal.remove();paused=previousPaused;};
}
function careerPage() {
  if (!career.profile) return careerSetupPage();
  if(!career.weekend && developTeams(career))save();
  migrateWeekend(career.weekend);
  if (career.weekend && !validWeekend(career.weekend, career))
    career.weekend = null;
  return `<div class="career-head"><div><div class="eyebrow">BUILD YOUR WAY UP THE GRID</div><h2 style="margin-top:10px">Your career garage</h2></div><div class="wallet"><div class="stat"><span>Budget</span><strong>${money(career.cash)}</strong></div><div class="stat"><span>Career points</span><strong>${career.points}</strong></div></div></div>${tabs()}<button class="ghost career-reset" data-action="reset-career">Reset career</button><div class="notice">${notice || `Season ${career.season}, round ${career.round} of ${SEASON_LENGTH} · ${career.seasonPoints} season points · ${escapeHTML(career.profile.driverName)} · ${TEAMS[career.profile.teamIndex].name} development car`}</div>${garageSections()}<div class="career-layout"><div class="career-left">${career.weekend ? weekendCard() : setupCard()}<section class="panel"><div class="panel-heading"><h3>Recent results</h3><span class="eyebrow">${career.history.length ? "SAVED" : "NEW DRIVER"}</span></div>${
    career.history.length
      ? career.history
          .slice(0, 4)
          .map(
            (h) =>
              `<div class="history-row"><span>S${h.season} · R${h.round}</span><b>${h.dnf ? "DNF" : !h.legal ? "DQ" : "P" + h.position}</b><span>${h.points} pts</span><span>${money(h.prize + h.bonus)}</span></div>`,
          )
          .join("")
      : '<p class="muted">Start near the back in a slower car. Earn race money, meet sponsor conditions and invest in your pace. The 12-round season visits every circuit.</p>'
  }<div class="save-note">Career saves automatically in this browser.</div>${saveWarning ? `<div class="storage-warning">${saveWarning}</div>` : ""}</section></div><div class="career-right">${sponsorCard()}</div></div>`;
}
function garageSections(){
 const installed=Object.values(career.upgrades).reduce((sum,n)=>sum+n,0),locked=!!career.weekend;
 const sections=[
  {id:"development",title:"Car development",summary:`${installed} upgrade ${installed===1 ? "level" : "levels"} · ${locked ? "Weekend locked" : "9 upgrade paths"}`},
  {id:"aero",title:"Aero package",summary:`${AERO_PACKAGES[career.aeroSpec || "balanced"].name} · ${!aeroUnlocked(career.upgrades) ? "Requires Aerodynamics level 1" : locked && career.weekend.phase!=="R" ? "Pit changes · +10s" : "Choose your starting setup"}`},
  {id:"teams",title:"Team development",summary:"11 teams · Budgets & upgrades"},
 ];
 return `<nav class="garage-sections" aria-label="Career management">${sections.map(section=>`<button class="garage-section-choice" data-garage-section="${section.id}" aria-haspopup="dialog"><span><b>${section.title}</b><small>${section.summary}</small></span><span class="garage-section-arrow" aria-hidden="true">↗</span></button>`).join("")}</nav>`;
}
function garageDialogKeys(event,backdrop,close){
 if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();}
 if(event.key==="Tab"){
  const controls=[...backdrop.querySelectorAll('button:not(:disabled),summary,[href],input:not(:disabled),select:not(:disabled),[tabindex]:not([tabindex="-1"])')].filter(node=>node.getClientRects().length),first=controls[0],last=controls.at(-1);
  if(event.shiftKey&&(document.activeElement===first||!controls.includes(document.activeElement))){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&(document.activeElement===last||!controls.includes(document.activeElement))){event.preventDefault();first?.focus();}
 }
}
function showGarageSection(section,{scrollTop=0,focusSelector=null}={}){
 if(el("garage-section-modal"))return;
 const sections={development:{title:"Car development",render:developmentCard},aero:{title:"Aero package",render:aeroCard},teams:{title:"Team development",render:rivalDevelopmentCard}},selected=sections[section];
 if(!selected)return;
 const shell=app.querySelector(".menu-shell"),backdrop=document.createElement("div");
 backdrop.className="modal-backdrop";backdrop.id="garage-section-modal";
 backdrop.innerHTML=`<section class="modal garage-modal" role="dialog" aria-modal="true" aria-labelledby="garage-section-title"><div class="track-picker-heading"><div><div class="eyebrow">YOUR GARAGE · ${money(career.cash)}</div><h2 id="garage-section-title" tabindex="-1">${selected.title}</h2></div><button class="ghost" data-close-garage aria-label="Close ${selected.title}">×</button></div><div class="garage-panel-body">${selected.render()}</div><button class="ghost garage-back" data-close-garage>BACK TO GARAGE</button></section>`;
 app.appendChild(backdrop);shell.inert=true;
 bindUpgradeTooltips(backdrop);
 const close=()=>{backdrop.dispatchEvent(new Event("garage-dispose"));backdrop.remove();shell.inert=false;keys.clear();app.querySelector(`[data-garage-section="${section}"]`)?.focus({preventScroll:true});};
 backdrop.querySelectorAll("[data-close-garage]").forEach(button=>button.onclick=close);
 backdrop.onclick=event=>{if(event.target===backdrop)close();};
 backdrop.addEventListener("keydown",event=>garageDialogKeys(event,backdrop,close));
 backdrop.querySelectorAll("[data-upgrade]").forEach(button=>button.onclick=()=>showUpgradePreview(button.dataset.upgrade));
 backdrop.querySelectorAll("[data-aero-spec]").forEach(button=>button.onclick=()=>{
  if(setAeroPackage(career,button.dataset.aeroSpec))refreshGarageSection("aero",`[data-aero-spec="${button.dataset.aeroSpec}"]`);
 });
 const focus=focusSelector&&backdrop.querySelector(focusSelector);
 (focus&&!focus.disabled ? focus : el("garage-section-title")).focus({preventScroll:true});
 backdrop.querySelector(".garage-modal").scrollTop=scrollTop;
}
function bindUpgradeTooltips(backdrop){
 const buttons=[...backdrop.querySelectorAll("[data-upgrade-info]")];if(!buttons.length)return;
 const tooltip=document.createElement("div");tooltip.id="team-upgrade-tooltip";tooltip.className="team-upgrade-tooltip";tooltip.setAttribute("role","tooltip");tooltip.hidden=true;backdrop.appendChild(tooltip);
 const panel=backdrop.querySelector(".garage-modal");
 let active=null,pinned=false,timer=null;
 const hide=()=>{clearTimeout(timer);tooltip.hidden=true;active?.removeAttribute("aria-describedby");active?.setAttribute("aria-expanded","false");active=null;pinned=false;};
 const position=()=>{
  if(!active)return;
  const anchor=active.getBoundingClientRect(),bounds=panel.getBoundingClientRect(),box=tooltip.getBoundingClientRect();
  if(anchor.bottom<bounds.top||anchor.top>bounds.bottom){hide();return;}
  const left=clamp(anchor.left+anchor.width/2-box.width/2,12,Math.max(12,innerWidth-box.width-12));
  const above=anchor.top-box.height-8,top=above>=12?above:Math.min(anchor.bottom+8,innerHeight-box.height-12);
  tooltip.style.left=left+"px";tooltip.style.top=Math.max(12,top)+"px";
 };
 const show=button=>{
  clearTimeout(timer);if(active!==button){hide();active=button;}
  const info=upgradeDetails(button.dataset.upgradeInfo,+button.dataset.upgradeLevel);
  tooltip.innerHTML=`<b>${escapeHTML(info.title)}</b><p>${escapeHTML(info.description)}</p>`;tooltip.hidden=false;
  button.setAttribute("aria-describedby",tooltip.id);button.setAttribute("aria-expanded","true");position();
 };
 const dismissSoon=()=>{clearTimeout(timer);if(!pinned&&!active?.matches(":focus"))timer=setTimeout(hide,120);};
 for(const button of buttons){
  button.addEventListener("pointerenter",event=>{if(event.pointerType!=="touch")show(button);});
  button.addEventListener("pointerleave",dismissSoon);
  button.addEventListener("focus",()=>show(button));
  button.addEventListener("blur",()=>{if(!button.matches(":hover")&&!pinned){timer=setTimeout(hide,120);}});
  button.onclick=()=>{if(active===button&&pinned)hide();else {show(button);pinned=true;}};
 }
 tooltip.addEventListener("pointerenter",()=>clearTimeout(timer));tooltip.addEventListener("pointerleave",dismissSoon);
 const escape=event=>{if(event.key==="Escape"&&!tooltip.hidden){event.preventDefault();event.stopImmediatePropagation();hide();}};
 backdrop.addEventListener("keydown",escape,true);
 backdrop.addEventListener("pointerdown",event=>{if(active&&!active.contains(event.target)&&!tooltip.contains(event.target))hide();});
 panel.addEventListener("scroll",()=>{if(pinned||active?.matches(":focus"))position();else hide();});window.addEventListener("resize",hide);
 backdrop.addEventListener("garage-dispose",()=>{hide();window.removeEventListener("resize",hide);},{once:true});
}
function refreshGarageSection(section,focusSelector){
 const pageTop=app.querySelector(".menu-shell").scrollTop,panelTop=el("garage-section-modal").querySelector(".garage-modal").scrollTop;
 save();menu();app.querySelector(".menu-shell").scrollTop=pageTop;
 showGarageSection(section,{scrollTop:panelTop,focusSelector});
}
function developmentCard(){
 const bench=developmentBench(career.upgrades,career.aeroSpec),locked=!!career.weekend;
 return `<div class="development-panel"><div class="panel-heading"><span class="eyebrow">${locked ? "LOCKED FOR WEEKEND" : "BUILD YOUR ADVANTAGE"}</span></div><div class="development-stats"><div><span>0–${formatSpeed(250,settings.speedUnit).toUpperCase()}</span><b>${bench.accelerate.toFixed(2)}s</b></div><div><span>MEDIUM LIFE</span><b>≈ ${bench.medium.toFixed(1)} laps</b></div><div><span>FUEL · 24 LAPS</span><b>≈ ${bench.fuel.toFixed(1)}</b></div></div>${["Powertrain","Chassis","Race operations","Team business"].map(group=>`<div class="development-group"><h4>${group}</h4>${Object.entries(UPGRADES).filter(([,u])=>u.group===group).map(([key,u])=>{
  const n=level(career.upgrades,key),max=n>=u.max;
  return `<div class="upgrade"><div class="upgrade-info"><h3>${u.name}</h3><p>${u.desc}</p><div class="levels" aria-label="Level ${n} of ${u.max}">${Array.from({length:u.max},(_,i)=>`<i class="${i<n?"on":""}"></i>`).join("")}<span>${n} / ${u.max}</span></div></div><button class="ghost upgrade-review" data-upgrade="${key}" ${locked || max ? "disabled" : ""} aria-label="${max ? u.name+" fully developed" : "Review "+u.name+", "+money(upgradeCost(career,key))}">${max ? "MAX" : `<span>REVIEW</span><b>${money(upgradeCost(career,key))}</b>`}</button></div>`;
 }).join("")}</div>`).join("")}<p class="hint">Review an upgrade to see its measured effects before buying. Development locks when qualifying starts. Aero changes remain available in the pit box for 10 seconds of extra service.</p></div>`;
}
function aeroCard(){
 const unlocked=aeroUnlocked(career.weekend?.setup.playerUpgrades || career.upgrades),locked=!unlocked || career.weekend && career.weekend.phase!=="R";
 return `<div class="aero-panel"><div class="panel-heading"><span class="eyebrow">${!unlocked ? "REQUIRES AERODYNAMICS LEVEL 1" : locked ? "CHANGE IN PIT BOX · +10s" : "FREE TO SWITCH"}</span></div><p class="hint">${!unlocked ? "Buy Aerodynamics level 1 in Car development to unlock package selection. Your standard Balanced setup has no package bonuses or penalties." : locked ? "Use Choose aero on the track screen. Changing the package adds 10 seconds to pit service." : "All packages are available. Choose before qualifying or the race for a free change."}</p><div class="aero-packages">${Object.entries(AERO_PACKAGES).map(([key,pack])=>{
  const selected=(career.aeroSpec || "balanced")===key;
  return `<button class="aero-choice ${selected?"selected":""}" data-aero-spec="${key}" aria-pressed="${selected}" ${locked ? "disabled" : ""}><b>${pack.name}${selected?" ✓":""}</b><span>${pack.desc}</span><small>${aeroPackageSummary(key)}</small></button>`;
 }).join("")}</div></div>`;
}
function rivalDevelopmentCard(){
 const snapshot=career.weekend?.setup.teamDevelopment || developmentSnapshot(career,careerSchedule(career).track);
 return `<div class="rivals-panel"><p class="hint">Teams fund parts from race and sponsor income. They pay the same prices and use the same upgrade effects. Budgets are per car, averaged across each team's drivers. No free parts or hidden catch-up money. Race results fund development; sponsors add a smaller bonus.</p>${career.teams.map(t=>{
  const yours=t.teamIndex===career.profile.teamIndex,upgrades=yours?career.upgrades:t.upgrades,budget=yours?career.cash:t.budget,count=Object.values(upgrades).reduce((a,b)=>a+b,0),pack=(yours ? career.weekend?.setup.aeroSpec || career.aeroSpec : snapshot.find(x=>x.teamIndex===t.teamIndex)?.aeroSpec) || "balanced";
  const bought=t.history[0]?.purchases || [];
  return `<details class="team-development-row"><summary><b style="--team:${TEAMS[t.teamIndex].color}">${TEAMS[t.teamIndex].name}${yours ? " · YOU" : ""}</b><span>${count} ${count===1?"level":"levels"}</span><small>Available ${money(budget)}</small></summary>${!yours ? `<div class="team-finances"><span>Last race <b>${money(t.lastIncome?.prize || 0)}</b></span><span>Sponsor <b>${money(t.lastIncome?.sponsor || 0)}</b></span><span>Parts bought <b>${money(t.history[0]?.spent || 0)}</b></span><span>Cash remaining <b>${money(budget)}</b></span></div><p class="hint">${t.lastIncome ? escapeHTML(t.lastIncome.contract)+" · earnings averaged per car" : "Opening budget: £7,000 per car"}</p>` : ""}<div class="team-parts">${Object.entries(UPGRADES).filter(([key])=>level(upgrades,key)>0).map(([key,u])=>`<button type="button" class="team-upgrade-info" data-upgrade-info="${key}" data-upgrade-level="${level(upgrades,key)}" aria-expanded="false">${u.name} ${level(upgrades,key)}<span aria-hidden="true">ⓘ</span></button>`).join("") || "Factory specification"}</div><p class="hint">${AERO_PACKAGES[pack]?.name || "Balanced"} package${!yours && bought.length ? " · Latest: "+bought.map(b=>UPGRADES[b.key].name+" "+b.level+" ("+money(b.cost)+")").join(", ") : ""}</p></details>`;
 }).join("")}</div>`;
}
function showUpgradePreview(key){
 if(el("upgrade-preview") || career.weekend || !UPGRADES[key] || level(career.upgrades,key)>=UPGRADES[key].max)return;
 const preview=upgradePreview(career,key,{tyreTemperatureEnabled:settings.tyreTemperature,speedUnit:settings.speedUnit}),cost=upgradeCost(career,key),top=app.querySelector(".menu-shell").scrollTop;
 const explanation={
  tyres:"Life estimates assume Balanced pace and suitable conditions. Heat, sliding and driving style change the actual stint.",
  efficiency:"Fuel estimate assumes 24 Balanced laps. Push mode uses more fuel.",
  crew:"Tyre changes vary within the shown range. Penalties and a busy teammate add time. Preparation helps when tyre temperatures are enabled.",
  engineer:"Advice uses your current fuel, tyre stock, conditions and traffic. Weather windows and rejoin positions are estimates.",
  commercial:"Every successful sponsor payout includes the uplift. Contract conditions still apply.",
 }[key] || `Solo driving estimates on ${TRACK.name}, with Balanced pace, six fuel laps and ideal Medium tyres in the dry. Actual gains depend on your driving and conditions.`;
 const backdrop=document.createElement("div");backdrop.className="modal-backdrop";backdrop.id="upgrade-preview";
 backdrop.innerHTML=`<section class="modal upgrade-preview" role="dialog" aria-modal="true" aria-labelledby="upgrade-preview-title"><div class="eyebrow">DEVELOPMENT · LEVEL ${level(career.upgrades,key)} → ${level(career.upgrades,key)+1}</div><h2 id="upgrade-preview-title">${preview.name}</h2><p class="muted">${UPGRADES[key].desc}</p><div class="preview-column-labels"><span>MEASURE</span><span>CURRENT → UPGRADED</span></div><dl class="upgrade-metrics">${preview.rows.map(row=>`<div><dt>${row.label}</dt><dd><span>${row.before}</span><i aria-hidden="true">→</i><b>${row.after}</b></dd></div>`).join("")}</dl><p class="hint">${explanation}</p>${key==="tyres"&&!settings.tyreTemperature?'<p class="hint">Temperature simulation is off. Longer life and the gentler grip cliff still apply.</p>':""}<div class="preview-budget"><span>Available ${money(career.cash)}</span><b>${money(cost)}</b></div><button class="primary" id="install-upgrade" ${career.cash<cost?"disabled":""}>${career.cash<cost ? "NEED "+money(cost-career.cash)+" MORE" : "INSTALL UPGRADE · "+money(cost)}</button><button class="ghost" id="cancel-upgrade">BACK TO DEVELOPMENT</button></section>`;
 app.appendChild(backdrop);
 const garage=el("garage-section-modal");
 if(garage){garage.inert=true;garage.setAttribute("aria-hidden","true");}
 const close=()=>{backdrop.remove();if(garage){garage.inert=false;garage.removeAttribute("aria-hidden");}app.querySelector(`[data-upgrade="${key}"]`)?.focus({preventScroll:true});};
 el("cancel-upgrade").onclick=close;backdrop.onclick=e=>{if(e.target===backdrop)close();};
 el("install-upgrade").onclick=()=>{
  if(!buyUpgrade(career,key))return;
  notice=UPGRADES[key].name+" "+level(career.upgrades,key)+" installed. Your next weekend uses the new parts.";
  if(garage)refreshGarageSection("development",`[data-upgrade="${key}"]`);
  else {save();menu();app.querySelector(".menu-shell").scrollTop=top;}
 };
 el("upgrade-preview-title").tabIndex=-1;el("upgrade-preview-title").focus();
 backdrop.addEventListener("keydown",event=>garageDialogKeys(event,backdrop,close));
}
function engineerBriefHTML(running){
 const report=running.engineerReport();
 return report.level ? `<section class="engineer-brief"><h3>Engineer briefing · Level ${report.level}</h3><ul>${report.items.map(item=>`<li>${escapeHTML(item)}</li>`).join("")}</ul><p class="hint">Estimates update with your driving, conditions and traffic.</p></section>` : "";
}
function tyreSetLabel(t) {
  return `${t.id} · ${TYRES[t.compound].name} · ${Math.round(Math.max(0, 1 - t.wear) * 100)}% · ${t.used ? "used" : "fresh"}`;
}
function weekendCard() {
  const w = career.weekend;
  if (w.phase === "R") {restoreQualifyingGrid(w);startRaceWeather(w);}
  const phase = w.phase,
    sets = selectableSets(w.inventories[21], phase),
    stage = qualifyingStage(w),
    eliminated = !w.active.includes(21) && phase !== "R";
  if (
    w.selectedPhase !== phase ||
    !sets.some((t) => t.id === selectedWeekendSet)
  ) {
    selectedWeekendSet =
      sets.find((t) => w.selectedPhase === phase && t.id === w.selectedSetId)
        ?.id ||
      sets
        .filter(
          (t) =>
            t.compound ===
            (w.weather.wetness > 0.17
              ? recommendedTyre(w.weather.wetness)
              : phase === "R"
                ? "M"
                : "S"),
        )
        .sort((a, b) => a.wear - b.wear)[0]?.id ||
      sets[0]?.id;
    w.selectedPhase = phase;
    w.selectedSetId = selectedWeekendSet;
  }
  const rows = (phase === "R" ? w.grid : stageOrder(w))
    .map((id, i) => {
      const modelName =
        id === 21
          ? career.profile.driverName
          : TEAMS[
              id === career.profile.teamIndex * 2 + 1 ? 10 : Math.floor(id / 2)
            ].name;
      const classified=phase==="R" ? [...w.sessions].reverse().find(session=>session.order.includes(id)) : null;
      const t = (classified?.results || w.results).find((r) => r.id === id);
      return `<div class="history-row"><b>P${i + 1}</b><span>${escapeHTML(modelName)}</span><span>${classified ? classified.name+" · " : ""}${t ? time(t.time) : "NO TIME"}</span></div>`;
    })
    .join("");
  return `<section class="race-card weekend-card"><div class="track-header"><h3>${phase === "R" ? "Race preparation" : phase + " qualifying"}</h3><span class="badge">${w.weather.rain > 0.6 ? "HEAVY RAIN" : w.weather.rain > 0.05 ? "RAIN" : w.weather.wetness > 0.1 ? "DRYING" : "DRY"} / ${Math.round(w.weather.wetness * 100)}% WET</span></div><p class="hint">${phase === "R" ? `Starting P${w.grid.indexOf(21) + 1} · ${w.setup.laps} laps · ${w.eventName || weekendSchedule(w.round,w.seasonOrder).name} · ${DIFFICULTIES[normalizeDifficulty(w.setup.difficulty)].name} AI · choose any remaining set.` : eliminated ? "You have been knocked out. The remaining sessions will set the front of the grid." : `${w.active.length} cars · ${stage.keep} advance · ${Math.ceil((stage.duration - w.elapsed) / 60)} min remaining. Choose when to leave the garage. Time for about three timed laps. Each outing has an out lap, a timed lap and an in lap.`}</p>${phase==="R" ? `<p class="hint">${raceRuleText(w.setup.raceFormat)}</p>` : ""}${phase==="R"&&w.qualifyingOutcome?.eliminated ? `<p class="hint">${w.qualifyingOutcome.stage} knockout · final P${w.qualifyingOutcome.position}. The top ${w.qualifyingOutcome.keep} advanced.</p>` : ""}<div class="fuel-row"><span>${phase === "R" ? "Race starting set" : "Selected tyre set"}</span><b>${sets.find(t=>t.id===selectedWeekendSet) ? tyreSetLabel(sets.find(t=>t.id===selectedWeekendSet)) : "No available sets"}</b></div><button class="ghost browse-tyres" data-action="browse-weekend-tyres" aria-haspopup="dialog" ${!sets.length ? "disabled" : ""}>Choose tyre set · fresh & used</button>${phase === "R" ? `${startingAeroButton(w.setup.aeroSpec)}<div class="fuel-row"><span>Race fuel</span><b id="weekend-fuel-label">${w.setup.fuel.toFixed(1)} laps</b></div><input id="weekend-fuel" aria-label="Race fuel in laps" type="range" min="${w.setup.laps * 0.85}" max="${w.setup.laps * 1.35}" step=".1" value="${w.setup.fuel}">` : ""}${tyreLifeIndicator(sets.find(t=>t.id===selectedWeekendSet) || {compound:setup.tyre,wear:0})}<p class="hint">${forecast(w.weather)} · surface water carries over from qualifying.</p>${phase !== "R" ? '<button class="ghost race-forecast-trigger" data-action="race-forecast" aria-haspopup="dialog">Qualifying weather forecast ↗</button>' : ""}${phase === "R" ? '<button class="ghost race-forecast-trigger" data-action="race-forecast" aria-haspopup="dialog">Weather forecast <span aria-hidden="true">↗</span></button><button class="primary" data-action="weekend-race">START RACE →</button>' : eliminated ? '<button class="primary" data-action="finish-qualifying">COMPLETE QUALIFYING →</button>' : `<button class="primary" data-action="qualifying-run" ${!sets.length || w.elapsed >= stage.duration ? "disabled" : ""}>${w.runCount ? "ANOTHER RUN" : "DRIVE " + phase} →</button><button class="ghost end-session" data-action="end-qualifying" ${!qualifyingReady(w) ? "disabled" : ""}>${pendingFirstRuns(w).length ? `Waiting for ${pendingFirstRuns(w).length} opponents to complete a first run` : !qualifyingReady(w) ? "Complete your first timed lap before ending the session" : `END ${phase} & ADVANCE`}</button>`}${phase!=="R"&&!eliminated ? `<p class="hint">Ending early completes the AI runs in the current weather and track conditions. Positions can still change.</p>` : ""}<details class="weekend-results"><summary>${phase === "R" ? "Starting grid" : "Session timing"}</summary>${rows}</details><p class="save-note">Weekend allocation and qualifying progress save automatically.</p></section>`;
}
function bindWeekend() {
  const w = career.weekend;
  app.querySelector("[data-action=starting-aero]")?.addEventListener("click",showStartingAeroPicker);
  app.querySelector("[data-action=race-forecast]")?.addEventListener("click",showRaceForecast);
  app.querySelector("[data-action=browse-weekend-tyres]")?.addEventListener("click",()=>showTyreSetPicker());
  if (el("weekend-fuel"))
    el("weekend-fuel").oninput = (e) => {
      w.setup.fuel = +e.target.value;
      el("weekend-fuel-label").textContent = w.setup.fuel.toFixed(1) + " laps";
      save();
    };
  app
    .querySelector('[data-action="qualifying-run"]')
    ?.addEventListener("click", () => {
      race = beginQualifying(w,career.upgrades,career.profile,{setId:selectedWeekendSet});
      paused = false;
      keys.clear();
      accumulator = 0;
      save();
      raceUI();
    });
  app
    .querySelector('[data-action="end-qualifying"]')
    ?.addEventListener("click", () => {
      if(!qualifyingReady(w)) return;
      const run=new QualifyingRun(w,selectedWeekendSet,career.upgrades,career.profile);
      completeQualifying(run);
    });
  app
    .querySelector('[data-action="finish-qualifying"]')
    ?.addEventListener("click", () => {
      completeQualifying();
    });
  app
    .querySelector('[data-action="weekend-race"]')
    ?.addEventListener("click", () => startRace(true));
}
function careerSetupPage() {
  return `<div class="career-head"><div><div class="eyebrow">YOUR FIRST SEASON STARTS HERE</div><h2 style="margin-top:10px">Create your driver</h2></div></div>${tabs()}<form id="career-setup" class="panel career-setup"><div class="field"><label for="driver-name">Driver name</label><input id="driver-name" name="driverName" type="text" maxlength="24" required placeholder="Enter your name" autocomplete="off"><p class="hint">Your name appears in the garage, timing tower and race results.</p></div><div class="panel-heading"><h3>Choose your team</h3><span class="eyebrow">11 TEAMS</span></div><div class="team-options">${TEAMS.map((t, i) => `<button type="button" class="team-choice ${draftTeam === i ? "selected" : ""}" data-team="${i}" aria-pressed="${draftTeam === i}" style="--team:${t.color};--accent:${t.accent}"><i class="team-swatch"></i><span>${t.name}</span><b>${draftTeam === i ? "✓" : ""}</b></button>`).join("")}</div><p class="hint">Every team starts with a slower development car and £7,000. Build your pace with sponsors and upgrades.</p><button type="submit" class="primary"><span>START MY CAREER</span><span>→</span></button><div class="storage-warning">${saveWarning}</div></form>`;
}
function showCareerReset() {
  const dialog = document.createElement("div");
  dialog.className = "modal-backdrop";
  dialog.id = "reset-career-modal";
  dialog.innerHTML = `<section class="modal" role="dialog" aria-modal="true" aria-labelledby="reset-title"><div class="eyebrow">START FRESH</div><h2 id="reset-title">Reset your career?</h2><p class="muted">This resets your driver, team, money, upgrades, sponsor, points and race history. You'll return to driver setup with £7,000. This cannot be undone.</p><button class="primary" id="confirm-reset">RESET CAREER →</button><button class="ghost" id="cancel-reset" style="width:100%;margin-top:12px">Keep my career</button></section>`;
  app.appendChild(dialog);
  el("cancel-reset").focus();
  el("cancel-reset").onclick = () => {
    dialog.remove();
    app.querySelector('[data-action="reset-career"]')?.focus();
  };
  el("confirm-reset").onclick = () => {
    career = newCareer();
    draftTeam = 10;
    notice = "";
    save();
    menu();
    el("driver-name")?.focus();
  };
}
function bindMenu() {
  app.querySelector("[data-action=school]")?.addEventListener("click",openSchool);
  app.querySelectorAll("[data-screen]").forEach(
    (b) =>
      (b.onclick = () => {
        if (screen === "quick") quickSetup = { ...setup };
        else careerSetup = { ...setup };
        screen = b.dataset.screen;
        setup = { ...(screen === "quick" ? quickSetup : careerSetup) };
        notice = "";
        menu();
      }),
  );
  app.querySelectorAll("[data-start-tyre]").forEach(
    (b) =>
      (b.onclick = () => {
        setup.tyre = b.dataset.startTyre;
        const card=b.closest(".race-card");
        card.querySelectorAll("[data-start-tyre]").forEach(button=>{
          const selected=button.dataset.startTyre===setup.tyre;
          button.classList.toggle("active",selected);button.setAttribute("aria-pressed",selected);
        });
        card.querySelector(".tyre-life").outerHTML=tyreLifeIndicator();
      }),
  );
  app.querySelectorAll("[data-sponsor]").forEach(
    (b) =>
      (b.onclick = () => {
        if(career.sponsor) return;
        const scroller=app.querySelector(".menu-shell"), top=scroller.scrollTop;
        career.sponsor=b.dataset.sponsor;
        save();
        el("sponsor-panel").outerHTML=sponsorCard();
        // Keep the viewport even when collapsing the choices shortens the page.
        const missing=top-(scroller.scrollHeight-scroller.clientHeight);
        if(missing>0) {const spacer=document.createElement("div");spacer.style.height=missing+"px";spacer.style.flex="0 0 "+missing+"px";spacer.style.minHeight=missing+"px";spacer.setAttribute("aria-hidden","true");scroller.appendChild(spacer);}
        scroller.scrollTop=top;
      }),
  );
  app.querySelectorAll("[data-garage-section]").forEach(button=>button.onclick=()=>showGarageSection(button.dataset.garageSection));
  app.querySelector('[data-action="help"]').onclick = showHelp;
  app.querySelector('[data-action="settings"]').onclick=showSettings;
  app
    .querySelector('[data-action="reset-career"]')
    ?.addEventListener("click", showCareerReset);
  if (screen === "career" && !career.profile) {
    app.querySelectorAll("[data-team]").forEach(
      (b) =>
        (b.onclick = () => {
          draftTeam = +b.dataset.team;
          app.querySelectorAll("[data-team]").forEach((t) => {
            const selected = +t.dataset.team === draftTeam;
            t.classList.toggle("selected", selected);
            t.setAttribute("aria-pressed", selected);
            t.querySelector("b").textContent = selected ? "✓" : "";
          });
        }),
    );
    el("career-setup").onsubmit = (e) => {
      e.preventDefault();
      const name = el("driver-name").value.trim();
      if (!name) {
        el("driver-name").setCustomValidity("Enter a driver name.");
        el("driver-name").reportValidity();
        return;
      }
      career = newCareer({ driverName: name, teamIndex: draftTeam });
      save();
      notice =
        "Welcome, " +
        escapeHTML(career.profile.driverName) +
        ". Your " +
        TEAMS[draftTeam].name +
        " career starts here.";
      menu();
    };
    el("driver-name").oninput = (e) => e.target.setCustomValidity("");
    return;
  }
  app.querySelector("[data-action=qualifying-forecast]")?.addEventListener("click",showRaceForecast);
  if (screen === "career" && career.weekend) {
    bindWeekend();
    return;
  }
  if(el("track-choice")) el("track-choice").onclick=showTrackPicker;
  bindChoicePicker(el("weather-choice"),{title:"Choose your weather",options:pickerOptions["weather-choice"],onChange:value=>{
    setup.weather=value;refreshSetup();
  }});
  bindChoicePicker(el("laps"),{title:"Race distance",options:pickerOptions.laps,onChange:value=>{
    setup.laps=+value;setup.raceFormat=quickRaceFormat(setup.laps);
    setup.fuel=+(setup.laps*1.15).toFixed(1);refreshSetup();
  }});
  bindChoicePicker(el("starting-position"),{title:"Starting position",options:pickerOptions["starting-position"],layout:"positions",onChange:value=>{
    setup.startingPosition=+value;
  }});
  if(el("fuel")) el("fuel").oninput = (e) => {
    setup.fuel = +e.target.value;
    fuelLabel();
  };
  app.querySelector("[data-action=start]").onclick = () => startRace();
  app.querySelector("[data-action=help]").onclick = showHelp;
}
function fuelLabel() {
  if (!el("fuel-risk")) return;
  el("fuel-value").textContent = setup.fuel.toFixed(1) + " laps";
  const safe = setup.fuel >= setup.laps * 1.1 + 0.2;
  el("fuel-risk").textContent = safe
    ? "Comfortable reserve"
    : "Fuel saving required";
  el("fuel-risk").style.color = safe ? "#9eada8" : "#ffd17e";
}
function startRace(fromWeekend = false) {
  if(screen!=="career")setup.raceFormat=quickRaceFormat(setup.laps);
  if (screen === "career" && !fromWeekend) {
    const w=ensureWeekend(career, {...setup,difficulty:settings.difficulty,tyreTemperatureEnabled:settings.tyreTemperature});
    race=beginQualifying(w,career.upgrades,career.profile,{compound:setup.tyre});
    selectedWeekendSet=w.selectedSetId;
    settlement=null;paused=false;accumulator=0;resetDrivingInput();
    save();
    raceUI();
    return;
  }
  const raceSetup = screen === "career" ? career.weekend.setup : {...setup,difficulty:settings.difficulty};
  keys.clear();
  touch = { steer: 0, throttle: false, brake: false };mobileControls.reset();
  race = new Race(
    { ...raceSetup,tyreTemperatureEnabled:settings.tyreTemperature },
    screen === "career"
      ? career.weekend.setup.playerUpgrades || career.upgrades
      : { engine: 0, aero: 0, tyres: 0, crew: 0 },
    screen,
    screen === "career" ? career.profile : null,
  );
  if (screen === "career")
    prepareRace(race, career.weekend, selectedWeekendSet);
  if(screen!=="career")delete setup.weatherSeed;
  settlement = null;
  paused = false;
  accumulator = 0;
  raceUI();
}
function raceUI() {
  race.mobile=mobileInput;
  race.setTyreTemperature(settings.tyreTemperature);
  ensureAudio();
  race.autoPitLimiter=school ? true : settings.autoPitLimiter;
  if(race.autoPitLimiter) race.pitLimiter=!!race.player.pit;
  app.innerHTML = `<div class="race-top"><div class="brand">V10</div><div class="race-chips"><div class="race-chip"><span>POSITION</span><b id="position">22 / 22</b></div><div class="race-chip"><span>${race.qualifying ? "SESSION" : "LAP"}</span><b id="lap">1 / ${race.laps}</b></div><div class="race-chip"><span>${race.qualifying ? "TIME LEFT" : "RACE TIME"}</span><b id="clock">0:00.00</b></div></div><div class="race-actions"><button class="ghost" data-action="sound" aria-label="Toggle engine sound">${muted ? "Sound off" : "Sound on"}</button><button class="ghost" data-action="view">Map</button><button class="ghost" data-action="settings">Settings</button><button class="ghost" data-action="pause">Ⅱ</button></div></div><section class="tower ${race.qualifying ? "qualifying-tower" : ""}"><div class="tower-head"><span>${race.qualifying ? "QUALIFYING" : "LIVE TIMING"}</span><span>${race.qualifying ? "STATUS / BEST" : "INTERVAL"}</span></div><div id="qualifying-cutoff"></div><div id="timing"></div></section><div class="weather-hud" id="weather-hud"><b id="weather-now"></b><span id="weather-forecast"></span><span id="race-limits"></span></div><div class="engineer" id="engineer"><span>RACE ENGINEER</span><div id="message"></div></div><div class="race-bottom"><div class="dashboard"><div class="speed"><strong id="speed">0</strong><span>${speedUnitLabel(settings.speedUnit).toUpperCase()}</span></div><div class="telemetry"><div class="telemetry-header"><span id="tyre-name">MEDIUM</span><b id="wear">100%</b></div><div class="bar"><i id="wear-bar"></i></div><p id="tyre-state">Ready to race</p><div class="drive-modes" title="F: pace left toward Save · G: pace right toward Push" aria-label="Pace mode: F moves left, G moves right" aria-keyshortcuts="F G">${Object.entries(PACE_MODES).map(([id,m])=>`<button class="tab ${id===race.player.drive?"active":""}" data-drive="${id}" aria-pressed="${id===race.player.drive}" title="${m.description}" aria-label="${m.name}: ${m.description}">${m.name}</button>`).join("")}</div></div><div class="telemetry fuel-telemetry"><div class="telemetry-header"><span>FUEL</span><b id="fuel-left"></b></div><div class="bar"><i id="fuel-bar"></i></div><p id="fuel-status">On target</p><p id="last-lap" style="margin-top:12px">Last lap —</p></div></div><section class="pit-panel"><div class="eyebrow" id="pit-title">NEXT PIT STOP · T CYCLES</div><div class="compound-row">${race.qualifying ? `<button class="compound active current-tyre" data-pit-tyre="current" aria-pressed="true" style="--tyre:${TYRES[race.player.tyre].color}"><i class="tyre-dot"></i>Current</button>` : ""}${compounds(race.nextTyre, "pit-tyre")}</div><button class="primary" data-action="pit"><span id="pit-button">REQUEST PIT · B</span><span>↗</span></button><button class="ghost limiter" data-action="limiter" aria-pressed="false">LIMITER OFF · L</button><p id="pit-hint">${race.autoPitLimiter ? "Press B, then steer into the separate pit road. Speed, stopping, service and exit are automatic." : "Stop inside the highlighted box using S / ↓. R reverses. Service holds the car. L toggles the limiter."}</p><p id="race-set-note" class="hint"></p></section></div><div class="weather-timeline" role="img" aria-label="Scrolling six-minute weather forecast"><div class="forecast-legend"><b>WEATHER FORECAST</b><span><i class="rain-key"></i> Rain <i class="water-key"></i> Surface water</span></div><svg id="weather-timebar" viewBox="0 0 720 62" preserveAspectRatio="none"></svg></div><div class="countdown" id="countdown"><div class="lights">${"<i></i>".repeat(5)}</div><p>LIGHTS OUT. MAKE IT COUNT.</p></div><div class="touch-controls"><div><button data-touch="left" aria-label="Steer left">←</button><button data-touch="right" aria-label="Steer right">→</button></div><div><button class="pedal" data-touch="reverse">REV</button><button class="pedal" data-touch="brake">BRAKE</button><button class="pedal" data-touch="throttle">GAS</button></div></div>`;
  const counters=document.createElement("div");counters.className="standings-counters";
  counters.appendChild(app.querySelector(".race-chips"));
  app.querySelector(".tower").before(counters);
  const dashboard=app.querySelector(".dashboard");dashboard.classList.add("top-dashboard");app.appendChild(dashboard);
  const temperatures=document.createElement("section");temperatures.className="tyre-temperature";temperatures.setAttribute("aria-label","Four tyre temperatures");
  temperatures.innerHTML=`<span class="temperature-label">TYRE TEMP</span><div class="temperature-wheels">${WHEELS.map(w=>`<span class="temperature-wheel" data-wheel="${w}" role="img" aria-label="${w} tyre temperature"><span>${w}</span></span>`).join("")}</div>`;
  dashboard.appendChild(temperatures);
  if(!mobileInput){
    const conditions=el("weather-hud");conditions.classList.add("dashboard-conditions");
    conditions.innerHTML=`<div class="conditions-weather"><svg id="weather-symbol" viewBox="0 0 24 24" aria-hidden="true"></svg></div><div class="conditions-water"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12Z"/></svg><b id="track-water"></b></div><span id="race-limits" class="conditions-limits"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 21V4m0 1c5-5 9 5 14 0v10c-5 5-9-5-14 0"/></svg><span class="limit-dots" aria-hidden="true"><i></i><i></i><i></i></span></span><span id="race-penalty" class="conditions-penalty" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 7v5l3 2"/></svg><b></b></span>`;
    const controls=document.createElement("div");controls.className="dashboard-controls";
    const modes=dashboard.querySelector(".drive-modes");modes.classList.add("pace-selector");modes.setAttribute("role","group");
    modes.innerHTML='<button class="pace-current" type="button" aria-keyshortcuts="F G"></button>';
    modes.querySelector(".pace-current").onclick=()=>{
      const order=Object.keys(PACE_MODES);setDrive(order[(order.indexOf(race.player.drive)+1)%order.length]);
    };
    controls.append(modes,conditions);dashboard.appendChild(controls);
    refreshPaceControl();
    el("clock").previousElementSibling.textContent="LAP TIME";
    if(race.qualifying)app.querySelector(".tower-head").innerHTML='<span>QUALIFYING</span><span id="qualifying-clock" class="qualifying-clock"><small>TIME LEFT</small><b id="qualifying-time-left" role="timer"></b></span>';
    const lapSummary=document.createElement("div");lapSummary.className="lap-summary";
    lapSummary.appendChild(el("last-lap"));
    lapSummary.insertAdjacentHTML("beforeend",'<p id="best-lap"></p>');
    el("timing").before(lapSummary);
    lapSummary.insertAdjacentHTML("afterend",`<div id="sector-strip" class="sector-strip" role="group" aria-label="Your sector times">${[1,2,3].map(n=>`<div class="sector-cell" data-sector="${n-1}"><span>S${n}</span><b class="sector-time"></b><i class="sector-bar"></i></div>`).join("")}</div>`);
  }
  app.querySelector("[data-action=settings]").onclick=showSettings;
  app.querySelector("[data-action=pit]").onclick = () => {
    if(race.qualifying && race.player.garage && race.player.pit?.serviced)race.requestGarageExit();
    else race.requestPit();
    updateHUD();
  };
  app.querySelector("[data-action=limiter]").onclick = () =>
    race.togglePitLimiter();
  app.querySelector("[data-action=pause]").onclick = () => pauseRace();
  app.querySelector("[data-action=view]").onclick = () => {
    overview = !overview;
    refreshHUDIcons();
  };
  app.querySelector("[data-action=sound]").onclick = toggleAudio;
  app
    .querySelectorAll("[data-drive]")
    .forEach((b) => (b.onclick = () => setDrive(b.dataset.drive)));
  app
    .querySelectorAll("[data-pit-tyre]")
    .forEach((b) => (b.onclick = () => setPitTyre(b.dataset.pitTyre)));
  mountMobileControls();
  const browse=document.createElement("button");browse.className="ghost browse-tyres";browse.id="browse-race-tyres";
  browse.textContent="Choose tyre set · fresh & used";browse.setAttribute("aria-label","Choose tyre set");browse.onclick=()=>showTyreSetPicker();
  const pitChoices=document.createElement("div");pitChoices.className="pit-picker-buttons";
  const aeroBrowse=document.createElement("button");aeroBrowse.className="ghost browse-aero";aeroBrowse.id="browse-race-aero";
  aeroBrowse.textContent="Choose aero";aeroBrowse.setAttribute("aria-haspopup","dialog");aeroBrowse.onclick=showAeroPicker;
  browse.setAttribute("aria-haspopup","dialog");pitChoices.append(browse,aeroBrowse);
  const aeroShortcuts=document.createElement("div");aeroShortcuts.className="aero-shortcuts";
  aeroShortcuts.innerHTML=["downforce","balanced","lowDrag"].map((spec,i)=>`<button class="compound aero-shortcut" data-pit-aero="${spec}" aria-label="${AERO_PACKAGES[spec].name} · ${i+6}" title="${AERO_PACKAGES[spec].name} · ${i+6} · +10s service">${aeroIcon(spec)}<span>${i+6}</span></button>`).join("");
  aeroShortcuts.querySelectorAll("[data-pit-aero]").forEach(button=>button.onclick=()=>{race.selectAero(button.dataset.pitAero);updateHUD();});
  const aeroNote=document.createElement("p");aeroNote.id="race-aero-note";aeroNote.className="hint";
  app.querySelector(".pit-panel .compound-row").after(aeroShortcuts,pitChoices,aeroNote);
  if (race.qualifying) {
    const speed=document.createElement("button");speed.className="ghost";speed.id="qualifying-speed";
    speed.textContent="Time 1×";speed.onclick=()=>{race.cycleTimeScale();updateHUD();};
    app.querySelector(".race-actions").prepend(speed);
    const finish = document.createElement("button");
    finish.className = "ghost end-session";
    finish.title="Complete remaining AI runs in the current weather and track conditions. Positions can still change.";
    finish.id = "finish-qualifying-run";
    finish.textContent = "FINISH QUALIFYING RUN";
    finish.onclick = () => completeQualifying(race);
    app.querySelector(".pit-panel").appendChild(finish);
    el("pit-hint").textContent =
      "In laps enter the pit road automatically. Service refuels for three laps, then holds you in the box. Choose tyres here and press W / ↑ when ready to leave.";
  }
  if(!mobileInput){
    const actions=document.createElement("div");actions.className="pit-actions";
    const request=app.querySelector("[data-action=pit]");request.before(actions);actions.appendChild(request);
    const advance=el("finish-qualifying-run");if(advance)actions.appendChild(advance);
    el("browse-race-tyres").textContent="Choose tyres";
    const timeline=app.querySelector(".weather-timeline");timeline.setAttribute("role","group");timeline.setAttribute("aria-label","Weather forecast");
    el("weather-timebar").setAttribute("role","img");el("weather-timebar").setAttribute("aria-label","Scrolling six-minute weather forecast");
    const engineer=el("engineer");
    engineer.classList.add("engineer-radio");engineer.setAttribute("role","status");
    engineer.firstElementChild.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13v-1a8 8 0 0 1 16 0v5a4 4 0 0 1-4 4h-3M4 12h3v7H4a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2Zm16 0h-3v7h3a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2Z"/></svg>';
    engineer.firstElementChild.setAttribute("aria-label","Race engineer");
    dashboard.querySelector(".dashboard-conditions").before(engineer);
  }
  refreshHUDIcons();
  updateHUD();
  updateMobileSession();
}
async function completeQualifying(run=null){
 if(el("qualifying-progress") || run && (!run.canEndSession() || run.sessionEnded))return;
 const wasPaused=paused;paused=true;accumulator=0;resetDrivingInput();
 const background=[...app.children];background.forEach(node=>node.inert=true);
 const progress=document.createElement("div");progress.id="qualifying-progress";progress.className="modal-backdrop";
 progress.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="qualifying-progress-title"><div class="eyebrow">QUALIFYING</div><h2 id="qualifying-progress-title" tabindex="-1">Completing AI runs…</h2><p class="muted" role="status" aria-live="polite" id="qualifying-progress-detail">Updating opponent lap times and tyre wear.</p><progress aria-label="Completing qualifying"></progress></section>';
 app.appendChild(progress);el("qualifying-progress-title").focus();
 const yieldControl=async()=>{
  const detail=el("qualifying-progress-detail");if(detail)detail.textContent=`${career.weekend.phase} · Updating opponent lap times and tyre wear.`;
  await yieldSimulation();
 };
 try{
  const outcome=run ? await run.endSessionAsync({yieldControl}) : await finishRemainingQualifyingAsync(career.weekend,career.upgrades,career.profile,{yieldControl});
  if(run&&!outcome)return;
  if(race?.qualifying && el("position"))updateHUD();
  selectedWeekendSet=null;
  notice=outcome?.through ? `Qualified in P${outcome.position}. ${outcome.phase} is ready.` : outcome?.eliminated ? `Knocked out in ${outcome.stage} · final P${outcome.position}. Starting P${outcome.gridPosition}. Complete the remaining sessions to set the rest of the grid.` : `Qualifying complete. Starting P${career.weekend.grid.indexOf(21)+1}.`;
  const next=outcome?.through && run ? nextQualifyingSession(run,career.upgrades,career.profile) : null;
  if(next){
    openQualifyingGarage(next,`Qualified in P${outcome.position}. ${outcome.phase} · crew ready. Choose tyres and aero, then leave when ready.`);
  }else if(outcome?.eliminated){save();showQualifyingKnockout(outcome);}
  else if(career.weekend.phase==="R"){save();showFinalQualifying();}
  else throw Error("The next session has no available tyre set.");
 }catch(error){
  console.error("Qualifying completion failed",error);save();showQualifyingRecovery(run);
 }finally{
  progress.remove();background.forEach(node=>node.inert=false);
  if(race)paused=!!app.querySelector("#race-preparation,#qualifying-final,#qualifying-recovery,#qualifying-knockout") || race===run && wasPaused;
  accumulator=0;
 }
}
function openQualifyingGarage(run,message="Crew ready. Choose tyres and aero, then leave when ready.") {
  race=run;selectedWeekendSet=run.player.tyreSet.id;resetDrivingInput();accumulator=0;paused=false;
  raceUI();race.say(message);updateHUD();save();
}
function showFinalQualifying() {
  const w=career.weekend;
  restoreQualifyingGrid(w);
  el("qualifying-results")?.remove();el("qualifying-knockout")?.remove();
  const session=qualifyingClassification(w,"Q3"),position=w.grid.indexOf(21)+1;
  const ownSession=[...w.sessions].reverse().find(s=>s.order.includes(21));
  const best=ownSession?.results.find(row=>row.id===21)?.time;
  const box=document.createElement("div");box.id="qualifying-final";box.className="modal-backdrop";
  box.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="qualifying-final-title"><div class="eyebrow">FINAL QUALIFYING CLASSIFICATION</div><h2 id="qualifying-final-title" tabindex="-1">${position===1 ? "Pole position" : "Qualifying complete"}</h2><div class="result-line"><span>Grand Prix starting position</span><b>P${position}</b></div><div class="result-line"><span>${ownSession?.name || "Qualifying"} best lap</span><b>${time(best)}</b></div><p class="hint">All qualifying runs are complete. This is your confirmed starting position.</p><details class="weekend-results"><summary>Final Q3 times</summary>${session.order.map((id,i)=>`<div class="history-row"><b>P${i+1}</b><span>${id===21 ? escapeHTML(career.profile.driverName) : escapeHTML(race?.cars.find(c=>c.id===id)?.name || "Driver "+(id+1))}</span><span>${time(session.results.find(row=>row.id===id)?.time)}</span></div>`).join("")}</details><button class="primary" id="prepare-grand-prix">RACE PREPARATION →</button></section>`;
  app.appendChild(box);paused=true;
  el("prepare-grand-prix").onclick=()=>{box.remove();showRacePreparation();};
  box.addEventListener("keydown",event=>garageDialogKeys(event,box,()=>{}));el("qualifying-final-title").focus();
}
function showRaceForecast() {
  const w=career.weekend,isRace=w?.phase==="R";
  if(el("race-forecast-modal"))return;
  if(isRace)startRaceWeather(w);
  setup.weatherSeed ??= Math.floor(Math.random()*4294967296);
  const qualifyingWeekend=w || {phase:"Q1",setup:{track:careerSchedule(career).track}};
  const state=w?.weather || createWeather(careerSchedule(career).weather,{seed:setup.weatherSeed,duration:qualifyingWeatherDuration(qualifyingWeekend)});
  const stage=qualifyingStage(qualifyingWeekend);
  const duration=isRace ? w.setup.weatherDuration : Math.max(1,stage.duration-(w?.elapsed || 0));
  const outlook=raceForecast(state,{duration,laps:isRace?w.setup.laps:1});
  const eventName=w?.eventName || careerSchedule(career).name;
  const minute=seconds=>{const total=Math.round(seconds);return `${Math.floor(total/60)}:${String(total%60).padStart(2,"0")}`;};
  const backdrop=document.createElement("div");backdrop.id="race-forecast-modal";backdrop.className="modal-backdrop";
  const icon=rain=>`<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">${rain==="dry" ? '<circle cx="16" cy="16" r="6"/><path d="M16 2v4m0 20v4M2 16h4m20 0h4M6 6l3 3m14 14 3 3M6 26l3-3M23 9l3-3"/>' : '<path d="M8 20h16a6 6 0 0 0 0-12 9 9 0 0 0-17 3 5 5 0 0 0 1 9Z"/><path d="m12 24-2 4m12-4-2 4"/>'+(rain==="heavy" ? '<path d="m17 24-2 6m12-6-2 6"/>' : '')}</svg>`;
  backdrop.innerHTML=`<section class="modal garage-modal race-forecast-modal" role="dialog" aria-modal="true" aria-labelledby="race-forecast-title"><div class="track-picker-heading"><div><div class="eyebrow">${escapeHTML(eventName)} · ${isRace ? w.setup.laps+" LAPS" : stage.name+" QUALIFYING"}</div><h2 id="race-forecast-title" tabindex="-1">Weather forecast</h2></div><button class="ghost" data-close-forecast aria-label="Close weather forecast">×</button></div><p class="forecast-intro">Start to finish · about ${Math.round(outlook.duration/60)} minutes</p><ol class="race-forecast-list">${outlook.segments.map((segment,i)=>{
    const low=Math.round(segment.minWater*100),high=Math.round(segment.maxWater*100);
    return `<li class="forecast-spell forecast-${segment.rain}"><div class="forecast-spell-time"><b>${i===0 ? "START" : "THEN"}${i===outlook.segments.length-1 ? " → FINISH" : ""}</b><span>≈ ${minute(segment.start)}–${minute(segment.end)}</span>${isRace ? `<small>Laps ${segment.firstLap}${segment.lastLap!==segment.firstLap ? "–"+segment.lastLap : ""}</small>` : ""}</div><div class="forecast-spell-weather">${icon(segment.rain)}<div><h3>${segment.label}</h3><p>${segment.surface} · ${low===high ? low : low+"–"+high}% wet</p><span class="forecast-tyre-tip">${segment.tyreLabel}</span></div></div></li>`;
  }).join("")}</ol><p class="hint forecast-explanation">${isRace ? "Lap ranges are approximate: pace and pit stops change when you reach each phase." : "Times run from the current session clock. This is the same saved forecast you will drive in."} Tyre guidance follows surface water — the track can stay wet after rain stops.</p><button class="ghost garage-back" data-close-forecast>BACK TO ${isRace ? "RACE PREPARATION" : "QUALIFYING"}</button></section>`;
  const close=openStrategyPicker(backdrop,race,document.activeElement);
  backdrop.querySelectorAll("[data-close-forecast]").forEach(button=>button.onclick=close);
  backdrop.onclick=event=>{if(event.target===backdrop)close();};el("race-forecast-title").focus();
}
function showRacePreparation() {
  if(career.weekend?.phase!=="R")return;
  el("qualifying-knockout")?.remove();el("qualifying-recovery")?.remove();el("race-preparation")?.remove();el("qualifying-results")?.remove();
  resetDrivingInput();accumulator=0;paused=true;
  const box=document.createElement("div");box.className="modal-backdrop";box.id="race-preparation";
  box.innerHTML=`<section class="modal tyre-picker-modal" role="dialog" aria-modal="true" aria-label="Race preparation">${weekendCard()}</section>`;
  box.querySelector('[data-action="weekend-race"]').insertAdjacentHTML("afterend",'<button class="ghost garage-back" data-action="preparation-garage">GO TO GARAGE</button>');
  const goToGarage=()=>{
    save();resetDrivingInput();accumulator=0;screen="career";menu();
    const heading=app.querySelector("h1,h2");if(heading){heading.tabIndex=-1;heading.focus();}
  };
  box.querySelector('[data-action="preparation-garage"]').onclick=goToGarage;
  app.appendChild(box);bindWeekend();const title=box.querySelector("h3");title.tabIndex=-1;title.focus();
  box.addEventListener("keydown",event=>garageDialogKeys(event,box,goToGarage));
}
function showQualifyingRecovery(run) {
  el("qualifying-recovery")?.remove();el("qualifying-results")?.remove();paused=true;resetDrivingInput();
  const box=document.createElement("div");box.id="qualifying-recovery";box.className="modal-backdrop";
  box.innerHTML='<section class="modal" role="dialog" aria-modal="true" aria-labelledby="qualifying-recovery-title"><h2 id="qualifying-recovery-title">Session saved</h2><p class="muted">Your qualifying progress is safe. Continue here to reopen the pit garage or finish the session.</p><button class="primary" id="retry-qualifying">CONTINUE QUALIFYING →</button></section>';
  app.appendChild(box);el("retry-qualifying").onclick=()=>{
    box.remove();
    const next=run && nextQualifyingSession(run,career.upgrades,career.profile);
    if(next){openQualifyingGarage(next);return;}
    if(career.weekend.phase==="R"){showRacePreparation();return;}
    if(run && career.weekend.phase===run.stage.name)run.sessionEnded=false;
    completeQualifying(run && career.weekend.active.includes(21) ? run : null);
  };
  el("retry-qualifying").focus();box.addEventListener("keydown",event=>garageDialogKeys(event,box,()=>{}));
}
function showQualifyingKnockout(result){
 const box=document.createElement("div");box.className="modal-backdrop";box.id="qualifying-knockout";
 const gap=result.playerTime!==null&&result.cutoffTime!==null ? result.playerTime-result.cutoffTime : null;
 box.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="knockout-title"><div class="eyebrow">FINAL ${result.stage} CLASSIFICATION</div><h2 id="knockout-title" tabindex="-1">Knocked out in ${result.stage}</h2><p class="muted">${result.playerTime===null ? "No valid timed lap was banked." : result.provisionalPosition<=result.keep ? "The remaining AI runs improved the cutoff after you ended the session." : `The top ${result.keep} advanced. You finished outside the cutoff.`}</p><div class="result-line"><span>Your final position</span><b>P${result.position} · top ${result.keep} advanced</b></div><div class="result-line"><span>Your best lap</span><b>${result.playerTime===null ? "No valid lap" : time(result.playerTime)}</b></div><div class="result-line"><span>Final cutoff</span><b>${time(result.cutoffTime ?? Infinity)}${gap!==null&&gap>0 ? " · +"+gap.toFixed(3)+"s needed" : ""}</b></div><div class="result-line"><span>Race starting position</span><b>P${result.gridPosition}</b></div><button class="primary" id="knockout-continue">COMPLETE REMAINING QUALIFYING →</button></section>`;
 el("qualifying-results")?.remove();app.appendChild(box);
 el("knockout-continue").onclick=()=>{box.remove();completeQualifying();};box.addEventListener("keydown",event=>garageDialogKeys(event,box,()=>{}));
 el("knockout-title").focus();
}
function mountMobileSetupPicker(){
  if(!mobileInput || screen!=="quick")return;
  const row=app.querySelector("[data-start-tyre]")?.closest(".compound-row");if(!row)return;
  row.classList.add("mobile-compound-shortcuts");const button=document.createElement("button");button.className="ghost browse-tyres";button.textContent=TYRES[setup.tyre].name+" · Choose tyre set";button.onclick=()=>showTyreSetPicker(true);row.after(button);
}
function saveMobileSettings(){try{localStorage.setItem("v10.settings",JSON.stringify(settings));}catch{}}
function resetDrivingInput(){mobileControls.reset();keys.clear();touch={steer:0,throttle:false,brake:false};const knob=app.querySelector(".stick-knob");if(knob)knob.style.transform="translate(-50%,-50%)";}
function hudIcon(button, name, label, active=false){
  const paths={
    timing:'<path d="M9 5h11M9 12h11M9 19h11"/><path d="M4 4v3M3 7h3M3 11h3l-3 3h3M3 18h3l-2 1 2 1H3"/>',
    close:'<path d="m6 6 12 12M18 6 6 18"/>',
    fullscreen:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    sound:'<path d="M4 9h4l5-4v14l-5-4H4zM16 8q5 4 0 8m3-11q8 7 0 14"/>',
    muted:'<path d="M4 9h4l5-4v14l-5-4H4zM17 9l5 6m0-6-5 6"/>',
    map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16m6-14v16"/>',
    settings:'<path d="m9 3-1 3-3 1 1 3-2 2 2 2-1 3 3 1 1 3h6l1-3 3-1-1-3 2-2-2-2 1-3-3-1-1-3z"/><circle cx="12" cy="12" r="3"/>',
    fastForward:'<path d="m3 5 8 7-8 7V5Zm10 0 8 7-8 7V5Z"/>',
    pause:'<path d="M8 4v16M16 4v16"/>'
  };
  button.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
  button.classList.add("hud-icon");button.setAttribute("aria-label",label);button.title=label;
  button.classList.toggle("active",active);
}
function refreshHUDIcons(){
  const actions=app.querySelector(".race-actions");if(!actions)return;
  hudIcon(actions.querySelector('[data-action=sound]'),muted ? "muted" : "sound",muted ? "Enable engine sound" : "Mute engine sound");
  hudIcon(actions.querySelector('[data-action=view]'),"map",overview ? "Close circuit map" : "Show circuit map",overview);
  hudIcon(actions.querySelector('[data-action=settings]'),"settings","Settings");
  hudIcon(actions.querySelector('[data-action=pause]'),"pause","Pause race (P / Esc)");
  if(el("mobile-timing")){const open=app.querySelector(".tower").classList.contains("mobile-open");hudIcon(el("mobile-timing"),open ? "close" : "timing",open ? "Close timing" : "Show timing board",open);}
  if(el("mobile-fullscreen"))hudIcon(el("mobile-fullscreen"),"fullscreen",document.fullscreenElement ? "Exit fullscreen" : "Fullscreen options");
}
function mountMobileControls(){
  if(race)race.mobile=mobileInput;
  if(!mobileInput){el("mobile-toolbar")?.remove();el("mobile-pit-note")?.remove();}
  resetDrivingInput();
  const dashboard=app.querySelector(".top-dashboard"), modes=dashboard?.querySelector(".drive-modes");
  if(modes){if(mobileInput)dashboard.appendChild(modes);else (dashboard.querySelector(".dashboard-controls") || dashboard.querySelector(".telemetry")).prepend(modes);}
  const engineer=el("engineer");
  if(engineer){if(mobileInput)app.querySelector(".race-bottom").prepend(engineer);else if(engineer.classList.contains("engineer-radio"))dashboard.querySelector(".dashboard-conditions").before(engineer);else app.appendChild(engineer);}
  const controls=app.querySelector(".touch-controls");if(!controls)return;
  controls.innerHTML=`<div class="steering-controls">${mobileInput && settings.mobileSteering==="stick" ? '<div class="steering-stick" role="group" aria-label="Steering thumbstick"><span class="stick-knob"></span><span class="stick-label">STEER</span></div>' : '<button data-touch="left" aria-label="Steer left">←</button><button data-touch="right" aria-label="Steer right">→</button>'}</div><div class="pedal-controls"><button class="pedal" data-touch="brake" aria-label="Brake then reverse">BRAKE</button><button class="pedal" data-touch="throttle" aria-label="Accelerate">GAS</button></div>`;
  const sync=()=>{touch=mobileControls.state();};
  controls.querySelectorAll("[data-touch]").forEach(button=>{
    button.onpointerdown=e=>{if(paused || landscapeGate.blocked)return;e.preventDefault();button.setPointerCapture(e.pointerId);mobileControls.press(e.pointerId,button.dataset.touch);sync();};
    button.onpointerup=button.onpointercancel=button.onlostpointercapture=e=>{mobileControls.release(e.pointerId);sync();};
  });
  const stick=controls.querySelector(".steering-stick");
  if(stick){
    const move=e=>{const rect=stick.getBoundingClientRect(),dx=e.clientX-rect.left-rect.width/2,value=stickSteering(dx,rect.width*.38,settings.steeringSensitivity);mobileControls.move(e.pointerId,value);stick.querySelector(".stick-knob").style.transform=`translate(calc(-50% + ${Math.max(-38,Math.min(38,dx))}px),-50%)`;sync();};
    stick.onpointerdown=e=>{if(paused || landscapeGate.blocked)return;e.preventDefault();stick.setPointerCapture(e.pointerId);mobileControls.press(e.pointerId,"stick",0);move(e);};
    stick.onpointermove=e=>{if(mobileControls.pointers.has(e.pointerId))move(e);};
    stick.onpointerup=stick.onpointercancel=stick.onlostpointercapture=e=>{mobileControls.release(e.pointerId);stick.querySelector(".stick-knob").style.transform="translate(-50%,-50%)";sync();};
  }
  if(mobileInput && !el("mobile-toolbar")){
    const toolbar=document.createElement("div");toolbar.id="mobile-toolbar";
    toolbar.innerHTML='<button class="ghost" id="mobile-timing">Timing</button><button class="ghost" id="mobile-fullscreen">Fullscreen</button>';
    app.querySelector(".race-actions").prepend(toolbar);
    let timingWasPaused=false;el("mobile-timing").onclick=()=>{const open=app.querySelector(".tower").classList.toggle("mobile-open");resetDrivingInput();if(open){timingWasPaused=paused;paused=true;}else paused=timingWasPaused;refreshHUDIcons();};
    el("mobile-fullscreen").onclick=async()=>{
      try{
        if(document.fullscreenElement){await document.exitFullscreen();}
        else if(document.documentElement.requestFullscreen){await document.documentElement.requestFullscreen();try{await screen.orientation?.lock("landscape");}catch{}}
        else showFullscreenHelp();
      }catch{showFullscreenHelp();}
      updateMobileSession();
    };
    const note=document.createElement("small");note.id="mobile-pit-note";app.querySelector(".pit-panel").prepend(note);
  }
  refreshHUDIcons();
}
function showFullscreenHelp(){
  if(el("fullscreen-help"))return;
  const wasPaused=paused;paused=true;resetDrivingInput();
  const installed=window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const apple=/iPhone|iPad|iPod/.test(navigator.userAgent);
  const android=/Android/.test(navigator.userAgent);
  const box=document.createElement("div");box.className="modal-backdrop";box.id="fullscreen-help";
  box.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="fullscreen-title"><div class="eyebrow">MORE ROOM TO RACE</div><h2 id="fullscreen-title">${installed ? "Already in app mode" : "Play without browser bars"}</h2>${installed ? '<p>The game is already running from your Home Screen. Rotate your phone horizontally to race.</p>' : `<p>Install V10 and open it from your Home Screen to play without browser bars.</p><ol class="fullscreen-steps">${apple ? '<li>In Safari, tap Share (the square with an upward arrow).</li><li>Choose Add to Home Screen.</li><li>Enable Open as Web App if shown, then tap Add.</li>' : android ? '<li>Open this site in Chrome, then tap the three-dot menu.</li><li>Choose Install and create shortcut → Install. Older versions may say Install app or Add to Home screen.</li><li>Confirm the installation.</li>' : '<li>Open your browser menu.</li><li>Choose Install app or Add to Home Screen, if available.</li>'}<li>Open V10 from your Home Screen and rotate horizontally.</li></ol><p class="hint">Home Screen mode may use separate saved career progress. Your browser save stays in that browser.</p>`}<button class="primary" id="close-fullscreen-help">BACK TO GAME</button></section>`;
  app.appendChild(box);const close=()=>{box.remove();paused=wasPaused;resetDrivingInput();ensureAudio();};
  el("close-fullscreen-help").onclick=close;
  box.addEventListener("keydown",e=>{if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close();}});
  el("close-fullscreen-help").focus();
}
function updateMobileSession(){
  if(el("qualifying-progress"))return;
  const running=!!race && !race.done;
  document.body.classList.toggle("mobile-racing",mobileInput && running);
  landscapeGate.sync(mobileInput,running,innerWidth,innerHeight);
  let overlay=el("landscape-gate");
  if(!landscapeGate.blocked){overlay?.remove();return;}
  resetDrivingInput();accumulator=0;
  if(!overlay){overlay=document.createElement("div");overlay.id="landscape-gate";overlay.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="rotate-title"><div class="rotate-phone" aria-hidden="true">↻</div><h2 id="rotate-title"></h2><p id="rotate-description"></p><button class="primary" id="mobile-resume">RESUME →</button></section>';app.appendChild(overlay);el("mobile-resume").onclick=()=>{landscapeGate.resume();resetDrivingInput();accumulator=0;ensureAudio();updateMobileSession();};}
  el("rotate-title").textContent=landscapeGate.portrait ? "Rotate your phone to race" : "Ready when you are";
  el("rotate-description").textContent=landscapeGate.portrait ? "Hold your phone horizontally. Unlock screen rotation if needed. Racing is paused." : "Your race is paused. Tap Resume to continue.";
  el("mobile-resume").hidden=landscapeGate.portrait;
}
function refreshPaceControl(){
  const control=app.querySelector(".pace-selector");if(!control || !race)return;
  const mode=race.player.drive,details=paceMode(mode),current=control.querySelector(".pace-current");
  const icons={save:'<path d="M20 3C9 2 4 7 5 13s12 8 15-10ZM4 21l10-10"/>',balanced:'<path d="M5 9h14M5 15h14"/>',push:'<path d="m13 2-9 12h7l-1 8 10-13h-7l1-7Z"/>'};
  control.dataset.mode=mode;control.title=`${details.name}: ${details.description} F: pace left · G: pace right`;
  control.setAttribute("aria-label",`Pace: ${details.name}. F moves left; G moves right.`);
  current.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true">${icons[mode] || icons.balanced}</svg>`;
  const order=Object.keys(PACE_MODES),next=order[(order.indexOf(mode)+1)%order.length];
  current.setAttribute("aria-label",`${details.name} pace. Select ${paceMode(next).name}`);
  current.title=`${details.name}: ${details.description} Click to select ${paceMode(next).name}. F: pace left · G: pace right`;

}
function setDrive(mode) {
  if (!race) return;
  race.player.drive = mode;
  refreshPaceControl();
  race.say(`${paceMode(mode).name}: ${paceMode(mode).description}`);
  app.querySelectorAll("[data-drive]").forEach((b) => {
    b.classList.toggle("active", b.dataset.drive === mode);
    b.setAttribute("aria-pressed", b.dataset.drive === mode);
  });
}
function openStrategyPicker(backdrop,running,trigger) {
  const wasPaused=paused,background=[...app.children].map(node=>[node,node.inert]);
  if(running)paused=true;
  accumulator=0;resetDrivingInput();background.forEach(([node])=>node.inert=true);app.appendChild(backdrop);
  let closed=false,keyboardFocus=!!trigger?.matches(":focus-visible");
  const close=()=>{
    if(closed)return;closed=true;
    backdrop.remove();background.forEach(([node,inert])=>node.inert=inert);
    paused=wasPaused;accumulator=0;resetDrivingInput();
    if(keyboardFocus)trigger?.focus({preventScroll:true});
  };
  backdrop.addEventListener("pointerdown",()=>keyboardFocus=false);
  backdrop.addEventListener("keydown",event=>{keyboardFocus=true;garageDialogKeys(event,backdrop,close);});
  return close;
}
function aeroIcon(spec) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${spec==="downforce" ? '<path d="M3 16h18M5 13v6m14-6v6M12 3v9m-4-4 4 4 4-4"/>' : spec==="balanced" ? '<path d="M4 9h16M4 15h16"/>' : '<path d="M3 9h11m-8 4h8m-5 4h5m2-12 5 8-5 8"/>'}</svg>`;
}
function showAeroPicker() {
  const running=race;if(!running || running.done || el("aero-picker") || el("tyre-set-picker"))return;
  const fitted=running.player.aeroSpec || "balanced",canChange=running.canSelectAero();
  let selected=running.nextAeroSpec || fitted;
  const backdrop=document.createElement("div");backdrop.className="modal-backdrop";backdrop.id="aero-picker";
  backdrop.innerHTML=`<section class="modal aero-picker-modal" role="dialog" aria-modal="true" aria-labelledby="aero-picker-title"><div class="track-picker-heading"><div><div class="eyebrow">PIT SETUP</div><h2 id="aero-picker-title">Choose your aero</h2></div><button class="ghost" data-close-aero aria-label="Close aero selector">×</button></div><p class="hint">Fitted: <b>${AERO_PACKAGES[fitted].name}</b>. A change adds <b>10 seconds</b> after tyre service.</p><div class="aero-picker-grid">${["downforce","balanced","lowDrag"].map(spec=>`<button class="aero-choice" data-choose-aero="${spec}" ${canChange ? "" : "disabled"}>${aeroIcon(spec)}<b>${AERO_PACKAGES[spec].name}</b><span>${spec==="balanced" ? "No package bonus or penalty to speed or grip." : AERO_PACKAGES[spec].desc}</span><small>${aeroPackageSummary(spec)}</small></button>`).join("")}</div><div class="picker-confirm"><p id="aero-selection-note" class="hint" role="status"></p><button class="ghost" id="keep-fitted-aero" ${canChange ? "" : "disabled"}>Keep fitted package</button><button class="primary" id="confirm-aero" ${canChange ? "" : "disabled"}>CONFIRM AERO →</button><p class="hint">Session paused until you confirm or close.</p></div></section>`;
  const close=openStrategyPicker(backdrop,running,el("browse-race-aero"));
  const refresh=()=>{
    backdrop.querySelectorAll("[data-choose-aero]").forEach(button=>{const active=button.dataset.chooseAero===selected;button.classList.toggle("selected",active);button.setAttribute("aria-pressed",active);});
    el("aero-selection-note").textContent=!aeroUnlocked(running.player.upgrades) ? "Buy Aerodynamics level 1 in Car development to unlock aero packages. The standard Balanced setup has no package bonuses or penalties." : !canChange ? "In qualifying, choose your aero while stopped in the pit box." : selected===fitted ? "Keep fitted package · no additional service" : `${AERO_PACKAGES[selected].name} · +10s at ${running.player.garage || running.player.pit?.stage==="service" ? "this stop" : "your next stop"}`;
  };
  backdrop.querySelector("[data-close-aero]").onclick=close;backdrop.onclick=event=>{if(event.target===backdrop)close();};
  backdrop.querySelectorAll("[data-choose-aero]").forEach(button=>button.onclick=()=>{selected=button.dataset.chooseAero;refresh();});
  el("keep-fitted-aero").onclick=()=>{selected=fitted;refresh();};
  el("confirm-aero").onclick=()=>{if(running.selectAero(selected)){close();updateHUD();}};
  refresh();backdrop.querySelector("[data-close-aero]").focus();
}
function showTyreSetPicker(quickStart=false) {
  if(el("tyre-set-picker") || el("aero-picker")) return;
  const running=race && !race.done ? race : null,w=running?.weekend || (!running ? career.weekend : null);
  if(!w && !running && !quickStart) return;
  const mediumLesson=!!school && !!running?.qualifying && school.state.outings===1 && (!school.state.mediumChosen || running.player.tyre!=="M");
  if(mediumLesson)school.state.pickerOpened=true;
  const currentId=running?.player.tyreSet?.id || (running ? "quick-current" : null);
  const inventory=running ? running.player.tyreInventory || [
    {id:currentId,label:running.player.tyre+" · fitted",compound:running.player.tyre,wear:running.player.wear,used:true},
    ...["S","M","H","I","W"].map(compound=>({id:"quick-"+compound,label:compound,compound,wear:0,used:false}))
  ] : quickStart ? ["S","M","H","I","W"].map(compound=>({id:"start-"+compound,label:compound,compound,wear:0,used:false})) : w.inventories[21];
  const phase=quickStart || running && !running.qualifying ? "R" : w.phase;
  const available=selectableSets(inventory,phase,running && !running.qualifying ? currentId : null),selected=running ? running.nextSetId || "quick-"+running.nextTyre : quickStart ? "start-"+setup.tyre : selectedWeekendSet;
  let draftSet=available.find(t=>t.id===selected && (!mediumLesson || t.compound==="M"))?.id;
  const backdrop=document.createElement("div");backdrop.className="modal-backdrop";backdrop.id="tyre-set-picker";
  backdrop.innerHTML=`<section class="modal tyre-picker-modal" role="dialog" aria-modal="true" aria-labelledby="tyre-picker-title"><div class="track-picker-heading"><div><div class="eyebrow">${quickStart ? "STARTING TYRES" : running && !running.player.tyreInventory ? "RACE TYRE OPTIONS" : "WEEKEND TYRE ALLOCATION"}</div><h2 id="tyre-picker-title">Choose your tyre set</h2></div><button class="ghost" data-close-tyres aria-label="Close tyre selector">×</button></div><p class="hint">Fresh or used — each physical set keeps its condition across outings and qualifying sessions. ${!mobileInput && running ? "The compound buttons remain available for quick choices." : ""}</p><p class="hint">${running || w ? `Now ${Math.round((running?.weather.wetness ?? w.weather.wetness)*100)}% wet · white marker = current water. ` : ""}Bands show suggested grip ranges on a 0–100% wetness scale.</p>${["S","M","H","I","W"].map(compound=>`<div class="tyre-set-group"><h3 style="color:${TYRES[compound].color}">${TYRES[compound].name}</h3>${wetnessBand(compound,running?.weather.wetness ?? w?.weather.wetness ?? null,false)}<div class="tyre-set-grid">${inventory.filter(t=>t.compound===compound&&!t.returned).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})).map(t=>{
    const enabled=available.some(a=>a.id===t.id) && (!mediumLesson || t.compound==="M"),condition=Math.round(Math.max(0,1-t.wear)*100),fitted=!!running && currentId===t.id;
    return `<button class="tyre-set-card ${t.id===selected ? "selected" : ""}" data-choose-set="${t.id}" ${enabled ? "" : "disabled"} aria-pressed="${t.id===selected}" style="--tyre:${TYRES[compound].color}"><b><i class="tyre-dot"></i>${t.label || t.id}<span>${condition}%</span></b><div class="bar"><i style="width:${condition}%;background:var(--tyre)"></i></div><small>${fitted ? "Currently fitted" : !enabled ? mediumLesson && t.compound!=="M" ? "Use Mediums for outing 2" : t.reserved ? "Reserved for Q3" : "Worn out" : t.used ? "Used · reusable" : "Fresh"}</small></button>`;
  }).join("")}</div></div>`).join("")}<div class="picker-confirm"><p class="hint">${running ? "Session paused. Confirm your choice to resume." : "Select a set, then confirm."}</p><button class="primary" id="confirm-tyre-set" ${draftSet ? "" : "disabled"}>CONFIRM TYRE SET →</button></div></section>`;
  const close=openStrategyPicker(backdrop,running,running ? el("browse-race-tyres") : app.querySelector("[data-action=browse-weekend-tyres]"));
  backdrop.querySelector("[data-close-tyres]").onclick=close;backdrop.onclick=e=>{if(e.target===backdrop)close();};
  backdrop.querySelectorAll("[data-choose-set]").forEach(button=>button.onclick=()=>{
    draftSet=button.dataset.chooseSet;
    backdrop.querySelectorAll("[data-choose-set]").forEach(card=>{const active=card.dataset.chooseSet===draftSet;card.classList.toggle("selected",active);card.setAttribute("aria-pressed",active);card.classList.remove("school-arrow-target");});
    el("confirm-tyre-set").disabled=false;
    if(mediumLesson)el("confirm-tyre-set").classList.add("school-arrow-target");
  });
  el("confirm-tyre-set").onclick=()=>{
    const set=available.find(t=>t.id===draftSet);if(!set)return;
    if(quickStart){setup.tyre=set.compound;close();menu();return;}
    if(running) {
      if(mediumLesson && set.compound!=="M")return;
      if(running.qualifying && running.player.pit && !running.selectGarageSet(set.id))return;
      if(mediumLesson){school.chooseMedium(running,set.id);school.save(localStorage);}
      running.nextSetId=set.id;running.nextTyre=set.compound;
      app.querySelectorAll("[data-pit-tyre]").forEach(b=>{
        const active=b.dataset.pitTyre===set.compound;b.classList.toggle("active",active);b.setAttribute("aria-pressed",active);
      });
      close();updateHUD();
      // Advance keyboard focus with the lesson so the old picker does not
      // retain a second outline beside the new departure highlight.
      if(mediumLesson){
        const target=app.querySelector(school.guide(running).highlight || '[data-action=pit]');
        if(target?.disabled){const heading=el("school-goal");heading.tabIndex=-1;heading.focus();}
        else target?.focus();
      }
    } else {
      selectedWeekendSet=set.id;w.selectedSetId=set.id;w.selectedPhase=w.phase;w.startSetId=set.id;
      const top=app.querySelector(".menu-shell")?.scrollTop || 0;
      close();save();
      if(el("race-preparation"))showRacePreparation();
      else {menu();app.querySelector(".menu-shell").scrollTop=top;}
      app.querySelector("[data-action=browse-weekend-tyres]")?.focus({preventScroll:true});
    }
  };
  if(mediumLesson){const medium=backdrop.querySelector('[data-choose-set^="M"]:not(:disabled)');medium?.classList.add("school-arrow-target");if(mobileInput)medium?.scrollIntoView({block:"center"});}
  backdrop.querySelector("[data-close-tyres]").focus();
}
function setPitTyre(tyre) {
  if(school && race?.qualifying && school.state.outings===1 && !school.state.mediumChosen)return;
  if (!race || (race.player.pit && !race.player.garage && !(race.qualifying && race.player.pit.stage==="service"))) return;
  if(tyre === "current" && race.qualifying) {
    race.nextSetId=race.player.tyreSet.id;race.nextTyre=race.player.tyre;race.keepCurrentTyres=true;race.selectGarageSet(race.nextSetId);return;
  }
  race.keepCurrentTyres=false;
  if (race.weekend) {
    const available = selectableSets(
      race.player.tyreInventory,
      race.qualifying ? race.weekend.phase : "R",
      race.qualifying ? null : race.player.tyreSet?.id,
    )
      .filter((t) => t.compound === tyre && t.id !== race.player.tyreSet?.id)
      .sort((a, b) => a.wear - b.wear);
    if (!available.length) return;
    race.nextSetId = available[0].id;
  }
  race.nextTyre = tyre;
  if(race.qualifying && race.player.pit) race.selectGarageSet(race.nextSetId);
  app.querySelectorAll("[data-pit-tyre]").forEach((b) => {
    b.classList.toggle("active", b.dataset.pitTyre === tyre);
    b.setAttribute("aria-pressed", b.dataset.pitTyre === tyre);
  });
}
function updateWeatherTimeline() {
  const svg=el("weather-timebar");
  if(!svg) return;
  const now=race.weather.elapsed, bucket=Math.floor(now);
  if(svg.dataset.second===String(bucket)) return;
  svg.dataset.second=String(bucket);
  const start=now-30, x=t=>(t-start)/390*720, y=v=>43-v*29;
  const points=weatherTimeline(race.weather);
  const water=points.map((p,i)=>`${i ? "L" : "M"}${x(p.time).toFixed(1)},${y(p.water).toFixed(1)}`).join(" ");
  const rain=Array.from({length:79},(_,i)=>{const t=start+i*5; return `${i ? "L" : "M"}${x(t).toFixed(1)},${y(rainAt(race.weather,Math.max(0,t))).toFixed(1)}`;}).join(" ");
  let ticks="";
  for(let t=Math.ceil(Math.max(0,start)/60)*60;t<=now+360;t+=60) ticks+=`<line x1="${x(t)}" x2="${x(t)}" y1="9" y2="45" stroke="#526c78" opacity=".45"/><text x="${x(t)}" y="58" text-anchor="middle">${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,"0")}</text>`;
  svg.innerHTML=`${ticks}<path d="${rain} L720,43 L0,43 Z" fill="#76baff" opacity=".13"/><path d="${rain}" fill="none" stroke="#76baff" stroke-width="2"/><path d="${water}" fill="none" stroke="#6ee4b4" stroke-width="2"/><line x1="${x(now)}" x2="${x(now)}" y1="7" y2="47" stroke="#f3e5b2"/><text x="${x(now)+5}" y="${mobileInput ? 17 : 9}" fill="#f3e5b2">NOW</text>`;
}
function fastestLapBadge(lap) {
  return `<span class="fastest-lap-badge" role="img" aria-label="Fastest race lap ${time(lap)}" title="Fastest race lap · ${time(lap)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="14" r="8"/><path d="M9 2h6m-3 0v4m6 2 2-2m-8 8 3-4"/></svg></span>`;
}
let sectorHUDRace=null,sectorHUDEvent=null,sectorHUDUntil=0;
function updateSectorHUD() {
  const strip=el("sector-strip"),state=race.player.sectorTiming;
  if(!strip||!state)return;
  if(sectorHUDRace!==race){sectorHUDRace=race;sectorHUDEvent=null;sectorHUDUntil=0;}
  if(state.event && sectorHUDEvent!==state.event){
    sectorHUDEvent=state.event;sectorHUDUntil=performance.now()+2200;
  }
  const timed=!race.qualifying||race.player.qState==="timed";
  const colours={purple:"Session best",green:"Personal best",yellow:"Slower than personal best",invalid:"Invalid sector"};
  strip.querySelectorAll(".sector-cell").forEach((cell,i)=>{
    const result=timed ? state.bars[i] : null,active=timed&&!race.player.finished&&!race.player.dnf&&state.active===i;
    const popup=state.event?.sector===i&&performance.now()<sectorHUDUntil ? state.event : null;
    cell.dataset.colour=result?.colour || "neutral";
    cell.classList.toggle("active",active);
    const label=`Sector ${i+1}${active ? " · current sector" : ""}${result ? " · "+colours[result.colour]+" · "+result.time.toFixed(3)+" seconds" : " · untimed"}`;
    cell.title=label;cell.setAttribute("aria-label",label);
    const text=cell.querySelector(".sector-time");
    text.textContent=popup ? popup.time.toFixed(3) : "";
    text.dataset.colour=popup?.colour || "neutral";
  });
}
function updateHUD() {
  if (!race || !el("position")) return;
  if(school && el("school-guide")) updateSchoolGuide();
  el("browse-race-tyres").disabled=!!race.player.pit && !race.player.garage && !(race.qualifying && race.player.pit.stage==="service");
  const p = race.player,
    order = race.qualifying ? race.order() : race.timingOrder(),
    position = order.indexOf(p) + 1,
    remaining = Math.max(0, race.laps - raceProgress(p) / TRACK.length);
  el("position").textContent = position + " / 22";
  el("lap").textContent =
    Math.min(race.laps, Math.max(1, Math.floor(raceProgress(p) / TRACK.length) + 1)) +
    " / " +
    race.laps;
  el("clock").textContent = time(mobileInput ? race.time : currentLapTime(race) ?? Infinity);
  el("speed").textContent = Math.round(speedValue(Math.abs(p.speed),settings.speedUnit));
  const drafting=(p.slipstream?.strength || 0)>.12;
  el("speed").classList.toggle("drafting",drafting);
  el("speed").title=drafting ? "Slipstream: reduced drag" : (p.slipstream?.carry || 0)>.08 ? "Carrying speed from the tow" : `Speed in ${speedUnitLabel(settings.speedUnit)}`;
  app.querySelector(".speed span").textContent=speedUnitLabel(settings.speedUnit).toUpperCase()+(p.speed<0 ? " · R" : "");
  el("tyre-name").textContent = TYRES[p.tyre].name.toUpperCase();
  el("tyre-name").style.color = TYRES[p.tyre].color;
  el("wear").textContent = Math.round(Math.max(0, 1 - p.wear) * 100) + "%";
  el("wear-bar").style.width = Math.max(0, 1 - p.wear) * 100 + "%";
  el("wear-bar").style.background =
    p.wear > 0.8 ? "#ff8270" : TYRES[p.tyre].color;
  el("tyre-state").textContent =
    p.tyreTemperatures?.some(t=>t<THERMAL[p.tyre].low-12)
      ? "Cold tyres · build grip"
      : p.wear > 0.82
        ? "Grip fading · box soon"
        : !tyreRuleMet(p)
          ? "Second compound required"
          : p.raceFormat==="sprint" ? "Sprint · no required stop" : "Compound requirement met";
  const tyreEstimate=stintLaps(p.tyre,TYRES,{wear:p.wear,mode:p.drive,upgrades:p.upgrades,wetness:p.trackWetness || 0,thermal:thermalWear(p),stress:1+(p.sliding || 0)*.5});
  el("tyre-state").textContent+=` · ≈${tyreEstimate.toFixed(1)} laps`;
  el("wear").title=`About ${tyreEstimate.toFixed(1)} competitive laps at ${paceMode(p).name} pace`;
  const temperaturePanel=app.querySelector(".tyre-temperature");
  if(temperaturePanel){
    temperaturePanel.hidden=!race.tyreTemperatureEnabled;
    app.querySelector(".top-dashboard").classList.toggle("temperatures-disabled",!race.tyreTemperatureEnabled);
    el("weather-hud").classList.toggle("temperatures-disabled",!race.tyreTemperatureEnabled);
    temperaturePanel.querySelectorAll("[data-wheel]").forEach((button,i)=>{
      const t=p.tyreTemperatures?.[i] ?? THERMAL[p.tyre].low;
      const status=temperatureStatus(p.tyre,t),condition=Math.round(Math.max(0,1-(p.wheelWear?.[i] ?? p.wear))*100);
      button.style.setProperty("--temperature",temperatureColour(p.tyre,t));
      const label=`${WHEELS[i]} · ${Math.round(t)}°C · ${status} · ${condition}% condition`;
      button.setAttribute("aria-label",label);
    });
  }
  el("fuel-left").textContent = p.fuel.toFixed(1) + " laps";
  el("fuel-left").title=`Estimated range: ${(p.fuel/fuelPerLap(p.drive,p.upgrades)).toFixed(1)} laps at ${paceMode(p).name} pace`;
  el("fuel-bar").style.width = (p.fuel / race.setup.fuel) * 100 + "%";
  el("fuel-status").textContent =
    `${(p.fuel/fuelPerLap(p.drive,p.upgrades)-remaining)>=0?"+":""}${(p.fuel/fuelPerLap(p.drive,p.upgrades)-remaining).toFixed(1)} laps to finish · ${paceMode(p).name}`;
  el("fuel-status").style.color = p.fuel < remaining*fuelPerLap(p.drive,p.upgrades) ? "#ffd17e" : "";
  el("last-lap").textContent = "Last lap " + time(p.lastLap || Infinity);
  if(!mobileInput){
    el("last-lap").innerHTML=`<span>LAST</span><b>${time(p.lastLap || Infinity)}</b>`;
    el("best-lap").innerHTML=`<span>BEST</span><b>${time(p.bestLap || Infinity)}</b>`;
    updateSectorHUD();
    el("fuel-left").classList.toggle("fuel-low",!race.qualifying && p.fuel<remaining*fuelPerLap(p.drive,p.upgrades));
  }
  const conditions=el("weather-hud"),wetness=Math.round(race.weather.wetness*100),warnings=p.trackLimits%4;
  const weatherLabel=race.weather.rain>.6 ? "Heavy rain" : race.weather.rain>.05 ? "Light rain" : race.weather.wetness>.1 ? "Drying" : "Dry";
  if(conditions.classList.contains("dashboard-conditions")){
    const weatherIcon=conditions.querySelector(".conditions-weather");
    weatherIcon.title=weatherLabel;weatherIcon.setAttribute("aria-label",weatherLabel);weatherIcon.setAttribute("role","img");
    const rain=race.weather.rain>.05;
    el("weather-symbol").innerHTML=rain ? '<path d="M6 15H5a4 4 0 0 1 0-8 6 6 0 0 1 11-2 5 5 0 0 1 2 10h-1M8 18l-1 3m6-3-1 3m6-3-1 3"/>' : '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1"/>';
    el("track-water").textContent=wetness+"%";
    const water=conditions.querySelector(".conditions-water");water.title="Track wetness: "+wetness+"%";water.setAttribute("aria-label",water.title);
    const limits=el("race-limits");limits.title=`Track limits: ${warnings} of 3 warnings. The next infringement after 3 adds a penalty.`;
    limits.setAttribute("aria-label",limits.title);limits.classList.toggle("has-warning",warnings>0);
    limits.querySelectorAll(".limit-dots i").forEach((dot,i)=>dot.classList.toggle("used",i<warnings));
    const penalty=el("race-penalty"),seconds=p.penaltySecondsTotal || 0;
    penalty.hidden=seconds===0;penalty.querySelector("b").textContent="+"+seconds+"s";
    penalty.title=`Total time penalties: ${seconds} seconds`;penalty.setAttribute("aria-label",penalty.title);
  }else{
    el("weather-forecast").textContent=forecast(race.weather);
    el("weather-now").textContent=weatherLabel.toUpperCase()+` · ${wetness}% track wetness`;
    el("race-limits").textContent=`Limits ${warnings}/3 · ${p.penaltySecondsTotal || 0}s penalties`;
  }
  updateWeatherTimeline();
  const announcement=speedText(mobileInput ? mobileLessonText(race.message,settings.mobileSteering) : race.message,settings.speedUnit);
  if(el("message").textContent!==announcement)el("message").textContent=announcement;
  el("engineer").title=announcement;
  el("engineer").classList.toggle("hidden", !!school || race.time > race.messageUntil);
  const limiter = app.querySelector("[data-action=limiter]");
  limiter.textContent=(race.pitLimiter ? `LIMITER ON · ${Math.round(speedValue(80,settings.speedUnit))}` : "LIMITER OFF") + (race.autoPitLimiter ? " · AUTO" : " · L");
  limiter.disabled=race.autoPitLimiter;
  limiter.setAttribute("aria-pressed", race.pitLimiter);
  limiter.classList.toggle("active", race.pitLimiter);
  el("pit-title").textContent = p.pit
    ? p.pit.stage === "service"
      ? "SERVICE HOLD · " + Math.max(0,p.pit.timer).toFixed(1) + "s"
      : "PIT LANE · " + (race.pitLimiter ? `${Math.round(speedValue(80,settings.speedUnit))} LIMIT` : "NO LIMITER")
    : race.pitRequested
      ? "BOX THIS LAP"
      : "NEXT PIT STOP";
  el("pit-button").textContent = p.pit
    ? p.pit.stage === "service"
      ? p.pit.timer.toFixed(1) + "s · SERVICE"
      : "IN PIT LANE"
    : race.pitRequested
      ? "CANCEL PIT · B"
      : "REQUEST PIT · B";
  app.querySelector("[data-action=pit]").disabled = !!p.pit && !(race.qualifying && p.garage && p.pit.serviced);
  if(school && race.qualifying && p.garage && (p.tyre!==(school.state.outings===0 ? "S" : "M") || (school.state.outings===1 && !school.state.mediumChosen)))app.querySelector("[data-action=pit]").disabled=true;
  app
    .querySelectorAll("[data-pit-tyre]")
    .forEach((b) => (b.disabled = !!p.pit && !p.garage));
  if (p.pit && !race.qualifying)
    el("pit-hint").textContent =
      p.pit.stage === "service"
        ? `SERVICE HOLD · ${Math.max(0,p.pit.timer).toFixed(1)}s remaining. Controls locked.`
        : p.pit.serviced
          ? race.autoPitLimiter ? "Automatic exit. No throttle needed; control returns at the pit exit line." : "Service complete. Accelerate to pit exit; release L after the lane."
          : race.autoPitLimiter ? `Automatic pit stop · box in ${Math.round(Math.max(0,p.pit.boxDistance-p.pit.distance))}m. Pedals handled by the crew.` : `Box ${Math.round(p.pit.boxDistance - p.pit.distance)}m · brake to stop in the outline. R reverses.`;
  let visible = raceTimingWindow(order,p);
  if(mobileInput)visible=position>5
    ? [...order.slice(0,5),...order.slice(Math.max(5,position-2),Math.min(22,position+1))]
    : order.slice(0,8);
  el("timing").innerHTML = visible
    .map((c) => {
      const rank = order.indexOf(c) + 1,
        gap = liveInterval(order[Math.max(0,rank-2)],c);
      return `<div class="timing-row ${c.player ? "me" : ""}" style="--team:${c.team.color};--tyre:${TYRES[c.tyre].color}"><span class="rank">${rank}</span><i class="stripe"></i><span class="name" title="${escapeHTML(c.name)}">${escapeHTML(c.name)}${!mobileInput && !race.qualifying && race.sectors.fastestLap?.driverId===c.id ? fastestLapBadge(race.sectors.fastestLap.time) : ""}</span><span class="gap">${gap}</span><span class="compound-label">${c.tyre}</span></div>`;
    })
    .join("");
  if (race.qualifying) {
    const finish=el("finish-qualifying-run");
    finish.disabled=!race.canEndSession();
    const action=race.sessionAction();
    const advanceLabel=race.stage.name==="Q3" || action.startsWith("End qualifying") ? "→ Grid" : "→ "+(race.stage.name==="Q1" ? "Q2" : "Q3");
    finish.textContent=mobileInput ? action : advanceLabel;
    finish.title=action+". Remaining AI runs still count toward the final classification.";finish.setAttribute("aria-label",action);
    const speed=el("qualifying-speed"),speedLabel=`Qualifying speed ${race.timeScale} times; cycle speed`;
    if(mobileInput)speed.textContent=`Time ${race.timeScale}×`;
    else if(speed.dataset.scale!==String(race.timeScale)){
      hudIcon(speed,"fastForward",speedLabel);speed.insertAdjacentHTML("beforeend",`<small>${race.timeScale}×</small>`);speed.dataset.scale=race.timeScale;
    }
    speed.setAttribute("aria-label",speedLabel);speed.title=speedLabel;
    el("fuel-status").textContent = "Qualifying fuel load";
    el("fuel-status").style.color = "";
    const stateLabel=p.qState==="timed" && p.qInvalid ? "INVALID" : ({garage:"PITS",out:"OUT LAP",timed:"TIMED",in:"IN LAP",stranded:"NO FUEL"})[p.qState] || "PIT";
    el("lap").innerHTML=mobileInput ? race.stage.name+" · "+stateLabel : `<span class="session-name">${race.stage.name}</span><small>${stateLabel}</small>`;
    if(mobileInput)el("clock").textContent=school ? time(race.time) : time(Math.max(0,race.stage.duration-race.weekend.elapsed));
    else {
      const expired=!school && race.weekend.elapsed>=race.stage.duration;
      const finishing=expired && !p.garage && !p.pit && !p.dnf && p.qState==="timed" && Number.isFinite(p.qStart) && race.stageStart+p.qStart<race.stage.duration;
      const clock=el("qualifying-time-left"),container=el("qualifying-clock");
      container.classList.toggle("session-expired",expired);
      container.querySelector("small").textContent=school ? "PRACTICE" : expired ? "" : "TIME LEFT";
      const seconds=Math.ceil(school ? race.time : Math.max(0,race.stage.duration-race.weekend.elapsed));
      clock.textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,"0")}`;
      if(expired)clock.innerHTML=`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 22V3m0 1h15v12H5"/><path d="M5 4h5v4H5Zm10 0h5v4h-5ZM10 8h5v4h-5ZM5 12h5v4H5Zm10 0h5v4h-5Z" fill="currentColor" stroke="none"/></svg><span>${finishing ? "Finish lap" : "Session over"}</span>`;
      container.setAttribute("aria-label",expired ? (finishing ? "Chequered flag. Finish your timed lap." : "Qualifying session over") : `${school ? "Practice time" : "Qualifying time remaining"}: ${clock.textContent}`);
    }
    el("tyre-state").textContent = p.pit?.stage==="service" ? "Service hold · waiting for crew" : p.garage ? "Ready · press W / ↑ to leave" :
      p.qState === "in" ? "In lap · return to pits; extra laps untimed" :
      p.qState === "out" ? race.tyreTemperatureEnabled ? "Out lap · warm the tyres" : "Out lap · prepare your timed lap" :
      p.qInvalid ? "Timed lap invalid · track limits" : "Timed lap · best " + time(p.bestLap);
    el("pit-hint").textContent = p.pit?.stage === "service" ? `SERVICE HOLD · ${Math.max(0,p.pit.timer).toFixed(1)}s remaining. Choose tyres or aero; departure stays locked until service finishes.` : p.garage ?
      `Crew ready. Three-lap fuel loaded. Press W / ↑ when ready. Choose tyres and aero for your next outing. ${race.nextSetId === p.tyreSet.id ? "Fitted tyres retained." : race.nextSetId + " selected."}` :
      p.pit?.stage === "service" ? `SERVICE HOLD · ${Math.max(0,p.pit.timer).toFixed(1)}s remaining. Controls locked.` :
      p.pit && !p.pit.serviced ? race.autoPitLimiter ? `Automatic pit stop · box in ${Math.round(Math.max(0,p.pit.boxDistance-p.pit.distance))}m.` : `Box ${Math.round(p.pit.boxDistance-p.pit.distance)}m · brake inside the outline. R reverses.` :
      p.pit?.serviced && race.autoPitLimiter ? "Automatic pit exit · no throttle needed. Control returns at the exit line." : "Out → timed → in. In-lap pit entry is automatic when you steer into the pit road. Service holds you in the box; choose tyres before leaving.";


    if(p.garage && p.pit?.stage!=="service") { el("pit-title").textContent="GARAGE · " + p.tyreSet.id; el("pit-button").textContent="LEAVE PIT BOX · W / ↑"; }
    if (!p.pit)
      el("pit-title").textContent = p.tyreSet?.id + " · " + race.stage.name;

    if(!mobileInput){
      el("qualifying-cutoff").replaceChildren();
      const divider='<div class="quali-cutoff-line" role="separator" aria-label="Qualifying cutoff"><span>CUTOFF</span></div>';
      el("timing").innerHTML=qualifyingTimingWindow(race.weekend,p.id,race.stage.name).map(row=>{
        const c=order.find(car=>car.id===row.id);
        if(!c)return "";
        return `${row.cutoffBefore ? divider : ""}<div class="timing-row quali-row compact-quali-row ${c.player ? "me" : ""}" style="--team:${c.team.color}"><span class="rank">${row.rank}</span><i class="stripe"></i><span class="name" title="${escapeHTML(c.name)}">${escapeHTML(c.name)}</span><span class="gap">${row.time===null ? "—" : time(row.time)}</span></div>${row.cutoffAfter ? divider : ""}`;
      }).join("");
    }else{
    const progress=qualifyingProgress(race.weekend,21,race.stage.name), cutoffCar=order.find(c=>c.id===progress.cutoffId);
    const margin=progress.margin;
    let status=progress.final ? (progress.playerTime===null ? "Q3 · bank a valid lap" : progress.margin===null ? "Q3 · fight for pole" : progress.rank===1 ? "PROVISIONAL POLE" : `${progress.margin.toFixed(3)}s behind pole`) : progress.playerTime===null ? "No time set · bank a valid lap" :
      progress.through ? (margin===null ? "Currently through · rivals still setting times" : `${Math.abs(margin).toFixed(3)}s ahead of elimination`) :
      margin===null ? "Outside cutoff · bank a valid lap" : `${Math.max(.001,margin).toFixed(3)}s needed to get through`;
    if(race.weekend.sessions.some(session=>session.name===race.stage.name))status=progress.final&&progress.rank===1 ? "POLE POSITION" : "FINAL CLASSIFICATION";
    el("qualifying-cutoff").innerHTML=`<b>${progress.final ? "FINAL QUALIFYING" : "P"+progress.keep+" KNOCKOUT CUTOFF"}</b><span>${progress.cutoffTime===null ? "Cutoff time not set" : escapeHTML(cutoffCar?.name || "")+" · "+time(progress.cutoffTime)}</span><strong class="${progress.through ? "safe" : "danger"}">P${progress.rank} · ${status}</strong>`;
    el("timing").innerHTML=order.map((c,i)=>{
      const lap=qualifyingClassification(race.weekend,race.stage.name).results.find(t=>t.id===c.id);
      const cutoff=!progress.final && i===progress.keep-1;
      return `<div class="timing-row quali-row ${c.player ? "me" : ""} ${cutoff ? "cutoff-row" : ""}" style="--team:${c.team.color}"><span class="rank">${i+1}</span><i class="stripe"></i><span class="name" title="${escapeHTML(c.name)}">${escapeHTML(c.name)}</span><span class="q-status">${qualifyingStatus(c)}</span><span class="gap">${lap ? time(lap.time) : "—"}</span></div>${cutoff ? '<div class="cutoff-divider">↑ THROUGH · ELIMINATED ↓</div>' : ''}`;
    }).join("");
    }

  }
  if (race.weekend) {
    const available = selectableSets(
      p.tyreInventory,
      race.qualifying ? race.weekend.phase : "R",
      race.qualifying ? null : p.tyreSet?.id,
    );
    if (!available.some((t) => t.id === race.nextSetId)) {
      const next =
        available
          .filter((t) => t.compound !== p.tyre)
          .sort((a, b) => a.wear - b.wear)[0] || available[0];
      race.nextSetId = next?.id;
      race.nextTyre = next?.compound || race.nextTyre;
    }
    app.querySelectorAll("[data-pit-tyre]").forEach((b) => {
      b.classList.toggle("active", b.dataset.pitTyre === race.nextTyre);
      b.setAttribute("aria-pressed", b.dataset.pitTyre === race.nextTyre);
    });
    const keep=!!race.qualifying && race.nextSetId===p.tyreSet.id;
    race.keepCurrentTyres=keep;
    app.querySelectorAll("[data-pit-tyre]").forEach(b=>{
      const current=b.dataset.pitTyre==="current";
      const active=current ? keep : !keep && b.dataset.pitTyre===race.nextTyre;
      b.classList.toggle("active",active);b.setAttribute("aria-pressed",active);
      b.disabled=(!!p.pit && !p.garage && !(race.qualifying && p.pit.stage==="service")) || (!current && !available.some(t=>t.compound===b.dataset.pitTyre));
      if(current) b.style.setProperty("--tyre",TYRES[p.tyre].color);
    });
    const next=available.find(t=>t.id===race.nextSetId);
    if(school && race.qualifying && school.state.outings===1 && !school.state.mediumChosen)app.querySelectorAll("[data-pit-tyre]").forEach(b=>b.disabled=true);
    el("race-set-note").textContent=keep ? "Current tyres retained · "+Math.round(Math.max(0,1-p.wear)*100)+"% condition" : next ? "Next set: "+tyreSetLabel(next) : "No replacement sets remaining";
    el("tyre-name").textContent =
      TYRES[p.tyre].name.toUpperCase() + " · " + p.tyreSet.id;
  }
  const aeroChoice=race.nextAeroSpec || p.aeroSpec || "balanced",aeroChanged=aeroChoice!==p.aeroSpec;
  app.querySelectorAll("[data-pit-aero]").forEach(button=>{const active=button.dataset.pitAero===aeroChoice;button.classList.toggle("active",active);button.setAttribute("aria-pressed",active);button.disabled=!race.canSelectAero();});
  el("race-aero-note").textContent=`Aero: ${AERO_PACKAGES[aeroChoice].name}${aeroChanged ? " · +10s service" : ""}${p.pit?.stage==="service" ? " · "+p.pit.timer.toFixed(1)+"s left" : ""}`;
  el("browse-race-aero").textContent=!aeroUnlocked(p.upgrades) ? "Aero locked" : aeroChanged ? "Aero · +10s" : "Choose aero";
  el("browse-race-tyres").disabled=!!p.pit && !p.garage && !(race.qualifying && p.pit.stage==="service");
  if(mobileInput){
    el("pit-button").textContent=el("pit-button").textContent.replace(/ · (?:B|W \/ ↑)/g,"");
    el("pit-title").textContent=el("pit-title").textContent.replace(" · T CYCLES","");
    el("browse-race-tyres").textContent="Choose tyre set";
    const compact=el("mobile-pit-note");
    if(compact)compact.textContent=race.qualifying && p.garage
      ? `GARAGE · ${p.tyreSet.id} · ${TYRES[p.tyre].name}`
      : el("pit-title").textContent+" · "+(race.player.tyreInventory && race.nextSetId ? race.nextSetId+" " : "")+TYRES[race.nextTyre].name;
    limiter.textContent=limiter.textContent.replace(" · L","");
    el("pit-hint").textContent=mobileLessonText(el("pit-hint").textContent,settings.mobileSteering);
  }
  if(!mobileInput){
    const request=app.querySelector("[data-action=pit]");
    request.title=el("pit-button").textContent;
    el("pit-button").textContent=p.garage && p.pit?.serviced ? p.qExitRequested ? "Waiting for gap" : "Leave box" : p.pit?.stage==="service" ? `Service ${p.pit.timer.toFixed(1)}s` : p.pit ? "In pit lane" : race.pitRequested ? "Cancel pit" : "Request pit";
  }
  el("countdown").classList.toggle("hidden", race.countdown <= 0);
  el("countdown")
    .querySelectorAll("i")
    .forEach((l, i) => l.classList.toggle("on", race.countdown < 4 - i * 0.6));
}
function pauseRace() {
  if (!race || race.done || app.querySelector(".modal-backdrop:not(#pause-modal)")) return;
  if(mobileInput && app.querySelector(".tower.mobile-open"))el("mobile-timing").click();
  paused = !paused;
  keys.clear();
  touch = { steer: 0, throttle: false, brake: false };mobileControls.reset();
  if (paused) {
    const b = document.createElement("div");
    b.className = "modal-backdrop";
    b.id = "pause-modal";
    b.innerHTML = `<section class="modal"><div class="eyebrow">TAKE A BREATHER</div><h2>Race paused</h2><div class="pause-controls"><p><b>Driving</b><span>W / ↑ Accelerate · S / ↓ Brake, then reverse<br>A / D or ← / → Steer</span></p><p><b>Pit stops</b><span>B Request a stop, then steer into the pit road<br>${race.autoPitLimiter ? "Automatic speed, stop, service and exit" : "L Toggle limiter · R Reverse in the pit lane"}</span></p><p><b>Strategy</b><span>F Pace ← · G Pace → (Save / Balanced / Push)<br>T Cycle next tyres · 1–5 Select S / M / H / I / W<br>6 High downforce · 7 Balanced · 8 Low drag · +10s pit service</span></p><p><b>View & pause</b><span>M Change map view · P / Esc Resume</span></p></div>${engineerBriefHTML(race)}<button class="primary" id="resume">BACK TO THE RACE →</button><button class="ghost" id="retire" style="width:100%;margin-top:12px">Retire race</button><p class="hint">Career retirement records a DNF. No sponsor bonus.</p></section>`;
    if(mobileInput)b.querySelector(".pause-controls").innerHTML=`<p><b>Drive</b><span>Hold GAS · BRAKE slows then reverses.<br>${settings.mobileSteering==="arrows" ? "Use left/right arrows." : "Drag the steering pad; release to centre."}</span></p><p><b>Strategy</b><span>Tap a pace mode or Choose tyre set.<br>Tap Pit, then steer into the separate pit entrance.</span></p><p><b>Display</b><span>Timing opens the full board. Map shows the circuit.<br>Settings changes steering and tyre temperature.</span></p>`;
    app.appendChild(b);
    el("resume").onclick = pauseRace;
    if(school) {el("retire").textContent="LEAVE RACE SCHOOL";el("retire").nextElementSibling.textContent="School checkpoints are saved. Career is unaffected.";}
    el("retire").onclick = () => {
      if(school){school.save(localStorage);menu();return;}
      if (race.qualifying) {
        race.endRun();
        paused = false;
        showResults();
        return;
      }
      race.player.dnf = true;
      race.done = true;
      race.result = {
        position: 22,
        difficulty:race.difficulty,
        legal: false,
        dnf: true,
        time: race.time,
        stops: race.player.stops,
        contacts: race.player.contacts,
        penalties: race.player.penalties,
        bestLap: race.player.bestLap,
        fuel: race.player.fuel,
        raceFormat:race.setup.raceFormat,
      };
      paused = false;
      showResults();
    };
  } else {el("pause-modal")?.remove();ensureAudio();}
}
function showResults() {
  updateMobileSession();
  if(school){
    showSchoolDialog("Try this exercise again", "Your outing ended before the lesson was complete. Restart from the last garage checkpoint; your career is unaffected.",[{label:"RETRY EXERCISE",action:()=>startSchoolLesson(school.state.phase==="race")},{label:"LEAVE SCHOOL",action:leaveSchool}]);return;
  }
  if (race.qualifying) {
    if (race.settled) return;
    race.settled = true;
    save();
    const run=race,w=run.weekend,stage=run.stage.name,best=w.results.find(r=>r.id===21)?.time ?? run.player.bestLap;
    const expired=w.elapsed>=run.stage.duration;
    if(expired && stage==="Q3"){completeQualifying(run);return;}
    const b=document.createElement("div");b.className="modal-backdrop";b.id="qualifying-results";
    b.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="qualifying-results-title"><div class="eyebrow">${stage} / ${expired ? "SESSION" : "OUTING"} COMPLETE</div><h2 id="qualifying-results-title">${Number.isFinite(best) ? "Lap time banked" : "No valid lap"}</h2><p class="hint">${expired ? "Confirm the completed classification to continue." : "Session still open · positions are provisional until all qualifying runs finish."}</p><p class="muted">Best: ${time(best)} · ${run.player.tyreSet.id} · ${Math.round(Math.max(0,1-run.player.wear)*100)}% tyre life remaining.</p>${!expired ? '<button class="primary" id="q-return">RETURN TO PIT BOX →</button>' : ''}<button class="${expired ? "primary" : "ghost end-session"}" id="q-advance" ${!run.canEndSession() ? "disabled" : ""}>${run.sessionAction()}</button></section>`;
    app.appendChild(b);
    el("q-return")?.addEventListener("click",()=>{
      const next=resumeQualifyingSession(run,career.upgrades,career.profile);
      if(next)openQualifyingGarage(next);else showQualifyingRecovery(run);
    });
    el("q-advance").onclick=()=>completeQualifying(run);
    b.addEventListener("keydown",event=>garageDialogKeys(event,b,()=>{}));el("q-advance").focus();
    return;
  }

  if (race.settled) return;
  race.settled = true;
  keys.clear();
  touch = { steer: 0, throttle: false, brake: false };mobileControls.reset();
  if (race.mode === "career") {
    career.aeroSpec=race.player.aeroSpec;
    race.result.field ||= race.raceField();
    settlement = settleCareer(career, race.result);
    save();
  }
  const r = race.result;
  const b = document.createElement("div");
  b.className = "modal-backdrop";
  b.id = "results";
  b.innerHTML = `<section class="modal"><div class="eyebrow">${race.mode === "career" ? escapeHTML(race.player.name) + " / " + race.player.team.name : escapeHTML(TRACK.name) + " / RACE COMPLETE"}</div><h2>${r.dnf ? "A race to learn from" : !r.legal ? "Tyre rule infringement" : r.position === 1 ? "Race winner" : "Race complete"}</h2><div class="result-hero"><div><div class="display">${r.dnf ? "DNF" : !r.legal ? "DQ" : "P" + r.position}</div><small>${!r.legal && !r.dnf ? "Two different dry compounds were required." : "22-car grid · " + r.stops + " pit stops"}</small></div><div class="stat"><span>Race time</span><strong style="font-size:30px">${time(r.time)}</strong></div></div><div class="result-line"><span>Best lap</span><b>${time(r.bestLap)}</b></div><div class="result-line"><span>Track limits / penalty seconds</span><b>${race.player.trackLimits} / ${race.player.penaltySecondsTotal || 0}s</b></div><div class="result-line"><span>Fuel remaining</span><b>${r.fuel.toFixed(1)} laps</b></div>${settlement ? `<div class="result-line"><span>Championship points</span><b>+${settlement.points}</b></div><div class="result-line"><span>Race earnings</span><b>${money(settlement.prize)}</b></div>${settlement.difficultyBonus ? `<div class="result-line"><span>${DIFFICULTIES[settlement.difficulty].name} difficulty bonus · included</span><b>+${money(settlement.difficultyBonus)}</b></div>` : ""}<div class="result-line"><span>${settlement.sponsor || "Sponsor"} · ${settlement.met ? "condition met" : "no payout"}</span><b>${money(settlement.bonus)}</b></div>${settlement.commercialBonus ? `<div class="result-line"><span>Commercial uplift · included in sponsor payout</span><b>+${money(settlement.commercialBonus)}</b></div>` : ""}${settlement.seasonEnded ? `<div class="result-line"><span>Season completed · points bonus</span><b>${money(settlement.seasonBonus)}</b></div>` : ""}<div class="result-line"><span>Available budget</span><b>${money(career.cash)}</b></div>` : `<div class="result-line"><span>${r.raceFormat==="sprint"?"Sprint":"Grand Prix"} points</span><b>+${!r.dnf&&r.legal?racePoints(r.position,r.raceFormat):0}</b></div><p class="muted">Try a different starting compound or fuel load to explore another strategy.</p>`}<button class="primary" id="continue">${race.mode === "career" ? "RETURN TO GARAGE" : "BACK TO PADDOCK"} →</button>${saveWarning ? `<p class="storage-warning">${saveWarning}</p>` : ""}</section>`;
  app.appendChild(b);
  el("continue").onclick = () => {
    notice = settlement
      ? `${money(settlement.prize + settlement.bonus + settlement.seasonBonus)} earned. Choose your next contract and develop your car.`
      : "";
    menu();
  };
}
function leaveSchool(){school?.save(localStorage);keys.clear();touch={steer:0,throttle:false,brake:false};mobileControls.reset();menu();}
function openSchool(){
  const saved=loadSchool(localStorage);school=new RaceSchool(saved);
  if(saved && !["intro","complete"].includes(saved.phase)) {
    showSchoolDialog("Welcome back to Race School", "Resume from your last garage checkpoint. Partial outings restart there, keeping your completed lessons and used tyre sets.",[
      {label:"RESUME LESSON",action:()=>{const phase=school.state.phase;startSchoolLesson(phase==="race");if(phase==="qualifyingComplete"){school.state.phase=phase;schoolMilestone(phase);}}},
      {label:"START AGAIN",action:()=>{school=new RaceSchool();showSchoolIntro(0);}},
      {label:"BACK TO MENU",action:leaveSchool}
    ]);
  } else {if(saved?.phase==="complete")school=new RaceSchool();showSchoolIntro(school.state.intro || 0);}
}
function showSchoolIntro(index){
  race=null;paused=false;school.state.phase="intro";school.state.intro=index;school.save(localStorage);
  const card=SCHOOL_INTRO[index];
  app.innerHTML=header()+`<main class="school-shell"><section class="modal school-intro"><div class="eyebrow">RACE SCHOOL · ${index+1} / ${SCHOOL_INTRO.length}</div><h2>${card.title}</h2><div class="school-dialog-text">${schoolCopy(card.text)}</div><div class="school-pages">${SCHOOL_INTRO.map((c,i)=>`<button class="ghost ${i===index ? "active" : ""}" data-school-page="${i}" aria-label="Lesson ${i+1}: ${c.title}" aria-pressed="${i===index}">${i+1}</button>`).join("")}</div><div class="school-buttons">${index ? '<button class="ghost" id="school-back">BACK</button>' : ""}<button class="primary" id="school-next">${index===SCHOOL_INTRO.length-1 ? "START GUIDED QUALIFYING →" : "NEXT →"}</button></div><button class="ghost school-exit" id="school-exit">BACK TO MAIN MENU</button></section></main>`;
  app.querySelectorAll("[data-school-page]").forEach(b=>b.onclick=()=>showSchoolIntro(+b.dataset.schoolPage));
  el("school-back")?.addEventListener("click",()=>showSchoolIntro(index-1));
  el("school-next").onclick=()=>index===SCHOOL_INTRO.length-1 ? startSchoolLesson(false) : showSchoolIntro(index+1);
  el("school-exit").onclick=leaveSchool;
}
function schoolCopy(text){
  const copy=speedText(mobileInput ? mobileLessonText(text,settings.mobileSteering) : text,settings.speedUnit);
  const lines=copy.split(/\n|(?<=[.!?])\s+(?=[A-Z])/).map(line=>line.trim()).filter(Boolean);
  return `<ul class="school-copy">${lines.map(line=>`<li>${escapeHTML(line)}</li>`).join("")}</ul>`;
}
function showSchoolDialog(title,text,actions){
  el("school-dialog")?.remove();paused=true;keys.clear();touch={steer:0,throttle:false,brake:false};mobileControls.reset();
  const box=document.createElement("div");box.className="modal-backdrop";box.id="school-dialog";
  box.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="school-dialog-title"><div class="eyebrow">RACE SCHOOL</div><h2 id="school-dialog-title">${title}</h2><div class="school-dialog-text">${schoolCopy(text)}</div>${actions.map((a,i)=>`<button class="${i===0 ? "primary" : "ghost school-exit"}" data-school-dialog="${i}">${mobileInput ? mobileLessonText(a.label,settings.mobileSteering) : a.label}</button>`).join("")}</section>`;
  app.appendChild(box);box.querySelectorAll("[data-school-dialog]").forEach(b=>b.onclick=()=>{box.remove();actions[+b.dataset.schoolDialog].action();});box.querySelector("button").focus();
}
function startSchoolLesson(practice=false){
  school.weatherLesson=null;
  race=practice ? school.createPractice() : school.createQualifying();school.save(localStorage);
  keys.clear();touch={steer:0,throttle:false,brake:false};mobileControls.reset();paused=false;accumulator=0;overview=false;
  raceUI();mountSchoolGuide();
  showSchoolDialog(practice ? "Your first race start" : school.state.outings ? "Second outing: use Mediums" : "First outing: use Softs",practice ? "Lights out → accelerate with W / ↑.\nF moves left toward Save; G moves right toward Push.\nPress B to request a stop.\nSteer into the separate pit entrance.\nService and race pit exit are automatic." : "Dry practice: Softs first, Mediums second.\nW / ↑ leaves the box · S / ↓ brakes · A/D steers.\nF moves left toward Save; G moves right toward Push.\nEach outing: out lap → timed lap → in lap.\nEnter the pits on your in lap — no B needed.\nWait for service; leave when ready.",[
    {label:practice ? "START PRACTICE →" : "READY TO DRIVE →",action:()=>{paused=false;keys.clear();if(!practice && !school.state.outings)showSchoolWeather();}},
    {label:"LEAVE SCHOOL",action:leaveSchool}
  ]);
}
function mountSchoolGuide(){
  if(race.qualifying){el("finish-qualifying-run").hidden=true;if(mobileInput)el("clock").previousElementSibling.textContent="PRACTICE TIME";}
  const guide=document.createElement("section");guide.id="school-guide";guide.className="school-guide";
  guide.innerHTML=`<div class="eyebrow" id="school-progress"></div><h3 id="school-goal"></h3><div id="school-instruction"></div><div class="school-guide-actions"><button class="primary school-weather-continue" id="school-weather-continue" hidden>GOT IT · READY TO DRIVE →</button><div class="school-guide-actions" id="school-normal-actions"><button class="ghost" id="school-weather">WEATHER FORECAST</button><button class="ghost" id="school-explain">EXPLAIN AGAIN</button><button class="ghost" id="school-recover">RECOVER CAR</button>${race.qualifying ? '<button class="ghost" id="school-reset">RESET OUTING</button>' : ""}<button class="ghost" id="school-leave">LEAVE SCHOOL</button></div></div>`;
  app.appendChild(guide);if(mobileInput)el("school-explain").textContent="LESSON HELP";
  el("school-explain").onclick=()=>{const g=school.guide(race);const actions=[{label:"BACK TO PRACTICE",action:()=>{paused=false;resetDrivingInput();}}];
    if(mobileInput){actions.push({label:"RECOVER CAR",action:()=>{school.recover(race);paused=false;resetDrivingInput();}});if(race.qualifying)actions.push({label:"RESET OUTING",action:()=>startSchoolLesson(false)});actions.push({label:"WEATHER FORECAST",action:()=>{paused=false;showSchoolWeather();}},{label:"LEAVE SCHOOL",action:leaveSchool});}
    showSchoolDialog(g.title,g.text,actions);
  };
  el("school-weather").onclick=showSchoolWeather;
  el("school-weather-continue").onclick=()=>{paused=school.weatherLesson.wasPaused;school.weatherLesson=null;keys.clear();updateSchoolGuide();};
  el("school-recover").onclick=()=>school.recover(race);
  if(el("school-reset"))el("school-reset").onclick=()=>startSchoolLesson(false);
  el("school-leave").onclick=leaveSchool;updateSchoolGuide();
}
function showSchoolWeather(){
  school.weatherLesson={wasPaused:paused};paused=true;keys.clear();touch={steer:0,throttle:false,brake:false};mobileControls.reset();updateHUD();
  el("school-weather-continue").focus();
}
function updateSchoolGuide(){
  const weatherLesson=!!school.weatherLesson;
  el("school-guide").classList.toggle("mobile-weather-lesson",weatherLesson);
  el("school-normal-actions").hidden=weatherLesson;
  el("school-weather-continue").hidden=!weatherLesson;
  app.querySelector(".weather-timeline")?.classList.toggle("school-weather-highlight",weatherLesson);

  const g=weatherLesson ? {title:"Read the weather forecast below",text:"NOW marks the current time; look right for the next six minutes.\nBlue = rain. Green = water on the track. Higher lines mean more.\nRain can stop while the track stays wet — drying takes time.\nUse Intermediates for damp roads and Wets for standing water. Switch to slicks as it dries.\nThis practice is dry; watch this bar in qualifying and races."} : school.guide(race);el("school-goal").textContent=g.title;el("school-instruction").innerHTML=schoolCopy(g.text);
  el("school-progress").textContent=race.qualifying ? `RACE SCHOOL · ${school.state.outings} / 2 OUTINGS COMPLETE` : "RACE SCHOOL · OPTIONAL RACE PRACTICE";
  app.querySelectorAll(".school-highlight").forEach(n=>n.classList.remove("school-highlight"));
  if(g.highlight)app.querySelector(g.highlight)?.classList.add("school-highlight");
  const arrow=g.arrow && g.highlight ? app.querySelector(g.highlight) : null;
  app.querySelectorAll(".school-arrow-target").forEach(n=>{if(!n.closest("#tyre-set-picker"))n.classList.toggle("school-arrow-target",n===arrow);});
  arrow?.classList.add("school-arrow-target");
}
function schoolMilestone(event){
  school.save(localStorage);
  if(event==="tyreChange")showSchoolDialog("Outing 2: choose Mediums",`Soft lap: ${time(school.state.lapTimes[0])}${school.state.lapValid[0]===false ? " · deleted for track limits" : ""}.\nOuting 1 complete — next is Outing 2.\nClick Choose tyre set, then choose Mediums.\nYour used Softs remain available.\nThis change is a school exercise, not a qualifying rule.`,[{label:"CONTINUE TO OUTING 2 →",action:()=>{paused=false;keys.clear();updateHUD();}},{label:"LEAVE SCHOOL",action:leaveSchool}]);
  if(event==="qualifyingComplete")showSchoolDialog("Two outings completed",`Soft: ${time(school.state.lapTimes[0])}${school.state.lapValid[0]===false ? " · deleted" : ""}.\nMedium: ${time(school.state.lapTimes[1])}${school.state.lapValid[1]===false ? " · deleted" : ""}.\nBoth outings and pit stops are complete.\nUsed sets keep their wear.\nIn real qualifying, watch the cutoff and use Time 2× / 4× / 8× while waiting.`,[
    {label:"PRACTISE RACE START & B PIT REQUEST →",action:()=>startSchoolLesson(true)},
    {label:"INSPECT USED TYRES",action:()=>{schoolMilestone('qualifyingComplete');showTyreSetPicker();}},
    {label:"FINISH SCHOOL",action:()=>{school.complete();school.save(localStorage);leaveSchool();}}
  ]);
  if(event==="practiceComplete")showSchoolDialog("Ready for your Grand Prix", "Grid launch, pace mode and B request practised.\nPit entry, service and exit completed.\nDry races need two different dry compounds.\nKeep enough fuel and watch penalties.\nCareer adds sponsors, prize money and upgrades.",[{label:"BACK TO MAIN MENU →",action:leaveSchool},{label:"REPLAY RACE PRACTICE",action:()=>startSchoolLesson(true)}]);
}
function showHelp() {
  if (help) return;
  help = true;
  const b = document.createElement("div");
  b.className = "modal-backdrop";
  b.id = "help";
  b.innerHTML = `<section class="modal"><div class="eyebrow">DRIVER BRIEFING</div><h2>Find your rhythm.</h2><div class="help-grid"><div><h3>Drive</h3><p>W / ↑ accelerates, S / ↓ brakes then reverses once stopped. A/D or ←/→ steer. Brake before the turn, ease off through it, accelerate on exit. Touch controls appear on mobile.</p></div><div><h3>Strategy</h3><p>Softs give more grip but wear quickly. Mediums balance pace and life. Hards run longer. Grand Prix races require two different dry compounds unless you use Intermediates or Wets. Sprints have no compulsory tyre change and award 8–1 points to the first eight. Career Grands Prix are 24 laps and Sprints 12 laps; Quick Race offers 12–40 laps.</p><h3>Slipstream</h3><p>Tuck in behind a car on a straight to reduce drag. A strong tow allows a little extra top speed, which fades over a few seconds after pulling out. Your speed readout turns lime while receiving a tow.</p></div><div><h3>Pit stops</h3><p>Press B to request a stop, then steer off the track into the separate pit road alongside the main straight. Automatic pit stops handle lane speed, the box stop, service and exit without pedals. Disable this in Settings to use manual pedals and L limiter control. Manual speeding adds 5 seconds. The wide lane has smooth merges and assisted steering; gas/brake still control speed. Release the limiter with L after exit. 1/2/3/4/5 selects S/M/H/I/W. Stop in the marked box with S; R reverses if you overshoot. Service holds the car. Three track-limit warnings precede a 5-second penalty.</p></div><div><h3>Pace & strategy</h3><p>Save gives gentler power to extend stints and recover hot tyres. Balanced is sustainable race pace. Push adds acceleration and top speed, using more fuel and tyre life. F moves left toward Save; G moves right toward Push. No refuelling, no battery. Fuel runs out? Coast to a stop and retire.</p></div><div><h3>Career</h3><p>Name your driver and choose any team. Complete Q1, Q2 and Q3 knockouts before each race. The weekend tyre pool is shared: choose individual sets and save fresh tyres for the race. Start in a slower development car. Reset your career from the garage to start again. Sign one sponsor per race, earn position money and upgrade power, grip, tyre life or pit service. All 12 circuits form a season.</p></div><div><h3>Your controls</h3><p>P or Esc pauses and resumes. M toggles map view. Engine sound starts automatically; toggle it with Sound on / off. Your browser saves career progress automatically; quick races do not affect it.</p></div></div><button class="primary" id="close-help">READY TO RACE →</button></section>`;
  if(mobileInput)b.querySelectorAll("p").forEach(p=>p.textContent=mobileLessonText(p.textContent,settings.mobileSteering));
  app.appendChild(b);
  el("close-help").onclick = () => {
    b.remove();
    help = false;
  };
}
function ensureAudio() {
  if(muted) return;
  if(!audio) {
    try {
      const context=new AudioContext(),osc=context.createOscillator(),
        gain=context.createGain(),filter=context.createBiquadFilter();
      osc.type="sawtooth";filter.type="lowpass";filter.frequency.value=1300;
      gain.gain.value=0;osc.connect(filter).connect(gain).connect(context.destination);
      osc.start();audio={context,osc,gain};
    } catch { muted=true; }
  }
  audio?.context.resume().catch(()=>{});
}
function toggleAudio() {
  muted=!muted;
  ensureAudio();
  app.querySelector("[data-action=sound]").textContent=muted ? "Sound off" : "Sound on";
  refreshHUDIcons();
}
window.addEventListener("keydown", (e) => {
  if(el("qualifying-progress")){e.preventDefault();return;}
  if (
    (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key) || e.key===" "&&!e.target.closest("button")) &&
    race
  )
    e.preventDefault();
  if (e.target.matches("input,select,textarea") || e.target.isContentEditable) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (e.repeat) return;
  if (k === "p") {
    e.preventDefault();pauseRace();return;
  }
  if (k === "escape") {
    if(el("school-dialog")){e.preventDefault();return;}
    if(el("aero-picker")){el("aero-picker").querySelector("[data-close-aero]").click();return;}
    if(el("tyre-set-picker")) {el("tyre-set-picker").querySelector("[data-close-tyres]").click();return;}
    if(el("settings-modal")) {el("close-settings").click();return;}
    if (el("reset-career-modal")) {
      el("cancel-reset").click();
      return;
    }
    if (help) {
      el("close-help")?.click();
      return;
    }
    pauseRace();
  }
  if (!race || paused || landscapeGate.blocked || race.done) return;
  // Driving shortcuts return focus to the game instead of leaving a selected
  // toolbar button outlined (or ready to react to an unrelated Space/Enter).
  if(["w","a","s","d","arrowup","arrowdown","arrowleft","arrowright","b","l","r","t","f","g","1","2","3","4","5","6","7","8"].includes(k) && e.target.closest("button"))e.target.closest("button").blur();
  if (k === "b") {e.preventDefault();race.requestPit();updateHUD();}
  if (k === "l") {e.preventDefault();race.togglePitLimiter();updateHUD();}
  if (!mobileInput && ["1", "2", "3", "4", "5"].includes(k))
    setPitTyre(["S", "M", "H", "I", "W"][+k - 1]);
  if (!mobileInput && ["6","7","8"].includes(k)){race.selectAero({6:"downforce",7:"balanced",8:"lowDrag"}[k]);updateHUD();}
  if (!mobileInput && k === "t") {
    const choices = ["S", "M", "H", "I", "W"].filter(tyre => !race.weekend || selectableSets(race.player.tyreInventory, race.qualifying ? race.weekend.phase : "R", race.qualifying ? null : race.player.tyreSet?.id).some(t => t.compound === tyre));
    if(race.qualifying) choices.unshift("current");
    if(!choices.length) return;
    setPitTyre(choices[(choices.indexOf(race.keepCurrentTyres ? "current" : race.nextTyre)+1)%choices.length]);
  }
  if (k === "m") overview = !overview;
  if (k === "f" || k === "g") {
    const mode=stepPaceMode(race.player.drive,k==="f" ? -1 : 1);
    if(mode!==race.player.drive)setDrive(mode);
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  touch = { steer: 0, throttle: false, brake: false };mobileControls.reset();
  if (race && !paused && !race.done) pauseRace();
});
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (race && !paused && !landscapeGate.blocked && !race.done) {
    accumulator += dt*(race.qualifying ? race.timeScale : 1);
    const input = {
      reverse: keys.has("r") || touch.reverse,
      throttle: keys.has("w") || keys.has("arrowup") || touch.throttle,
      brake: keys.has("s") || keys.has("arrowdown") || touch.brake,
      steer:
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0) +
        touch.steer,
    };
    while (accumulator >= 1 / 60) {
      race.step(1 / 60, input);
      accumulator -= 1 / 60;
      if(school){const event=school.observe(race);if(event)schoolMilestone(event);}
      if(paused){accumulator=0;break;}
      if (race.done) {
        showResults();
        break;
      }
    }
    if (race.weekend) {
      weekendSaveClock += dt;
      if (weekendSaveClock > 1) {
        save();
        weekendSaveClock = 0;
      }
    }
    hudTimer += dt;
    if (hudTimer > 0.1) {
      updateHUD();
      hudTimer = 0;
    }
  }
  if(!el("qualifying-progress"))renderer.draw(race, !race, overview, dt, race && !paused && !race.done ? accumulator/(1/60) : 1);
  if (audio) {
    const sound=engineSoundFrame(race,paused || landscapeGate.blocked,muted,keys.has("w") || keys.has("arrowup") || touch.throttle);
    const rev=sound.frequency;
    audio.osc.frequency.setTargetAtTime(rev, audio.context.currentTime, 0.06);
    audio.gain.gain.setTargetAtTime(
      sound.gain,
      audio.context.currentTime,
      0.1,
    );
  }
  requestAnimationFrame(loop);
}
window.addEventListener("resize",updateMobileSession);
window.matchMedia("(pointer: coarse)").addEventListener("change",e=>{mobileInput=e.matches;document.body.classList.toggle("mobile-game",mobileInput);if(race)mountMobileControls();else menu();updateMobileSession();});
document.addEventListener("visibilitychange",()=>{if(document.hidden){resetDrivingInput();if(race && !paused && !race.done)pauseRace();}});
menu();
requestAnimationFrame(loop);
