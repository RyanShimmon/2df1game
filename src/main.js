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
  Q_STAGES,
  pendingFirstRuns,
  qualifyingReady,
  getQualifyingFuel,
  qualifyingProgress,
  qualifyingStatus,
  selectableSets,
  ensureWeekend,
  validWeekend,
  QualifyingRun,
  finishQualifyingStage,
  finishRemainingQualifying,
  prepareRace,
  stageOrder,
  weekendSchedule,
  migrateWeekend,
  startRaceWeather,
} from "./weekend.js";
import { forecast, recommendedTyre, rainAt, weatherTimeline } from "./weather.js";
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
let setup = { track:"northline", laps: 16, startingPosition: 22, tyre: "M", fuel: 18.5, weather: "showers" },
  keys = new Set(),
  touch = { steer: 0, throttle: false, brake: false },
  last = performance.now(),
  accumulator = 0,
  hudTimer = 0,
  audio = null,
  muted = false;
let settings={autoPitLimiter:true,difficulty:"normal"};
try {
 const saved=JSON.parse(localStorage.getItem("v10.settings") || "{}");
 settings.autoPitLimiter=saved.autoPitLimiter !== false;
 settings.difficulty=normalizeDifficulty(saved.difficulty);
} catch {}
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
let draftTeam = 10;
let selectedWeekendSet = null,
  weekendSaveClock = 0;
const el = (id) => document.getElementById(id);
function save() {
  try {
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
function header() {
  return `<header class="topbar"><div class="brand">V10<span>GRAND PRIX</span></div><div class="version"><i class="dot"></i> VERSION 1.1</div></header>`;
}
function tabs() {
  return `<div class="tabs"><button class="tab ${screen === "quick" ? "active" : ""}" data-screen="quick">Quick race</button><button class="tab ${screen === "career" ? "active" : ""}" data-screen="career">Career garage</button><button class="tab" data-action="help">How to drive ↗</button><button class="tab" data-action="settings">Settings</button></div>`;
}
function setupCard() {
  const scheduled = screen === "career" ? weekendSchedule(career.round) : null;
  if (scheduled) {
    const key = career.season + ":" + career.round;
    if (setup.roundKey !== key) {
      setup.fuel = +(scheduled.laps * 1.15).toFixed(1);
      setup.roundKey = key;
    }
    setup.track=scheduled.track;
    setup.laps = scheduled.laps;
    setup.weather = scheduled.weather;
    if (setup.fuel < setup.laps * 0.85 || setup.fuel > setup.laps * 1.35)
      setup.fuel = +(setup.laps * 1.15).toFixed(1);
  }
  return `<section class="race-card"><div class="track-header"><h3>${TRACK.name}</h3><span class="badge">${scheduled ? scheduled.name : "DYNAMIC WEATHER"}</span></div><div class="specs"><span>GRID<b>22 cars</b></span><span>CHARACTER<b>${TRACK.character}</b></span><span>LAP LENGTH<b>${(TRACK.length/1000).toFixed(2)} km</b></span></div>${!scheduled ? `<div class="field weather-choice"><span class="field-label">Circuit</span><button class="circuit-picker-trigger" id="track-choice" aria-label="Choose circuit: ${TRACK.name}" aria-haspopup="dialog"><span><b>${TRACK.name}</b><small>Choose from 12 circuits</small></span><span aria-hidden="true">▦</span></button></div>` : ""}<div class="form-row"><div class="field">${scheduled ? `<span class="field-label">Race distance</span><div class="fixed-race-distance"><strong>${scheduled.laps} laps</strong><span>Weekend distance · ${DIFFICULTIES[settings.difficulty].name} AI</span></div>` : `<label for="laps">Race distance</label><select id="laps"><option value="8" ${setup.laps === 8 ? "selected" : ""}>8 laps · short race</option><option value="16" ${setup.laps === 16 ? "selected" : ""}>16 laps · strategy race</option><option value="24" ${setup.laps === 24 ? "selected" : ""}>24 laps · long race</option></select><label for="starting-position" class="starting-position-label">Starting position</label><select id="starting-position">${Array.from({length:22},(_,i)=>`<option value="${i+1}" ${(setup.startingPosition ?? 22)===i+1 ? "selected" : ""}>P${i+1}${i===0 ? " · pole position" : i===21 ? " · back of grid" : ""}</option>`).join("")}</select>`}</div><div class="field"><label>Starting compound</label><div class="compound-row">${compounds(setup.tyre, "start-tyre")}</div></div></div>${!scheduled ? `<div class="field weather-choice"><label for="weather-choice">Weather</label><select id="weather-choice"><option value="showers" ${setup.weather === "showers" ? "selected" : ""}>Dry → rain → drying</option><option value="wetToDry" ${setup.weather === "wetToDry" ? "selected" : ""}>Wet → drying</option><option value="lateRain" ${setup.weather === "lateRain" ? "selected" : ""}>Late rain</option><option value="dry" ${setup.weather === "dry" ? "selected" : ""}>Dry</option></select></div>` : ""}${scheduled ? `<div class="fuel-row"><span>Qualifying fuel</span><b>${getQualifyingFuel().toFixed(2)} laps · fixed</b></div><p class="hint">Fuel is set for one out lap, one push lap and one in lap. Race fuel is chosen after qualifying.</p>` : `<div class="fuel-row"><span>Starting fuel <b id="fuel-value">${setup.fuel.toFixed(1)} laps</b></span><span id="fuel-risk"></span></div><input id="fuel" type="range" min="${setup.laps * 0.85}" max="${setup.laps * 1.35}" step="0.1" value="${setup.fuel}" aria-label="Starting fuel in laps"><p class="hint">Less fuel means less weight. Balanced driving uses ~1.10 fuel laps per lap; conserve to stretch it. No refuelling.</p>`}<button class="primary" data-action="start"><span>${screen === "career" ? `START QUALIFYING · ROUND ${career.round}` : "TAKE TO THE GRID"}</span><span>→</span></button><div class="setup-summary">${TYRES[setup.tyre].name} start · use at least two compounds to finish legally.<br>S ≈ 9 laps / M ≈ 13 / H ≈ 19.<br>Intermediates for damp tracks; wets for standing water.</div></section>`;
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
  return `<footer class="menu-footer"><div class="keycaps"><span><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> Drive</span><span><kbd>B</kbd> Box</span><span><kbd>P</kbd> Limiter</span><span><kbd>T</kbd> / <kbd>1–5</kbd> Next tyre</span><span><kbd>F</kbd> Fuel mode</span><span><kbd>R</kbd> Reverse in pit</span><span><kbd>Esc</kbd> Pause</span></div><span class="muted">V10 power. Every decision counts.</span></footer>`;
}
function menu() {
  race = null;
  paused = false;
  overview = false;
  settlement = null;
  if(screen==="career") migrateWeekend(career.weekend);
  selectTrack(screen==="career" ? career.weekend?.setup.track || weekendSchedule(career.round).track : setup.track);
  app.innerHTML =
    header() +
    `<main class="menu-shell scroll">${screen === "quick" ? `<div class="hero"><div class="eyebrow">THE LINE BETWEEN PACE & PATIENCE</div><h1>DRIVE FAST.<br><span style="color:var(--lime)">THINK AHEAD.</span></h1><p>Twenty-two cars. Every corner counts. Find your rhythm, protect your tyres, and make the call that changes your race.</p></div>${tabs()}${setupCard()}<div class="circuit-label"><div class="eyebrow">${TRACK.country.toUpperCase()} · ${(TRACK.length/1000).toFixed(2)} KM</div><div class="display">${TRACK.name.toUpperCase()}</div><p>${TRACK.character}.</p></div>` : careerPage()}${footer()}</main>`;
  bindMenu();
  fuelLabel();
}
function sponsorCard() {
  const chosen=SPONSORS.find(s=>s.id===career.sponsor);
  return chosen ? `<section class="panel signed-sponsor" id="sponsor-panel"><div class="eyebrow">WEEKEND SPONSOR · SIGNED</div><b>${chosen.name} · ${money(chosen.amount)}</b><p>${chosen.desc}</p></section>` :
    `<section class="panel" id="sponsor-panel"><div class="panel-heading"><h3>Race sponsor</h3><span class="eyebrow">CHOOSE ONE</span></div><div class="sponsors">${SPONSORS.map(s=>`<button class="sponsor" data-sponsor="${s.id}"><h3>${s.name}</h3><p>${s.desc}</p><b>${money(s.amount)} · ON SUCCESS</b></button>`).join("")}</div><p class="hint">One-race contracts. Paid after meeting the condition.</p></section>`;
}
function showSettings() {
  const previousPaused=paused;
  if(race) {paused=true;keys.clear();}
  const modal=document.createElement("div");modal.className="modal-backdrop";modal.id="settings-modal";
  modal.innerHTML=`<section class="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><div class="eyebrow">RACE SETTINGS</div><h2 id="settings-title">Settings</h2><div class="field"><label for="ai-difficulty">AI difficulty</label><select id="ai-difficulty">${Object.entries(DIFFICULTIES).map(([id,d])=>`<option value="${id}" ${settings.difficulty===id ? "selected" : ""}>${d.name}${d.prizeBonus ? ` · +${Math.round(d.prizeBonus*100)}% career race prize` : ""}</option>`).join("")}</select></div><p class="hint" style="margin:10px 0 20px">Applies to your next quick race or career weekend. An existing weekend keeps its difficulty. Bonuses apply to legal finishes; sponsor payouts stay fixed.</p><label class="setting-choice"><input type="checkbox" id="auto-pit-limiter" ${settings.autoPitLimiter ? "checked" : ""}> Automatic pit stops</label><p class="hint">Enabled by default: holds 80 km/h, brakes into your box, completes service and drives to pit exit without throttle. Disable this for manual pedals and P limiter control.</p><button class="primary" id="close-settings">BACK TO GAME</button></section>`;
  app.appendChild(modal);
  el("ai-difficulty").onchange=e=>{
    settings.difficulty=normalizeDifficulty(e.target.value);
    try {localStorage.setItem("v10.settings",JSON.stringify(settings));} catch {}
  };
  el("auto-pit-limiter").onchange=e=>{
    settings.autoPitLimiter=e.target.checked;
    try {localStorage.setItem("v10.settings",JSON.stringify(settings));} catch {}
    if(race) {race.autoPitLimiter=settings.autoPitLimiter; if(race.autoPitLimiter) race.pitLimiter=!!race.player.pit;}
  };
  el("close-settings").onclick=()=>{modal.remove();paused=previousPaused;};
}
function careerPage() {
  if (!career.profile) return careerSetupPage();
  migrateWeekend(career.weekend);
  if (career.weekend && !validWeekend(career.weekend, career))
    career.weekend = null;
  return `<div class="career-head"><div><div class="eyebrow">BUILD YOUR WAY UP THE GRID</div><h2 style="margin-top:10px">Your career garage</h2></div><div class="wallet"><div class="stat"><span>Budget</span><strong>${money(career.cash)}</strong></div><div class="stat"><span>Career points</span><strong>${career.points}</strong></div></div></div>${tabs()}<button class="ghost career-reset" data-action="reset-career">Reset career</button><div class="notice">${notice || `Season ${career.season}, round ${career.round} of 6 · ${career.seasonPoints} season points · ${escapeHTML(career.profile.driverName)} · ${TEAMS[career.profile.teamIndex].name} development car`}</div><div class="career-layout"><div class="career-left">${career.weekend ? weekendCard() : setupCard()}<section class="panel"><div class="panel-heading"><h3>Recent results</h3><span class="eyebrow">${career.history.length ? "SAVED" : "NEW DRIVER"}</span></div>${
    career.history.length
      ? career.history
          .slice(0, 4)
          .map(
            (h) =>
              `<div class="history-row"><span>S${h.season} · R${h.round}</span><b>${h.dnf ? "DNF" : !h.legal ? "DQ" : "P" + h.position}</b><span>${h.points} pts</span><span>${money(h.prize + h.bonus)}</span></div>`,
          )
          .join("")
      : '<p class="muted">Start near the back in a slower car. Earn race money, meet sponsor conditions and invest in your pace. The six-round season visits six different circuits.</p>'
  }<div class="save-note">Career saves automatically in this browser.</div>${saveWarning ? `<div class="storage-warning">${saveWarning}</div>` : ""}</section></div><div class="career-right">${sponsorCard()}<section class="panel"><div class="panel-heading"><h3>Car development</h3><span class="eyebrow">${career.weekend ? "LOCKED FOR WEEKEND" : "V10"}</span></div>${Object.entries(
    UPGRADES,
  )
    .map(
      ([k, u]) =>
        `<div class="upgrade"><div class="upgrade-info"><h3>${u.name}</h3><p>${u.desc}</p><div class="levels" aria-label="Level ${career.upgrades[k]} of ${u.max}">${Array.from({ length: u.max }, (_, i) => `<i class="${i < career.upgrades[k] ? "on" : ""}"></i>`).join("")}</div></div><button class="ghost" data-upgrade="${k}" ${career.weekend || career.upgrades[k] >= u.max || career.cash < upgradeCost(career, k) ? "disabled" : ""}>${career.upgrades[k] >= u.max ? "MAX" : money(upgradeCost(career, k)) + " ↗"}</button></div>`,
    )
    .join("")}</section></div></div>`;
}
function tyreSetLabel(t) {
  return `${t.id} · ${TYRES[t.compound].name} · ${Math.round(Math.max(0, 1 - t.wear) * 100)}% · ${t.used ? "used" : "fresh"}`;
}
function weekendCard() {
  const w = career.weekend;
  if (w.phase === "R") startRaceWeather(w);
  const phase = w.phase,
    sets = selectableSets(w.inventories[21], phase),
    stage = Q_STAGES.find((q) => q.name === phase),
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
      const t = w.results.find((r) => r.id === id);
      return `<div class="history-row"><b>P${i + 1}</b><span>${escapeHTML(modelName)}</span><span>${phase === "R" ? "GRID" : t ? time(t.time) : "NO TIME"}</span></div>`;
    })
    .join("");
  return `<section class="race-card weekend-card"><div class="track-header"><h3>${phase === "R" ? "Race preparation" : phase + " qualifying"}</h3><span class="badge">${w.weather.rain > 0.6 ? "HEAVY RAIN" : w.weather.rain > 0.05 ? "RAIN" : w.weather.wetness > 0.1 ? "DRYING" : "DRY"} / ${Math.round(w.weather.wetness * 100)}% WET</span></div><p class="hint">${phase === "R" ? `Starting P${w.grid.indexOf(21) + 1} · ${w.setup.laps} laps · ${w.eventName || weekendSchedule(w.round).name} · ${DIFFICULTIES[normalizeDifficulty(w.setup.difficulty)].name} AI · choose any remaining set.` : eliminated ? "You have been knocked out. The remaining sessions will set the front of the grid." : `${w.active.length} cars · ${stage.keep} advance · ${Math.ceil((stage.duration - w.elapsed) / 60)} min remaining. Choose when to leave the garage. Each run has an out lap, one timed lap and an in lap.`}</p>${phase === "R" ? `<div class="field"><label for="weekend-set">Race starting set</label><select id="weekend-set">${sets.map((t) => `<option value="${t.id}" ${t.id === selectedWeekendSet ? "selected" : ""}>${tyreSetLabel(t)}</option>`).join("")}</select></div>` : `<div class="fuel-row"><span>Selected tyre set</span><b>${sets.find(t=>t.id===selectedWeekendSet) ? tyreSetLabel(sets.find(t=>t.id===selectedWeekendSet)) : "No available sets"}</b></div>`}${phase !== "R" ? `<button class="ghost browse-tyres" data-action="browse-weekend-tyres">Browse tyre sets · fresh & used</button>` : ""}${phase === "R" ? `<div class="fuel-row"><span>Race fuel</span><b id="weekend-fuel-label">${w.setup.fuel.toFixed(1)} laps</b></div><input id="weekend-fuel" aria-label="Race fuel in laps" type="range" min="${w.setup.laps * 0.85}" max="${w.setup.laps * 1.35}" step=".1" value="${w.setup.fuel}">` : ""}<div class="weekend-inventory">${w.inventories[21]
    .filter((t) => !t.returned)
    .map(
      (t) =>
        `<span style="--tyre:${TYRES[t.compound].color}" class="tyre-set-chip ${t.reserved && phase !== "Q3" && phase !== "R" ? "locked" : ""}">${t.id} · ${Math.round(Math.max(0, 1 - t.wear) * 100)}%${t.reserved && phase !== "R" ? " · Q3" : ""}</span>`,
    )
    .join(
      "",
    )}</div><p class="hint">${forecast(w.weather)} · surface water carries over from qualifying.</p><p class="hint">13 dry sets + 5 intermediate + 2 wet. Six dry practice sets returned. Q3 soft held back; Q3 participants return it afterwards. Every remaining set keeps its wear.</p>${phase === "R" ? '<button class="primary" data-action="weekend-race">START GRAND PRIX →</button>' : eliminated ? '<button class="primary" data-action="finish-qualifying">COMPLETE QUALIFYING →</button>' : `<button class="primary" data-action="qualifying-run" ${!sets.length || w.elapsed >= stage.duration ? "disabled" : ""}>${w.runCount ? "ANOTHER RUN" : "DRIVE " + phase} →</button><button class="ghost end-session" data-action="end-qualifying" ${!qualifyingReady(w) ? "disabled" : ""}>${pendingFirstRuns(w).length ? `Waiting for ${pendingFirstRuns(w).length} opponents to complete a first run` : !qualifyingReady(w) ? "Complete your first timed lap before ending the session" : `END ${phase} & ADVANCE`}</button>`}<details class="weekend-results"><summary>${phase === "R" ? "Starting grid" : "Session timing"}</summary>${rows}</details><p class="save-note">Weekend allocation and qualifying progress save automatically.</p></section>`;
}
function bindWeekend() {
  const w = career.weekend;
  app.querySelector("[data-action=browse-weekend-tyres]")?.addEventListener("click",()=>showTyreSetPicker());
  if(el("weekend-set")) el("weekend-set").onchange = (e) => {
    selectedWeekendSet = e.target.value;
    w.startSetId = selectedWeekendSet;
    w.selectedSetId = selectedWeekendSet;
    w.selectedPhase = w.phase;
    save();
  };
  if (el("weekend-fuel"))
    el("weekend-fuel").oninput = (e) => {
      w.setup.fuel = +e.target.value;
      el("weekend-fuel-label").textContent = w.setup.fuel.toFixed(1) + " laps";
      save();
    };
  app
    .querySelector('[data-action="qualifying-run"]')
    ?.addEventListener("click", () => {
      race = new QualifyingRun(
        w,
        selectedWeekendSet,
        career.upgrades,
        career.profile,
      );
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
      run.endSession();
      selectedWeekendSet=null;save();menu();
    });
  app
    .querySelector('[data-action="finish-qualifying"]')
    ?.addEventListener("click", () => {
      finishRemainingQualifying(w, career.upgrades, career.profile);
      save();
      menu();
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
        menu();
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
  app.querySelectorAll("[data-upgrade]").forEach(
    (b) =>
      (b.onclick = () => {
        if (buyUpgrade(career, b.dataset.upgrade)) {
          notice =
            UPGRADES[b.dataset.upgrade].name +
            " installed. Your next race uses the new package.";
          save();
          menu();
        }
      }),
  );
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
  if (screen === "career" && career.weekend) {
    bindWeekend();
    return;
  }
  if(el("track-choice")) el("track-choice").onclick=showTrackPicker;
  if (el("weather-choice"))
    el("weather-choice").onchange = (e) => {
      setup.weather = e.target.value;
      menu();
    };
  if(el("laps")) el("laps").onchange = (e) => {
    setup.laps = +e.target.value;
    setup.fuel = +(setup.laps * 1.15).toFixed(1);
    menu();
  };
  if(el("starting-position")) el("starting-position").onchange = (e) => {
    setup.startingPosition = +e.target.value;
  };
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
  if (screen === "career" && !fromWeekend) {
    ensureWeekend(career, {...setup,difficulty:settings.difficulty});
    selectedWeekendSet = null;
    save();
    menu();
    return;
  }
  const raceSetup = screen === "career" ? career.weekend.setup : {...setup,difficulty:settings.difficulty};
  keys.clear();
  touch = { steer: 0, throttle: false, brake: false };
  race = new Race(
    { ...raceSetup },
    screen === "career"
      ? career.upgrades
      : { engine: 0, aero: 0, tyres: 0, crew: 0 },
    screen,
    screen === "career" ? career.profile : null,
  );
  if (screen === "career")
    prepareRace(race, career.weekend, selectedWeekendSet);
  settlement = null;
  paused = false;
  accumulator = 0;
  raceUI();
}
function raceUI() {
  ensureAudio();
  race.autoPitLimiter=settings.autoPitLimiter;
  if(race.autoPitLimiter) race.pitLimiter=!!race.player.pit;
  app.innerHTML = `<div class="race-top"><div class="brand">V10</div><div class="race-chips"><div class="race-chip"><span>POSITION</span><b id="position">22 / 22</b></div><div class="race-chip"><span>${race.qualifying ? "SESSION" : "LAP"}</span><b id="lap">1 / ${race.laps}</b></div><div class="race-chip"><span>${race.qualifying ? "TIME LEFT" : "RACE TIME"}</span><b id="clock">0:00.00</b></div></div><div class="race-actions"><button class="ghost" data-action="sound" aria-label="Toggle engine sound">${muted ? "Sound off" : "Sound on"}</button><button class="ghost" data-action="view">Map</button><button class="ghost" data-action="settings">Settings</button><button class="ghost" data-action="pause">Ⅱ</button></div></div><section class="tower ${race.qualifying ? "qualifying-tower" : ""}"><div class="tower-head"><span>${race.qualifying ? "QUALIFYING" : "LIVE TIMING"}</span><span>${race.qualifying ? "STATUS / BEST" : "INTERVAL"}</span></div><div id="qualifying-cutoff"></div><div id="timing"></div></section><div class="weather-hud" id="weather-hud"><b id="weather-now"></b><span id="weather-forecast"></span><span id="race-limits"></span></div><div class="engineer" id="engineer"><span>RACE ENGINEER</span><div id="message"></div></div><div class="race-bottom"><div class="dashboard"><div class="speed"><strong id="speed">0</strong><span>KM/H</span></div><div class="telemetry"><div class="telemetry-header"><span id="tyre-name">MEDIUM</span><b id="wear">100%</b></div><div class="bar"><i id="wear-bar"></i></div><p id="tyre-state">Ready to race</p><div class="drive-modes" title="F cycles fuel mode"><button class="tab" data-drive="save">Save</button><button class="tab active" data-drive="balanced">Balanced</button><button class="tab" data-drive="push">Push</button></div></div><div class="telemetry fuel-telemetry"><div class="telemetry-header"><span>FUEL</span><b id="fuel-left"></b></div><div class="bar"><i id="fuel-bar"></i></div><p id="fuel-status">On target</p><p id="last-lap" style="margin-top:12px">Last lap —</p></div></div><section class="pit-panel"><div class="eyebrow" id="pit-title">NEXT PIT STOP · T CYCLES</div><div class="compound-row">${race.qualifying ? `<button class="compound active current-tyre" data-pit-tyre="current" aria-pressed="true" style="--tyre:${TYRES[race.player.tyre].color}"><i class="tyre-dot"></i>Current</button>` : ""}${compounds(race.nextTyre, "pit-tyre")}</div><button class="primary" data-action="pit"><span id="pit-button">REQUEST PIT · B</span><span>↗</span></button><button class="ghost limiter" data-action="limiter" aria-pressed="false">LIMITER OFF · P</button><p id="pit-hint">${race.autoPitLimiter ? "Press B, then steer into the separate pit road. Speed, stopping, service and exit are automatic." : "Stop inside the highlighted box using S / ↓. R reverses. Service holds the car. P toggles the limiter."}</p><p id="race-set-note" class="hint"></p></section></div><div class="weather-timeline" role="img" aria-label="Scrolling six-minute weather forecast"><div class="forecast-legend"><b>WEATHER FORECAST</b><span><i class="rain-key"></i> Rain <i class="water-key"></i> Surface water</span></div><svg id="weather-timebar" viewBox="0 0 720 62" preserveAspectRatio="none"></svg></div><div class="countdown" id="countdown"><div class="lights">${"<i></i>".repeat(5)}</div><p>LIGHTS OUT. MAKE IT COUNT.</p></div><div class="touch-controls"><div><button data-touch="left" aria-label="Steer left">←</button><button data-touch="right" aria-label="Steer right">→</button></div><div><button class="pedal" data-touch="reverse">REV</button><button class="pedal" data-touch="brake">BRAKE</button><button class="pedal" data-touch="throttle">GAS</button></div></div>`;
  const counters=document.createElement("div");counters.className="standings-counters";
  counters.appendChild(app.querySelector(".race-chips"));
  app.querySelector(".tower").before(counters);
  const dashboard=app.querySelector(".dashboard");dashboard.classList.add("top-dashboard");app.appendChild(dashboard);
  app.querySelector("[data-action=settings]").onclick=showSettings;
  app.querySelector("[data-action=pit]").onclick = () => race.requestPit();
  app.querySelector("[data-action=limiter]").onclick = () =>
    race.togglePitLimiter();
  app.querySelector("[data-action=pause]").onclick = () => pauseRace();
  app.querySelector("[data-action=view]").onclick = () => {
    overview = !overview;
  };
  app.querySelector("[data-action=sound]").onclick = toggleAudio;
  app
    .querySelectorAll("[data-drive]")
    .forEach((b) => (b.onclick = () => setDrive(b.dataset.drive)));
  app
    .querySelectorAll("[data-pit-tyre]")
    .forEach((b) => (b.onclick = () => setPitTyre(b.dataset.pitTyre)));
  app.querySelectorAll("[data-touch]").forEach((b) => {
    b.onpointerdown = (e) => {
      e.preventDefault();
      b.setPointerCapture(e.pointerId);
      const k = b.dataset.touch;
      if (k === "left" || k === "right") touch.steer = k === "left" ? -1 : 1;
      else touch[k] = true;
    };
    b.onpointerup = b.onpointercancel = (e) => {
      const k = b.dataset.touch;
      if (k === "left" || k === "right") touch.steer = 0;
      else touch[k] = false;
    };
  });
  const browse=document.createElement("button");browse.className="ghost browse-tyres";browse.id="browse-race-tyres";
  browse.textContent="Choose tyre set · fresh & used";browse.onclick=()=>showTyreSetPicker();
  app.querySelector(".pit-panel .compound-row").after(browse);
  if (race.qualifying) {
    const speed=document.createElement("button");speed.className="ghost";speed.id="qualifying-speed";
    speed.textContent="Time 1×";speed.onclick=()=>{race.cycleTimeScale();updateHUD();};
    app.querySelector(".race-actions").prepend(speed);
    const finish = document.createElement("button");
    finish.className = "ghost end-session";
    finish.id = "finish-qualifying-run";
    finish.textContent = "FINISH QUALIFYING RUN";
    finish.onclick = () => {
      finish.disabled=true;finish.textContent="Completing AI runs…";
      const outcome=race.endSession();
      if(!outcome) { updateHUD();return; }
      selectedWeekendSet=null;
      notice=outcome.through ? `Qualified in P${outcome.position}. ${outcome.phase} is ready.` : `Qualifying complete. Starting P${career.weekend.grid.indexOf(21)+1}.`;
      save();menu();
    };
    app.querySelector(".pit-panel").appendChild(finish);
    el("pit-hint").textContent =
      "In laps enter the pit road automatically. Service refuels for three laps, then holds you in the box. Choose tyres here and press W / ↑ when ready to leave.";
  }
  updateHUD();
}
function setDrive(mode) {
  if (!race) return;
  race.player.drive = mode;
  app.querySelectorAll("[data-drive]").forEach((b) => {
    b.classList.toggle("active", b.dataset.drive === mode);
    b.setAttribute("aria-pressed", b.dataset.drive === mode);
  });
}
function showTyreSetPicker() {
  if(el("tyre-set-picker")) return;
  const running=race && !race.done ? race : null,w=running?.weekend || (!running ? career.weekend : null);
  if(!w && !running) return;
  const currentId=running?.player.tyreSet?.id || (running ? "quick-current" : null);
  const inventory=running ? running.player.tyreInventory || [
    {id:currentId,label:running.player.tyre+" · fitted",compound:running.player.tyre,wear:running.player.wear,used:true},
    ...["S","M","H","I","W"].map(compound=>({id:"quick-"+compound,label:compound,compound,wear:0,used:false}))
  ] : w.inventories[21];
  const phase=running && !running.qualifying ? "R" : w.phase;
  const available=selectableSets(inventory,phase,running && !running.qualifying ? currentId : null),selected=running ? running.nextSetId || "quick-"+running.nextTyre : selectedWeekendSet;
  const wasPaused=paused;paused=!!running || paused;keys.clear();touch={steer:0,throttle:false,brake:false};
  const backdrop=document.createElement("div");backdrop.className="modal-backdrop";backdrop.id="tyre-set-picker";
  backdrop.innerHTML=`<section class="modal tyre-picker-modal" role="dialog" aria-modal="true" aria-labelledby="tyre-picker-title"><div class="track-picker-heading"><div><div class="eyebrow">${running && !running.player.tyreInventory ? "RACE TYRE OPTIONS" : "WEEKEND TYRE ALLOCATION"}</div><h2 id="tyre-picker-title">Choose your tyre set</h2></div><button class="ghost" data-close-tyres aria-label="Close tyre selector">×</button></div><p class="hint">Fresh or used — each physical set keeps its condition across outings and qualifying sessions. The compound buttons remain available for quick choices.</p>${["S","M","H","I","W"].map(compound=>`<div class="tyre-set-group"><h3 style="color:${TYRES[compound].color}">${TYRES[compound].name}</h3><div class="tyre-set-grid">${inventory.filter(t=>t.compound===compound&&!t.returned).map(t=>{
    const enabled=available.some(a=>a.id===t.id),condition=Math.round(Math.max(0,1-t.wear)*100),fitted=!!running && currentId===t.id;
    return `<button class="tyre-set-card ${t.id===selected ? "selected" : ""}" data-choose-set="${t.id}" ${enabled ? "" : "disabled"} aria-pressed="${t.id===selected}" style="--tyre:${TYRES[compound].color}"><b><i class="tyre-dot"></i>${t.label || t.id}<span>${condition}%</span></b><div class="bar"><i style="width:${condition}%;background:var(--tyre)"></i></div><small>${fitted ? "Currently fitted" : !enabled ? t.reserved ? "Reserved for Q3" : "Worn out" : t.used ? "Used · reusable" : "Fresh"}${t.id===selected ? " · Selected" : ""}</small></button>`;
  }).join("")}</div></div>`).join("")}</section>`;
  app.appendChild(backdrop);
  const close=()=>{backdrop.remove();paused=wasPaused;keys.clear();(running ? el("browse-race-tyres") : app.querySelector("[data-action=browse-weekend-tyres]"))?.focus();};
  backdrop.querySelector("[data-close-tyres]").onclick=close;backdrop.onclick=e=>{if(e.target===backdrop)close();};
  backdrop.querySelectorAll("[data-choose-set]").forEach(button=>button.onclick=()=>{
    const set=available.find(t=>t.id===button.dataset.chooseSet);if(!set)return;
    if(running) {
      if(running.qualifying && running.player.pit && !running.selectGarageSet(set.id))return;
      running.nextSetId=set.id;running.nextTyre=set.compound;
      app.querySelectorAll("[data-pit-tyre]").forEach(b=>{
        const active=b.dataset.pitTyre===set.compound;b.classList.toggle("active",active);b.setAttribute("aria-pressed",active);
      });
      close();updateHUD();
    } else {
      selectedWeekendSet=set.id;w.selectedSetId=set.id;w.selectedPhase=w.phase;w.startSetId=set.id;
      close();save();menu();
    }
  });
  backdrop.addEventListener("keydown",e=>{
    if(e.key==="Escape"){e.preventDefault();e.stopPropagation();close();}
    if(e.key==="Tab"){
      const buttons=[...backdrop.querySelectorAll("button:not(:disabled)")],first=buttons[0],last=buttons.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  });
  backdrop.querySelector("[data-close-tyres]").focus();
}
function setPitTyre(tyre) {
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
  svg.innerHTML=`${ticks}<path d="${rain} L720,43 L0,43 Z" fill="#76baff" opacity=".13"/><path d="${rain}" fill="none" stroke="#76baff" stroke-width="2"/><path d="${water}" fill="none" stroke="#6ee4b4" stroke-width="2"/><line x1="${x(now)}" x2="${x(now)}" y1="7" y2="47" stroke="#f3e5b2"/><text x="${x(now)+5}" y="9" fill="#f3e5b2">NOW</text>`;
}
function updateHUD() {
  if (!race || !el("position")) return;
  el("browse-race-tyres").disabled=!!race.player.pit && !race.player.garage && !(race.qualifying && race.player.pit.stage==="service");
  const p = race.player,
    order = race.order(),
    position = order.indexOf(p) + 1,
    remaining = Math.max(0, race.laps - raceProgress(p) / TRACK.length);
  el("position").textContent = position + " / 22";
  el("lap").textContent =
    Math.min(race.laps, Math.max(1, Math.floor(raceProgress(p) / TRACK.length) + 1)) +
    " / " +
    race.laps;
  el("clock").textContent = time(race.time);
  el("speed").textContent = Math.round(Math.abs(p.speed));
  app.querySelector(".speed span").textContent=p.speed<0 ? "KM/H · R" : "KM/H";
  el("tyre-name").textContent = TYRES[p.tyre].name.toUpperCase();
  el("tyre-name").style.color = TYRES[p.tyre].color;
  el("wear").textContent = Math.round(Math.max(0, 1 - p.wear) * 100) + "%";
  el("wear-bar").style.width = Math.max(0, 1 - p.wear) * 100 + "%";
  el("wear-bar").style.background =
    p.wear > 0.8 ? "#ff8270" : TYRES[p.tyre].color;
  el("tyre-state").textContent =
    p.tyreAge < 450
      ? "Cold tyres · build grip"
      : p.wear > 0.82
        ? "Grip fading · box soon"
        : !tyreRuleMet(p)
          ? "Second compound required"
          : "Compound requirement met";
  el("fuel-left").textContent = p.fuel.toFixed(1) + " laps";
  el("fuel-bar").style.width = (p.fuel / race.setup.fuel) * 100 + "%";
  el("fuel-status").textContent =
    p.fuel < remaining * 1.08 ? "Low margin · conserve" : "On target";
  el("fuel-status").style.color = p.fuel < remaining * 1.08 ? "#ffd17e" : "";
  el("last-lap").textContent = "Last lap " + time(p.lastLap || Infinity);
  el("weather-now").textContent =
    `${race.weather.rain > 0.6 ? "HEAVY RAIN" : race.weather.rain > 0.05 ? "RAIN" : race.weather.wetness > 0.1 ? "DRYING" : "DRY"} · ${Math.round(race.weather.wetness * 100)}% track wetness`;
  el("weather-forecast").textContent = forecast(race.weather);
  updateWeatherTimeline();
  el("race-limits").textContent =
    `Limits ${p.trackLimits % 4}/3 · ${p.penaltySecondsTotal || 0}s penalties`;
  el("message").textContent = race.message;
  el("engineer").classList.toggle("hidden", race.time > race.messageUntil);
  const limiter = app.querySelector("[data-action=limiter]");
  limiter.textContent=(race.pitLimiter ? "LIMITER ON · 80" : "LIMITER OFF") + (race.autoPitLimiter ? " · AUTO" : " · P");
  limiter.disabled=race.autoPitLimiter;
  limiter.setAttribute("aria-pressed", race.pitLimiter);
  limiter.classList.toggle("active", race.pitLimiter);
  el("pit-title").textContent = p.pit
    ? p.pit.stage === "service"
      ? "SERVICE HOLD · " + Math.max(0,p.pit.timer).toFixed(1) + "s"
      : "PIT LANE · " + (race.pitLimiter ? "80 LIMIT" : "NO LIMITER")
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
  app.querySelector("[data-action=pit]").disabled = !!p.pit;
  app
    .querySelectorAll("[data-pit-tyre]")
    .forEach((b) => (b.disabled = !!p.pit && !p.garage));
  if (p.pit && !race.qualifying)
    el("pit-hint").textContent =
      p.pit.stage === "service"
        ? `SERVICE HOLD · ${Math.max(0,p.pit.timer).toFixed(1)}s remaining. Controls locked.`
        : p.pit.serviced
          ? race.autoPitLimiter ? "Automatic exit. No throttle needed; control returns at the pit exit line." : "Service complete. Accelerate to pit exit; release P after the lane."
          : race.autoPitLimiter ? `Automatic pit stop · box in ${Math.round(Math.max(0,p.pit.boxDistance-p.pit.distance))}m. Pedals handled by the crew.` : `Box ${Math.round(p.pit.boxDistance - p.pit.distance)}m · brake to stop in the outline. R reverses.`;
  let visible = order.slice(0, 5);
  if (position > 5)
    visible = [
      ...visible,
      ...order.slice(Math.max(5, position - 2), Math.min(22, position + 1)),
    ];
  else visible = order.slice(0, 8);
  el("timing").innerHTML = visible
    .map((c) => {
      const rank = order.indexOf(c) + 1,
        gap = liveInterval(order[0],c);
      return `<div class="timing-row ${c.player ? "me" : ""}" style="--team:${c.team.color};--tyre:${TYRES[c.tyre].color}"><span class="rank">${rank}</span><i class="stripe"></i><span class="name" title="${escapeHTML(c.name)}">${escapeHTML(c.name)}</span><span class="gap">${gap}</span><span class="compound-label">${c.tyre}</span></div>`;
    })
    .join("");
  if (race.qualifying) {
    const finish=el("finish-qualifying-run");
    finish.disabled=!race.canEndSession();
    finish.textContent=race.sessionAction();
    el("qualifying-speed").textContent=`Time ${race.timeScale}×`;
    el("qualifying-speed").setAttribute("aria-label",`Qualifying speed ${race.timeScale} times; cycle speed`);
    el("fuel-status").textContent = "Qualifying fuel load";
    el("fuel-status").style.color = "";
    el("lap").textContent =
      race.stage.name + " · " + ({garage:"GARAGE",out:"OUT LAP",timed:"TIMED LAP",in:"IN LAP",stranded:"NO FUEL"}[p.qState] || "PIT");
    el("clock").textContent = time(
      Math.max(0, race.stage.duration - race.weekend.elapsed),
    );
    el("tyre-state").textContent = p.pit?.stage==="service" ? "Service hold · waiting for crew" : p.garage ? "Ready · press W / ↑ to leave" :
      p.qState === "in" ? "In lap · return to pits; extra laps untimed" :
      p.qState === "out" ? "Out lap · warm the tyres" :
      p.qInvalid ? "Timed lap invalid · track limits" : "Timed lap · best " + time(p.bestLap);
    el("pit-hint").textContent = p.pit?.stage === "service" ? `SERVICE HOLD · ${Math.max(0,p.pit.timer).toFixed(1)}s remaining. Choose tyres; departure stays locked until service finishes.` : p.garage ?
      `Crew ready. Three-lap fuel loaded. Press W / ↑ when ready. Choose your next outing’s tyres here. ${race.nextSetId === p.tyreSet.id ? "Fitted tyres retained." : race.nextSetId + " selected."}` :
      p.pit?.stage === "service" ? `SERVICE HOLD · ${Math.max(0,p.pit.timer).toFixed(1)}s remaining. Controls locked.` :
      p.pit && !p.pit.serviced ? race.autoPitLimiter ? `Automatic pit stop · box in ${Math.round(Math.max(0,p.pit.boxDistance-p.pit.distance))}m.` : `Box ${Math.round(p.pit.boxDistance-p.pit.distance)}m · brake inside the outline. R reverses.` :
      p.pit?.serviced && race.autoPitLimiter ? "Automatic pit exit · no throttle needed. Control returns at the exit line." : "Out → timed → in. In-lap pit entry is automatic when you steer into the pit road. Service holds you in the box; choose tyres before leaving.";


    if(p.garage && p.pit?.stage!=="service") { el("pit-title").textContent="GARAGE · " + p.tyreSet.id; el("pit-button").textContent="PRESS W / ↑ TO LEAVE"; }
    if (!p.pit)
      el("pit-title").textContent = p.tyreSet?.id + " · " + race.stage.name;

    const progress=qualifyingProgress(race.weekend), cutoffCar=order.find(c=>c.id===progress.cutoffId);
    const margin=progress.margin;
    let status=progress.final ? (progress.playerTime===null ? "Q3 · bank a valid lap" : progress.margin===null ? "Q3 · fight for pole" : progress.rank===1 ? "PROVISIONAL POLE" : `${progress.margin.toFixed(3)}s behind pole`) : progress.playerTime===null ? "No time set · bank a valid lap" :
      progress.through ? (margin===null ? "Currently through · rivals still setting times" : `${Math.abs(margin).toFixed(3)}s ahead of elimination`) :
      margin===null ? "Outside cutoff · bank a valid lap" : `${Math.max(.001,margin).toFixed(3)}s needed to get through`;
    el("qualifying-cutoff").innerHTML=`<b>${progress.final ? "FINAL QUALIFYING" : "P"+progress.keep+" KNOCKOUT CUTOFF"}</b><span>${progress.cutoffTime===null ? "Cutoff time not set" : escapeHTML(cutoffCar?.name || "")+" · "+time(progress.cutoffTime)}</span><strong class="${progress.through ? "safe" : "danger"}">P${progress.rank} · ${status}</strong>`;
    el("timing").innerHTML=order.map((c,i)=>{
      const lap=race.weekend.results.find(t=>t.id===c.id);
      const cutoff=!progress.final && i===progress.keep-1;
      return `<div class="timing-row quali-row ${c.player ? "me" : ""} ${cutoff ? "cutoff-row" : ""}" style="--team:${c.team.color}"><span class="rank">${i+1}</span><i class="stripe"></i><span class="name" title="${escapeHTML(c.name)}">${escapeHTML(c.name)}</span><span class="q-status">${qualifyingStatus(c)}</span><span class="gap">${lap ? time(lap.time) : "—"}</span></div>${cutoff ? '<div class="cutoff-divider">↑ THROUGH · ELIMINATED ↓</div>' : ''}`;
    }).join("");

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
    el("race-set-note").textContent=keep ? "Current tyres retained · "+Math.round(Math.max(0,1-p.wear)*100)+"% condition" : next ? "Next set: "+tyreSetLabel(next) : "No replacement sets remaining";
    el("tyre-name").textContent =
      TYRES[p.tyre].name.toUpperCase() + " · " + p.tyreSet.id;
  }
  el("countdown").classList.toggle("hidden", race.countdown <= 0);
  el("countdown")
    .querySelectorAll("i")
    .forEach((l, i) => l.classList.toggle("on", race.countdown < 4 - i * 0.6));
}
function pauseRace() {
  if (!race || race.done) return;
  paused = !paused;
  keys.clear();
  touch = { steer: 0, throttle: false, brake: false };
  if (paused) {
    const b = document.createElement("div");
    b.className = "modal-backdrop";
    b.id = "pause-modal";
    b.innerHTML = `<section class="modal"><div class="eyebrow">TAKE A BREATHER</div><h2>Race paused</h2><div class="pause-controls"><p><b>Driving</b><span>W / ↑ Accelerate · S / ↓ Brake, then reverse<br>A / D or ← / → Steer</span></p><p><b>Pit stops</b><span>B Request a stop, then steer into the pit road<br>${race.autoPitLimiter ? "Automatic speed, stop, service and exit" : "P Toggle limiter · R Reverse in the pit lane"}</span></p><p><b>Strategy</b><span>F Cycle Save / Balanced / Push<br>T Cycle next tyres · 1–5 Select S / M / H / I / W</span></p><p><b>View & pause</b><span>M Change map view · Esc Resume</span></p></div><button class="primary" id="resume">BACK TO THE RACE →</button><button class="ghost" id="retire" style="width:100%;margin-top:12px">Retire race</button><p class="hint">Career retirement records a DNF. No sponsor bonus.</p></section>`;
    app.appendChild(b);
    el("resume").onclick = pauseRace;
    el("retire").onclick = () => {
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
      };
      paused = false;
      showResults();
    };
  } else el("pause-modal")?.remove();
}
function showResults() {
  if (race.qualifying) {
    if (race.settled) return;
    race.settled = true;
    save();
    const stage = race.stage.name,
      best = race.player.bestLap;
    const b = document.createElement("div");
    b.className = "modal-backdrop";
    b.innerHTML = `<section class="modal"><div class="eyebrow">${stage} / RUN COMPLETE</div><h2>${Number.isFinite(best) ? "Lap time banked" : "No valid lap"}</h2><p class="muted">Best: ${time(best)} · ${race.player.tyreSet.id} · ${Math.round(Math.max(0, 1 - race.player.wear) * 100)}% tyre life remaining. You can reuse this set or fit another for your next run.</p><button class="primary" id="q-return">BACK TO QUALIFYING GARAGE →</button><button class="ghost end-session" id="q-advance" ${!qualifyingReady(race.weekend) ? "disabled" : ""}>${pendingFirstRuns(race.weekend).length ? "Waiting for opponents to complete a first run" : !qualifyingReady(race.weekend) ? "Complete your first timed lap before ending the session" : `END ${stage} & ADVANCE`}</button></section>`;
    app.appendChild(b);
    el("q-return").onclick = () => menu();
    el("q-advance").onclick = () => {
      if(!qualifyingReady(career.weekend))return;
      const run=new QualifyingRun(career.weekend,race.player.tyreSet.id,career.upgrades,career.profile);
      run.endSession();
      selectedWeekendSet=null;
      save();
      menu();
    };
    return;
  }

  if (race.settled) return;
  race.settled = true;
  keys.clear();
  touch = { steer: 0, throttle: false, brake: false };
  if (race.mode === "career") {
    settlement = settleCareer(career, race.result);
    save();
  }
  const r = race.result;
  const b = document.createElement("div");
  b.className = "modal-backdrop";
  b.id = "results";
  b.innerHTML = `<section class="modal"><div class="eyebrow">${race.mode === "career" ? escapeHTML(race.player.name) + " / " + race.player.team.name : escapeHTML(TRACK.name) + " / RACE COMPLETE"}</div><h2>${r.dnf ? "A race to learn from" : !r.legal ? "Tyre rule infringement" : r.position === 1 ? "Race winner" : "Race complete"}</h2><div class="result-hero"><div><div class="display">${r.dnf ? "DNF" : !r.legal ? "DQ" : "P" + r.position}</div><small>${!r.legal && !r.dnf ? "Two different dry compounds were required." : "22-car grid · " + r.stops + " pit stops"}</small></div><div class="stat"><span>Race time</span><strong style="font-size:30px">${time(r.time)}</strong></div></div><div class="result-line"><span>Best lap</span><b>${time(r.bestLap)}</b></div><div class="result-line"><span>Track limits / penalty seconds</span><b>${race.player.trackLimits} / ${race.player.penaltySecondsTotal || 0}s</b></div><div class="result-line"><span>Fuel remaining</span><b>${r.fuel.toFixed(1)} laps</b></div>${settlement ? `<div class="result-line"><span>Championship points</span><b>+${settlement.points}</b></div><div class="result-line"><span>Race earnings</span><b>${money(settlement.prize)}</b></div>${settlement.difficultyBonus ? `<div class="result-line"><span>${DIFFICULTIES[settlement.difficulty].name} difficulty bonus · included</span><b>+${money(settlement.difficultyBonus)}</b></div>` : ""}<div class="result-line"><span>${settlement.sponsor || "Sponsor"} · ${settlement.met ? "condition met" : "no payout"}</span><b>${money(settlement.bonus)}</b></div>${settlement.seasonEnded ? `<div class="result-line"><span>Season completed · points bonus</span><b>${money(settlement.seasonBonus)}</b></div>` : ""}<div class="result-line"><span>Available budget</span><b>${money(career.cash)}</b></div>` : '<p class="muted">Try a different starting compound or fuel load to explore another strategy.</p>'}<button class="primary" id="continue">${race.mode === "career" ? "RETURN TO GARAGE" : "BACK TO PADDOCK"} →</button>${saveWarning ? `<p class="storage-warning">${saveWarning}</p>` : ""}</section>`;
  app.appendChild(b);
  el("continue").onclick = () => {
    notice = settlement
      ? `${money(settlement.prize + settlement.bonus + settlement.seasonBonus)} earned. Choose your next contract and develop your car.`
      : "";
    menu();
  };
}
function showHelp() {
  if (help) return;
  help = true;
  const b = document.createElement("div");
  b.className = "modal-backdrop";
  b.id = "help";
  b.innerHTML = `<section class="modal"><div class="eyebrow">DRIVER BRIEFING</div><h2>Find your rhythm.</h2><div class="help-grid"><div><h3>Drive</h3><p>W / ↑ accelerates, S / ↓ brakes then reverses once stopped. A/D or ←/→ steer. Brake before the turn, ease off through it, accelerate on exit. Touch controls appear on mobile.</p></div><div><h3>Strategy</h3><p>Softs give more grip but wear quickly. Mediums balance pace and life. Hards run longer. Use TWO different compounds before finishing. 16 laps is ideal for comparing one and two stops.</p></div><div><h3>Pit stops</h3><p>Press B to request a stop, then steer off the track into the separate pit road before the start straight. Automatic pit stops handle lane speed, the box stop, service and exit without pedals. Disable this in Settings to use manual pedals and P limiter control. Manual speeding adds 5 seconds. The wide lane has smooth merges and assisted steering; gas/brake still control speed. Release the limiter with P after exit. 1/2/3/4/5 selects S/M/H/I/W. Stop in the marked box with S; R reverses if you overshoot. Service holds the car. Three track-limit warnings precede a 5-second penalty.</p></div><div><h3>Fuel & pace</h3><p>Save reduces pace, wear and fuel use. Push trades resources for speed. F cycles modes. No refuelling, no battery. Fuel runs out? Coast to a stop and retire.</p></div><div><h3>Career</h3><p>Name your driver and choose any team. Complete Q1, Q2 and Q3 knockouts before each race. The weekend tyre pool is shared: choose individual sets and save fresh tyres for the race. Start in a slower development car. Reset your career from the garage to start again. Sign one sponsor per race, earn position money and upgrade power, grip, tyre life or pit service. Six different circuits form a season.</p></div><div><h3>Your controls</h3><p>Esc pauses. M toggles map view. Engine sound starts automatically; toggle it with Sound on / off. Your browser saves career progress automatically; quick races do not affect it.</p></div></div><button class="primary" id="close-help">READY TO RACE →</button></section>`;
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
}
window.addEventListener("keydown", (e) => {
  if (
    ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key) &&
    race
  )
    e.preventDefault();
  if (e.target.matches("input,select")) return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (e.repeat) return;
  if (k === "escape") {
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
  if (!race || paused || race.done) return;
  if (k === "b") race.requestPit();
  if (k === "p") race.togglePitLimiter();
  if (["1", "2", "3", "4", "5"].includes(k))
    setPitTyre(["S", "M", "H", "I", "W"][+k - 1]);
  if (k === "t") {
    const choices = ["S", "M", "H", "I", "W"].filter(tyre => !race.weekend || selectableSets(race.player.tyreInventory, race.qualifying ? race.weekend.phase : "R", race.qualifying ? null : race.player.tyreSet?.id).some(t => t.compound === tyre));
    if(race.qualifying) choices.unshift("current");
    if(!choices.length) return;
    setPitTyre(choices[(choices.indexOf(race.keepCurrentTyres ? "current" : race.nextTyre)+1)%choices.length]);
  }
  if (k === "m") overview = !overview;
  if (k === "f")
    setDrive(
      ["save", "balanced", "push"][
        (["save", "balanced", "push"].indexOf(race.player.drive) + 1) % 3
      ],
    );
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  touch = { steer: 0, throttle: false, brake: false };
  if (race && !paused && !race.done) pauseRace();
});
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  if (race && !paused && !race.done) {
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
  renderer.draw(race, !race, overview, dt, race && !paused && !race.done ? accumulator/(1/60) : 1);
  if (audio) {
    const sound=engineSoundFrame(race,paused,muted,keys.has("w") || keys.has("arrowup") || touch.throttle);
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
menu();
requestAnimationFrame(loop);
