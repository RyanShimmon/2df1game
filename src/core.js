import {recordTiming,intervalSeconds} from "./timing.js";
import {planRaceStrategy,strategyWearLimit} from "./strategy.js";
import {paceMode,fuelPerLap,applyThrottle,tyreWearFactor,stintLaps,cornerAccelerationLimit} from "./performance.js";
import {GRAND_PRIX_POINTS,racePoints,raceFormat,quickRaceFormat} from "./race-rules.js";
import {SEASON_LENGTH,careerSchedule,shuffledSeasonOrder,ensureSeasonOrder} from "./calendar.js";
import {SPONSORS,sponsorMet} from "./sponsors.js";
export {SPONSORS} from "./sponsors.js";
import {engineerReport} from "./engineer.js";
import {UPGRADES,AERO_PACKAGES,emptyUpgrades,normalizeUpgrades,level,upgradePrice,fuelMultiplier,sponsorPayout,aeroPackage,aeroGrip,setAeroPackage,createTeamDevelopment,migrateDevelopment,developTeams,developmentSnapshot,fundTeams,racePrize} from "./development.js";
export {UPGRADES,AERO_PACKAGES,fuelMultiplier,sponsorPayout,setAeroPackage,developTeams,developmentSnapshot};
import {selectableSets} from "./tyre-stock.js";
import {seededRandom,driverSeed,buildRacingLine,racingPoint,qualifyingLane,planRacingLane,laneGeometry,projectedPaceAdvantage,brakingTarget,updateSlipstream,forecastWater,createStrategy,rankTyres,availableAISets} from "./racecraft.js";
import {prepareTyres,thermalGrip,thermalWear,updateTyreTemperatures,coolStoredSets,distributeWear,holdOptimalTemperature,THERMAL} from "./tyre-temperature.js";
import {CIRCUITS,circuitById,circuitAnchors} from "./tracks.js";
export {CIRCUITS,circuitById};
import {
  createWeather,
  raceWeatherDuration,
  advanceWeather,
  trackWater,
  tyreWeatherGrip,
  recommendedTyre,
} from "./weather.js";
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const wrap = (v, n) => ((v % n) + n) % n;
export const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const TYRES = {
  S: { name: "Soft", color: "#ff6577", grip: 1.06, life: 12 },
  M: { name: "Medium", color: "#f7cd62", grip: 1, life: 17 },
  H: { name: "Hard", color: "#e8edf0", grip: 0.98, life: 23 },
  I: { name: "Intermediate", color: "#60de9a", grip: 1, life: 14 },
  W: { name: "Wet", color: "#5caeff", grip: 1, life: 16 },
};
// Baseline estimate in suitable conditions, with ideal temperatures. It is
// deliberately an estimate: sliding, heat and changing water alter actual wear.
export function estimatedTyreLife(compound, {wear=0, upgrades={}, mode="balanced", wetness=null}={}) {
  if(!TYRES[compound])return 0;
  return stintLaps(compound,TYRES,{wear,upgrades,mode,wetness:wetness ?? (compound==="W"?.75:compound==="I"?.35:0)});
}
export const DIFFICULTIES = {
  easy:{name:"Easy",pace:.78,skill:-.08,braking:.50,throttle:.70,prizeBonus:0},
  normal:{name:"Normal",pace:.94,skill:0,braking:.72,throttle:.86,prizeBonus:0},
  hard:{name:"Hard",pace:1.02,skill:.05,braking:.86,throttle:.94,prizeBonus:.05},
  expert:{name:"Expert",pace:1.10,skill:.09,braking:.96,throttle:1,prizeBonus:.10},
};
export const normalizeDifficulty=value=>Object.hasOwn(DIFFICULTIES,value) ? value : "normal";
export const TEAMS = [
  { name: "McLaren", color: "#ff8700", accent: "#161b20", pace: 1.025 },
  { name: "Mercedes", color: "#c4d0d3", accent: "#00d7bd", pace: 1.02 },
  { name: "Ferrari", color: "#ef333b", accent: "#f2f0e7", pace: 1.018 },
  { name: "Red Bull", color: "#244b97", accent: "#ffcc32", pace: 1.015 },
  { name: "Williams", color: "#2586ef", accent: "#fafbff", pace: 0.995 },
  { name: "Aston Martin", color: "#087c69", accent: "#c5e853", pace: 0.99 },
  { name: "Alpine", color: "#52b9ed", accent: "#f799c6", pace: 0.985 },
  { name: "Racing Bulls", color: "#f1f3f5", accent: "#4166ed", pace: 0.99 },
  { name: "Haas", color: "#d9e0e1", accent: "#d82a40", pace: 0.98 },
  { name: "Audi", color: "#a5adb0", accent: "#f34b2d", pace: 0.975 },
  { name: "Cadillac", color: "#ededeb", accent: "#22252b", pace: 0.97 },
];
export const POINTS = GRAND_PRIX_POINTS;
export function normalizeProfile(profile) {
  if (
    !profile ||
    typeof profile.driverName !== "string" ||
    !Number.isInteger(profile.teamIndex) ||
    !TEAMS[profile.teamIndex]
  )
    return null;
  const driverName = profile.driverName
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 24);
  return driverName ? { driverName, teamIndex: profile.teamIndex } : null;
}
export function newCareer(profile = null, {seasonOrder=shuffledSeasonOrder()}={}) {
  return {
    version: 1,
    calendarVersion:2,
    seasonOrder:[...seasonOrder],calendarSeason:1,
    profile: normalizeProfile(profile),
    cash: 7000,
    round: 1,
    season: 1,
    points: 0,
    seasonPoints: 0,
    upgrades: emptyUpgrades(),
    aeroSpec:"balanced",developmentSeed:null,teams:createTeamDevelopment(),
    sponsor: null,
    history: [],
    weekend: null,
  };
}
export function upgradeCost(career, key) {
  return upgradePrice(career.upgrades,key);
}
export function buyUpgrade(career, key) {
  if (career.weekend || !UPGRADES[key] || level(career.upgrades,key) >= UPGRADES[key].max) return false;
  const cost = upgradeCost(career, key);
  if (career.cash < cost) return false;
  career.cash -= cost;
  career.upgrades[key]=level(career.upgrades,key)+1;
  return true;
}
export function loadCareer(storage) {
  try {
    const c = JSON.parse(storage.getItem("v10-career-v1"));
    if (!c || c.version !== 1) return newCareer();
    if (
      !Number.isFinite(c.cash) ||
      c.cash < 0 ||
      !Number.isInteger(c.round) ||
      c.round < 1 ||
      c.round > SEASON_LENGTH ||
      !Number.isInteger(c.season) ||
      c.season < 1 ||
      !Array.isArray(c.history) ||
      !Number.isFinite(c.points) ||
      !Number.isFinite(c.seasonPoints)
    )
      return newCareer();
    for(const k of ["suspension","brakes","efficiency","engineer","commercial"])
      if(c.upgrades && c.upgrades[k]===undefined)c.upgrades[k]=0;
    for (const k of Object.keys(UPGRADES))
      if (
        !Number.isInteger(c.upgrades?.[k]) ||
        c.upgrades[k] < 0 ||
        c.upgrades[k] > UPGRADES[k].max
      )
        return newCareer();
    if (c.sponsor && !SPONSORS.some((s) => s.id === c.sponsor))
      c.sponsor = null;
    // Preserve older careers and their progress when adding identity support.
    c.profile =
      c.profile === undefined
        ? { driverName: "Driver", teamIndex: 10 }
        : normalizeProfile(c.profile);
    migrateDevelopment(c);
    return c;
  } catch {
    return newCareer();
  }
}
export function settleCareer(career, result) {
  const legal = !result.dnf && result.legal;
  const format=result.raceFormat ?? career.weekend?.setup?.raceFormat ?? careerSchedule(career).raceFormat;
  const points = legal ? racePoints(result.position,format) : 0;
  const difficulty=normalizeDifficulty(career.weekend?.setup?.difficulty ?? result.difficulty);
  const basePrize=racePrize({...result,legal}).base;
  const difficultyBonus=legal ? Math.round(basePrize*DIFFICULTIES[difficulty].prizeBonus) : 0;
  const prize=basePrize+difficultyBonus;
  const sponsor = SPONSORS.find((s) => s.id === career.sponsor);
  const gridPosition=result.gridPosition ?? ((career.weekend?.grid?.indexOf(21) ?? -1)+1);
  const met=legal && sponsor && sponsorMet(sponsor.id,{...result,raceFormat:format,gridPosition});
  const sponsorBaseBonus=met ? sponsor.amount : 0;
  const bonus=met ? sponsorPayout(career.upgrades,sponsor.amount) : 0;
  const commercialBonus=bonus-sponsorBaseBonus;
  fundTeams(career,result,SPONSORS,DIFFICULTIES[difficulty].prizeBonus);
  career.cash += prize + bonus;
  career.points += points;
  career.seasonPoints += points;
  career.history.unshift({
    season: career.season,
    round: career.round,
    position: result.position,
    dnf: result.dnf,
    legal: result.legal,
    points,
    raceFormat:format,
    prize,
    basePrize,
    difficultyBonus,
    difficulty,
    bonus,commercialBonus,
    sponsor: sponsor?.name || null,
  });
  career.history = career.history.slice(0, 30);
  const seasonEnded = career.round === SEASON_LENGTH;
  // Race prizes and earned contracts fund development equally for all teams.
  const seasonBonus = 0;
  career.cash += seasonBonus;
  career.round++;
  if (seasonEnded) {
    career.round = 1;
    career.season++;
    ensureSeasonOrder(career);
    career.seasonPoints = 0;
  }
  career.sponsor = null;
  career.weekend = null;
  return {
    points,
    raceFormat:format,
    prize,
    basePrize,
    difficultyBonus,
    difficulty,
    bonus,commercialBonus,sponsorBaseBonus,
    sponsor: sponsor?.name,
    met: !!met,
    seasonBonus,
    seasonEnded,
  };
}

function spline(t,anchors,ovalRadius=0) {
 const i=Math.floor(t),f=t-i,n=anchors.length;
 const p0=anchors[wrap(i-1,n)],p1=anchors[wrap(i,n)],p2=anchors[wrap(i+1,n)],p3=anchors[wrap(i+2,n)];
 if(i===0 || ovalRadius && i===2)return [p1[0]+(p2[0]-p1[0])*f,p1[1]];
 // Exact semicircles join both straights tangentially: no spline overshoot
 // or tightening at the oval entries, and no changes to other circuits.
 if(ovalRadius){
  const side=i===1 ? 1 : -1;
  return [p1[0]+side*ovalRadius*Math.sin(Math.PI*f),p1[1]-side*ovalRadius*(1-Math.cos(Math.PI*f))];
 }
 // Horizontal end tangents join the straight without a kink. Limit their
// length to the adjacent corner, so extending the straight adds no overshoot.
 const chord=Math.hypot(p2[0]-p1[0],p2[1]-p1[1]);
 const m1=i===1 ? [chord*1.2,0] : [(p2[0]-p0[0])*.5,(p2[1]-p0[1])*.5];
 const m2=i===n-1 ? [chord*1.2,0] : [(p3[0]-p1[0])*.5,(p3[1]-p1[1])*.5];
 return [0,1].map(k=>(2*f**3-3*f*f+1)*p1[k]+(f**3-2*f*f+f)*m1[k]+(-2*f**3+3*f*f)*p2[k]+(f**3-f*f)*m2[k]);
}
export function makeTrack(circuit=CIRCUITS[0]) {
 // Geometry is expanded, not car performance: longer straights and wider radii
 // let the speed package recover time without removing the technical sections.
 const scale=circuit.layoutScale || 1,anchors=circuitAnchors(circuit).map(p=>p.map(v=>v*scale)),raw=[];let length=0;
 for(let i=0;i<=1400;i++){
  const [x,y]=spline((i/1400)*anchors.length,anchors,(circuit.ovalRadius || 0)*scale),previous=raw.at(-1);
  if(previous)length+=Math.hypot(x-previous.x,y-previous.y);
  raw.push({x,y,s:length});
 }
 const straightLength=anchors[1][0]-anchors[0][0],origin=straightLength*.55+260;
 const originPoint={x:anchors[0][0]+origin,y:anchors[0][1],s:0};
 const pts=[originPoint,...raw.slice(0,-1).filter(p=>p.s>origin).map(p=>({...p,s:p.s-origin})),...raw.slice(0,-1).filter(p=>p.s<origin).map(p=>({...p,s:p.s+length-origin})),{...originPoint,s:length}];
 for(let i=0;i<pts.length-1;i++)pts[i].angle=Math.atan2(pts[i+1].y-pts[i].y,pts[i+1].x-pts[i].x);
 pts.at(-1).angle=pts[0].angle;
 const range=pair=>pair.map(t=>wrap(raw[Math.min(1400,Math.round(t/anchors.length*1400))].s-origin,length));
 const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
 return {...circuit,banks:(circuit.banks || []).map(range),bridges:(circuit.bridges || []).map(range),
  bounds:{minX:Math.min(...xs)-240,maxX:Math.max(...xs)+240,minY:Math.min(...ys)-220,maxY:Math.max(...ys)+450},
  pts,length,width:126,start:0,mainStraight:{from:-origin,to:straightLength-origin,length:straightLength},
  pitEntry:length-origin+90,pitExit:straightLength-origin-90,pitBox:-100};
}
// Shared by race construction, qualifying classification and painted boxes.
export function gridSlot(slot){
 return {s:-(80+Math.floor(slot/2)*60+(slot%2)*24),offset:slot%2===0?-28:28};
}
export let TRACK = makeTrack();
export function sample(s) {
  s = wrap(s, TRACK.length);
  const p = TRACK.pts;
  let lo = 0,
    hi = p.length - 1;
  while (lo + 1 < hi) {
    const m = (lo + hi) >> 1;
    if (p[m].s <= s) lo = m;
    else hi = m;
  }
  const a = p[lo],
    b = p[hi],
    f = (s - a.s) / (b.s - a.s || 1);
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    angle: a.angle + angleDiff(b.angle, a.angle) * f,
    index: lo,
  };
}

export function findApexes() {
  const curves = [],scale=TRACK.layoutScale || 1;
  const curve = (s) =>
    angleDiff(sample(s + 65*scale).angle, sample(s - 65*scale).angle) / (130*scale);
  for (let s = 0; s < TRACK.length; s += 45*scale) {
    const k = curve(s);
    if (
      Math.abs(k) > 0.002/scale &&
      Math.abs(k) >= Math.abs(curve(s - 45*scale)) &&
      Math.abs(k) >= Math.abs(curve(s + 45*scale))
    ) {
      const prior = curves.at(-1);
      if (prior && s - prior.s < 210*scale) {
        if (Math.abs(k) > Math.abs(prior.k)) {
          prior.s = s;
          prior.k = k;
        }
      } else curves.push({ s, k });
    }
  }
  return curves.map((a, i) => {
    const p = sample(a.s),
      side = Math.sign(a.k),
      offset = side * (TRACK.width / 2 - 12);
    return {
      ...a,
      id: i + 1,
      x: p.x - Math.sin(p.angle) * offset,
      y: p.y + Math.cos(p.angle) * offset,
      angle: p.angle,
      side,
    };
  });
}
export let APEXES = findApexes();
export let AI_LINE = buildRacingLine(TRACK,sample,APEXES);
export const MAX_SPEED = 330;
export const PIT_SPEED = 80;
const smootherStep = (t) => {
  t = clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
// Preserve the original smooth pit route; trim its on-track tails at the asphalt edge.
let PIT_ROUTE_ENTRY = TRACK.pitEntry;
let PIT_ROUTE_EXIT = TRACK.pitExit;
export function pitPoint(progress) {
  const span = TRACK.length - PIT_ROUTE_ENTRY + PIT_ROUTE_EXIT;
  progress = clamp(progress, 0, span);
  const fade =
    smootherStep(progress / 400) * smootherStep((span - progress) / 400);
  const p = sample(PIT_ROUTE_ENTRY + progress);
  return {
    x: p.x - Math.sin(p.angle) * 180 * fade,
    y: p.y + Math.cos(p.angle) * 180 * fade,
    progress,
  };
}
export function makePitLane() {
  const span = TRACK.length - PIT_ROUTE_ENTRY + PIT_ROUTE_EXIT,
    pts = [];
  let length = 0;
  for (let progress = 0; progress <= span; progress += 2) {
    const p = pitPoint(progress),
      prev = pts.at(-1);
    if (prev) length += Math.hypot(p.x - prev.x, p.y - prev.y);
    pts.push({ ...p, s: length });
  }
  if (pts.at(-1).progress < span) {
    const p = pitPoint(span),
      prev = pts.at(-1);
    length += Math.hypot(p.x - prev.x, p.y - prev.y);
    pts.push({ ...p, s: length });
  }
  // Interpolate exact edge intersections instead of moving the road laterally.
  const edge = TRACK.width/2;
  let first=pts.findIndex(p => nearest(p.x,p.y).dist>=edge);
  let last=pts.length-1;
  while(nearest(pts[last].x,pts[last].y).dist<edge) last--;
  const crossing=(a,b) => {
    let lo=0,hi=1;
    const increasing=nearest(b.x,b.y).dist>nearest(a.x,a.y).dist;
    for(let i=0;i<30;i++) {
      const f=(lo+hi)/2,dist=nearest(a.x+(b.x-a.x)*f,a.y+(b.y-a.y)*f).dist;
      if((dist<edge)===increasing) lo=f; else hi=f;
    }
    const f=(lo+hi)/2;
    return {x:a.x+(b.x-a.x)*f,y:a.y+(b.y-a.y)*f,progress:a.progress+(b.progress-a.progress)*f};
  };
  const trimmed=[crossing(pts[first-1],pts[first]),...pts.slice(first,last+1),crossing(pts[last],pts[last+1])];
  const entryProgress=trimmed[0].progress,exitProgress=trimmed.at(-1).progress;
  TRACK.pitEntry=PIT_ROUTE_ENTRY+entryProgress;
  TRACK.pitExit=PIT_ROUTE_EXIT-(span-exitProgress);
  length=0;
  for(let i=0;i<trimmed.length;i++) {
    const p=trimmed[i],prev=trimmed[i-1];
    if(prev) length+=Math.hypot(p.x-prev.x,p.y-prev.y);
    p.s=length;p.progress-=entryProgress;
  }
  const boxProgress = TRACK.length - TRACK.pitEntry + TRACK.pitBox;
  const box = trimmed.reduce((a,b) => Math.abs(a.progress-boxProgress)<Math.abs(b.progress-boxProgress) ? a : b);
  return {pts:trimmed,surfacePts:pts.map(p=>({x:p.x,y:p.y})),length,width:76,span:exitProgress-entryProgress,boxDistance:box.s};
}
export let PIT_LANE = makePitLane();
export function samplePit(distance) {
  distance = clamp(distance, 0, PIT_LANE.length);
  let lo = 0,
    hi = PIT_LANE.pts.length - 1;
  while (lo + 1 < hi) {
    const m = (lo + hi) >> 1;
    if (PIT_LANE.pts[m].s <= distance) lo = m;
    else hi = m;
  }
  const a = PIT_LANE.pts[lo],
    b = PIT_LANE.pts[hi],
    f = (distance - a.s) / (b.s - a.s || 1);
  return {
    x: a.x + (b.x - a.x) * f,
    y: a.y + (b.y - a.y) * f,
    progress: a.progress + (b.progress - a.progress) * f,
    angle: Math.atan2(b.y - a.y, b.x - a.x),
  };
}
// Project onto the pit route for an already validated entrance handover.
export function pitEntranceLocation(x,y) {
  let best=null;
  const end=PIT_LANE.boxDistance-100;
  for(let i=0;i<PIT_LANE.pts.length-1 && PIT_LANE.pts[i].s<end;i++) {
    const a=PIT_LANE.pts[i],b=PIT_LANE.pts[i+1];
    const dx=b.x-a.x,dy=b.y-a.y;
    const f=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy),0,1);
    const px=a.x+dx*f,py=a.y+dy*f,separation=Math.hypot(x-px,y-py);
    if(!best || separation<best.separation) best={x:px,y:py,separation,
      distance:a.s+(b.s-a.s)*f,progress:a.progress+(b.progress-a.progress)*f,
      angle:Math.atan2(dy,dx),offset:((x-px)*-dy+(y-py)*dx)/Math.hypot(dx,dy)};
  }
  return best;
}
// Painted boundaries and assisted routing use precisely the same endpoints.
export let PIT_MARKERS={entry:samplePit(0),exit:samplePit(PIT_LANE.length)};
const PIT_BOUNDARY_HALF_LENGTH=55;
export function pitBoundaryMark(name) {
  const marker=PIT_MARKERS[name],s=nearest(marker.x,marker.y).s;
  const points=[];
  for(let d=-PIT_BOUNDARY_HALF_LENGTH;d<=PIT_BOUNDARY_HALF_LENGTH;d+=5) {
    const p=sample(s+d),offset=TRACK.width/2+1;
    points.push({x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset});
  }
  const p=sample(s),offset=TRACK.width/2+15;
  let angle=p.angle;
  if(Math.cos(angle)<0) angle+=Math.PI;
  return {points,label:{x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset,angle}};
}
export function selectTrack(id="northline") {
  const circuit=circuitById(id);
  if(TRACK.id===circuit.id) return TRACK;
  TRACK=makeTrack(circuit);PIT_ROUTE_ENTRY=TRACK.pitEntry;PIT_ROUTE_EXIT=TRACK.pitExit;
  PIT_LANE=makePitLane();APEXES=findApexes();AI_LINE=buildRacingLine(TRACK,sample,APEXES);
  PIT_MARKERS={entry:samplePit(0),exit:samplePit(PIT_LANE.length)};
  return TRACK;
}
// Follow the on-track tail of the real pit route, reaching its painted edge
// only at the entrance. Blend from the racing line instead of hugging grass.
export function aiPitApproach(s){
 const distance=wrap(TRACK.pitEntry-s+TRACK.length/2,TRACK.length)-TRACK.length/2;
 if(distance>900 || distance< -80)return null;
 const offsetAt=at=>{
  const toEntry=wrap(TRACK.pitEntry-at+TRACK.length/2,TRACK.length)-TRACK.length/2;
  const progress=Math.max(0,TRACK.pitEntry-PIT_ROUTE_ENTRY-toEntry);
  const span=TRACK.length-PIT_ROUTE_ENTRY+PIT_ROUTE_EXIT;
  const routeOffset=180*smootherStep(progress/400)*smootherStep((span-progress)/400);
  const pitSide=TRACK.width/2-20,blend=smootherStep((900-toEntry)/550);
  // Establish the pit-side lane early; do not sweep back to the racing line
  // before following the actual paved turn-in at the marked entrance.
  return Math.max(racingPoint(AI_LINE,at).offset*(1-blend)+pitSide*blend,routeOffset);
 };
 return {distance,offset:offsetAt(s),slope:(offsetAt(s+4)-offsetAt(s-4))/8};
}
// Entry is a one-way gate, not proximity to any point along the pit road.
export function crossesPitEntry(previous,car,entryS){
 if(!Number.isFinite(entryS) || Math.abs(car.s-entryS)>80)return false;
 const gate=PIT_MARKERS.entry,tx=Math.cos(gate.angle),ty=Math.sin(gate.angle);
 const dx=car.x-previous.x,dy=car.y-previous.y,travel=Math.max(.001,Math.hypot(dx,dy));
 const road=sample(TRACK.pitEntry),rx=Math.cos(road.angle),ry=Math.sin(road.angle);
 if((dx*tx+dy*ty)/travel<.5 || dx*rx+dy*ry<=0)return false;
 // The orange marking runs along the road edge. A driver may cross any
 // paved part of that marking, not only the pit route's centre point.
 const edge=TRACK.width/2+1;
 const inside=(previous.x-road.x)*-ry+(previous.y-road.y)*rx-edge;
 const outside=(car.x-road.x)*-ry+(car.y-road.y)*rx-edge;
 if(inside<=0 && outside>=0 && outside-inside>.0001){
  const f=-inside/(outside-inside),x=previous.x+dx*f,y=previous.y+dy*f;
  const along=(x-road.x)*rx+(y-road.y)*ry;
  if(Math.abs(along)<=PIT_BOUNDARY_HALF_LENGTH && pitEntranceLocation(x,y).separation<=PIT_LANE.width/2-1)return true;
 }
 // Cars already following the outside half of the entrance can also cross
 // the route start. This never accepts a late join further down the lane.
 const before=(previous.x-gate.x)*tx+(previous.y-gate.y)*ty;
 const after=(car.x-gate.x)*tx+(car.y-gate.y)*ty;
 if(before>0 || after<0 || after-before<.0001)return false;
 const f=-before/(after-before),x=previous.x+dx*f,y=previous.y+dy*f;
 const lateral=(x-gate.x)*-ty+(y-gate.y)*tx;
 return Math.abs(lateral)<=PIT_LANE.width/2-3 && nearest(x,y,entryS).offset>=TRACK.width/2-2;
}
export const trackLayer=s=>(TRACK.bridges || []).some(([a,b])=>wrap(s,TRACK.length)>=a && wrap(s,TRACK.length)<=b) ? 1 : 0;
export function bankingGrip(s) {
  for(const [a,b] of TRACK.banks || []) if(wrap(s,TRACK.length)>=a && wrap(s,TRACK.length)<=b)
    return 1+.16*Math.sin(Math.PI*(wrap(s,TRACK.length)-a)/(b-a));
  return 1;
}
export function tyreServiceTime(crew=0,random=Math.random) {
  const maximum=Math.max(2.3,5.5-clamp(crew,0,4)*.5);
  return 2.3+clamp(random(),0,1)*(maximum-2.3);
}
export function raceProgress(car) {
  if(car.s<0 && !(car.completedLaps>0)) return car.s;
  const laps=Math.max(car.completedLaps || 0,Math.floor(Math.max(0,car.s)/TRACK.length));
  return laps*TRACK.length+wrap(car.s,TRACK.length);
}
export function updateRaceLaps(car,oldS) {
  car.completedLaps=Math.max(car.completedLaps || 0,Math.floor(Math.max(0,oldS)/TRACK.length));
  if(oldS<0) return false;
  const before=wrap(oldS,TRACK.length), after=wrap(car.s,TRACK.length);
  const change=after-before;
  if(change < -TRACK.length/2) {car.completedLaps++;return true;}
  if(change > TRACK.length/2) car.completedLaps=Math.max(0,car.completedLaps-1);
  return false;
}
export function liveInterval(ahead,car) {
  if(car.dnf)return "DNF";
  const distance=Math.max(0,raceProgress(ahead)-raceProgress(car));
  const laps=Math.floor(distance/TRACK.length),seconds=intervalSeconds(ahead,car,raceProgress(car));
  const base=car===ahead ? "LEAD" : laps ? `+${laps} LAP${laps>1 ? "S" : ""}` :
    seconds===null ? "—" : "+"+seconds.toFixed(1);
  // Unserved penalties affect final classification, never the physical gap.
  return base+(car.penalty ? ` · +${car.penalty}s PEN` : "")+(car.pit ? " · PIT" : "");
}
export function cleanAirTopSpeed(car){
  const mode=paceMode(car).top;
  const pack=aeroPackage(car.upgrades,car.aeroSpec);
  return Math.min(MAX_SPEED,MAX_SPEED*(1+level(car.upgrades,"engine")*.035)*(car.pace || 1)*(1-car.fuel*.0006))*mode*pack.top;
}
export function estimatedPitLoss(car){
 const service=(2.3+Math.max(2.3,5.5-level(car.upgrades,"crew")*.5))/2;
 const straightSpeed=Math.min(cleanAirTopSpeed(car),300);
 return Math.max(8,PIT_LANE.length/PIT_SPEED-(TRACK.length-TRACK.pitEntry+TRACK.pitExit)/Math.max(160,straightSpeed)+service);
}
export function maximumSpeed(car){return cleanAirTopSpeed(car)+18*(car.slipstream?.carry || 0);}
export function acceleration(car) {
  const basePower=90*(car.pace || 1)*(1-car.fuel*.002);
  const power=basePower*(1+level(car.upgrades,"engine")*.07)*paceMode(car).power;
  const pack=aeroPackage(car.upgrades,car.aeroSpec);
  // Engine development adds thrust at every speed without increasing aerodynamic drag.
  const drag=basePower*.82*(Math.max(0,car.speed)/MAX_SPEED)**1.3*pack.drag;
  const tow=car.slipstream?.strength || 0;
  // The aero package scales the clean-air ceiling; a tow reduces resistance.
  // Once clear, the additional kinetic energy decays instead of a speed snap.
  if(car.speed>cleanAirTopSpeed(car)+.01 && tow<.02)return 0;
  // Keep corner exits responsive; use progressively less net thrust near the
  // package ceiling. Engine power, Push and a tow still improve acceleration.
  const approach=clamp((car.speed/maximumSpeed(car)-.60)/.40,0,1);
  const reserve=1-.84*approach*approach*(3-2*approach);
  return Math.max(0,power-drag*(1-.16*tow)-4-car.speed*.012-Math.max(0,car.speed-MAX_SPEED*pack.top)*.55)*reserve;
}
function overspeedDrag(car){return Math.max(0,car.speed-cleanAirTopSpeed(car))*.6*(1-(car.slipstream?.strength || 0));}
// Passive loss from a held slide, shared by player and AI. Braking force is
// still limited independently by the current front-tyre grip.
export const slidingResistance=(speed,slide,slip)=>Math.max(0,speed)*(.012*slide+.015*Math.sin(slip)**2);
export function tyreRuleMet(car) {
  return (
    car.raceFormat==="sprint" ||
    car.used.has("I") ||
    car.used.has("W") ||
    ["S", "M", "H"].filter((t) => car.used.has(t)).length >= 2
  );
}
export function updateTrackLimits(car, dt, distance) {
  if (distance > TRACK.width / 2 + 8) {
    car.limitOutside = (car.limitOutside || 0) + dt;
    car.limitInside = 0;
    if (car.qStart !== undefined) car.qInvalid = true;
    if (car.limitOutside > 0.08 && !car.limitExcursion) {
      car.limitExcursion = true;
      car.trackLimits = (car.trackLimits || 0) + 1;
      if (car.qStart !== undefined) return "Lap deleted: track limits";
      if (car.trackLimits % 4 === 0) {
        car.penalty += 5;
        car.penalties++;
        car.penaltySecondsTotal = (car.penaltySecondsTotal || 0) + 5;
        return "Track limits: 5-second penalty";
      }
      return `Track limits warning ${car.trackLimits % 4}/3`;
    }
  } else if (distance < TRACK.width / 2 - 3) {
    car.limitInside = (car.limitInside || 0) + dt;
    if (car.limitInside > 0.35) {
      car.limitExcursion = false;
      car.limitOutside = 0;
    }
  }
  return null;
}
export function nearest(x, y,hintS) {
  let localBest=Infinity,localOut;
  let best = Infinity,
    out;
  for (let i = 0; i < TRACK.pts.length - 1; i++) {
    const a = TRACK.pts[i],
      b = TRACK.pts[i + 1],
      dx = b.x - a.x,
      dy = b.y - a.y,
      t = clamp(((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy), 0, 1),
      px = a.x + dx * t,
      py = a.y + dy * t,
      d = (x - px) ** 2 + (y - py) ** 2;
    const gap=hintS===undefined ? Infinity : Math.abs(wrap(a.s+(b.s-a.s)*t-hintS+TRACK.length/2,TRACK.length)-TRACK.length/2);
    if(gap<450 && d<localBest) {
      localBest=d;localOut={s:a.s+(b.s-a.s)*t,dist:Math.sqrt(d),offset:(x-px)*-Math.sin(a.angle)+(y-py)*Math.cos(a.angle),angle:a.angle+angleDiff(b.angle,a.angle)*t,index:i};
    }
    if (d < best) {
      best = d;
      out = {
        s: a.s + (b.s - a.s) * t,
        dist: Math.sqrt(d),
        offset: (x - px) * -Math.sin(a.angle) + (y - py) * Math.cos(a.angle),
        angle: a.angle + angleDiff(b.angle, a.angle) * t,
        index: i,
      };
    }
  }
  // A bridge is a separate route even when a slide takes the car beyond its
  // painted edge. Switching to the closer road below freezes progress when
  // the anti-shortcut guard rejects that several-thousand-metre jump.
  // Retain continuity throughout the recoverable verge; distant recoveries
  // still use the global projection and the existing travelled-distance guard.
  return TRACK.bridges.length && localOut && localBest<160**2 ? localOut : out;
}
export function capturePoses(cars) {
  for(const c of cars) c.previousPose={x:c.x,y:c.y,angle:c.angle,s:c.s,speed:c.speed};
}
export function interpolatedCar(car,alpha=1) {
  const old=car.previousPose;
  if(!old) return car;
  const t=clamp(alpha,0,1);
  return {...car,x:old.x+(car.x-old.x)*t,y:old.y+(car.y-old.y)*t,
    angle:old.angle+angleDiff(car.angle,old.angle)*t,
    s:old.s+(car.s-old.s)*t,speed:old.speed+(car.speed-old.speed)*t};
}
export function grip(car, axis="all") {
  const t = TYRES[car.tyre];

  const wheels=car.wheelWear;
  const wear=wheels?.length===4 && Math.abs(wheels.reduce((a,b)=>a+b,0)/4-car.wear)<.001
    ? (axis==="front" ? (wheels[0]+wheels[1])/2 : axis==="rear" ? (wheels[2]+wheels[3])/2 : car.wear) : car.wear;
  const condition=tyreWearFactor(car.tyre,wear,level(car.upgrades,"tyres"));
  return (
    t.grip *
    bankingGrip(car.s || 0) *
    thermalGrip(car,axis) *
    condition *
    aeroGrip(car) *
    tyreWeatherGrip(car.tyre, car.trackWetness || 0) *
    // Surface grip falls for every compound; tyre suitability remains separate.
    (1-.28*clamp(car.trackWetness || 0,0,1)**.8) *
    (Math.abs(car.offset || 0) > TRACK.width / 2 - 7
      ? 1 - (car.trackWetness || 0) * 0.2
      : 1)
  );
}
// Wet tyres can put power down on dry asphalt even though their soft tread
// still has weaker lateral grip and overheats rapidly (see resources).
// Both controllers have the same grip-limited brakes. No minimum grip bonus
// for AI on worn slicks in rain; lower grip must mean a longer stopping zone.
export function brakingDeceleration(car) {
  return Math.min(300,240+level(car.upgrades,"brakes")*12)*grip(car,"front");
}
export function accelerationGrip(car,rearGrip=grip(car,"rear")) {
  const lateral=rearGrip*(1+level(car.upgrades,"suspension")*.025);
  if(!["I","W"].includes(car.tyre)) return lateral;
  const water=clamp(car.trackWetness || 0,0,1);
  const suitability=tyreWeatherGrip(car.tyre,water);
  const dryBoost=1-clamp(water/(car.tyre === "W" ? .45 : .2),0,1);
  const longitudinal=suitability+Math.max(0,.96-suitability)*dryBoost;
  return lateral*longitudinal/suitability;
}
// Traffic forecasts use the same mechanical limits as the driving controller.
// Normalize banking so cars at different ends of a bend are compared fairly.
export function passingPerformance(car,difficulty="normal",contact=null) {
 if(!car)return null;
 const water=car.trackWetness || 0,style=car.driverStyle || {wetSkill:.7,pace:1};
 const skill=DIFFICULTIES[normalizeDifficulty(difficulty)],bank=bankingGrip(car.s || 0);
 const commitment=car.player ? 1 : clamp((.98+water*.04*style.wetSkill)*(car.pace || 1)*style.pace*(car.ai?.pace || 1)*(1-car.fuel*.002),.65,1.035);
 const brakingSkill=car.player ? 1 : Math.min(1,skill.braking+water*.14*style.wetSkill);
 const throttleSkill=car.player ? 1 : Math.min(1,skill.throttle+water*.10*style.wetSkill);
 return {grip:(contact?.all ?? grip(car))/bank,rearGrip:(contact?.rear ?? grip(car,"rear"))/bank,braking:(contact ? Math.min(300,240+level(car.upgrades,"brakes")*12)*contact.front : brakingDeceleration(car))*brakingSkill/bank,
  top:maximumSpeed(car),commitment,aero:{level:level(car.upgrades,"aero"),corner:aeroPackage(car.upgrades,car.aeroSpec).corner,gripScale:aeroGrip(car)},
  acceleration:acceleration({...car,speed:clamp(car.speed,180,280)})*clamp(accelerationGrip(car,contact?.rear),.25,1)*throttleSkill};
}
export function targetSpeed(car, s = car.s) {
  let curv = 0;
  for (let d = 0; d <= 230; d += 35) {
    const a = sample(s + d).angle,
      b = sample(s + d + 55).angle;
    curv = Math.max(curv, Math.abs(angleDiff(b, a)) / 55);
  }
  return (
    clamp(
      Math.sqrt((225 * grip(car)) / Math.max(curv, 0.0006)),
      65 + 65 * clamp(grip(car),0,1),
      MAX_SPEED,
    ) *
    (car.pace || 1) *
    (1 + (car.upgrades?.engine || 0) * 0.012)
  );
}
export function drivingTyreEffort(car,{qualifying=!!car.qualifyingRun,slide=car.sliding || 0,brake=0,steer=0}={}) {
  const base=qualifying && car.qState!=="timed" ? .45 : paceMode(car).wear;
  return base*(1+clamp(slide,0,1)*.5+clamp(brake,0,1)*clamp(steer,-1,1)**2*.15);
}
export function resources(car, dt, distance, effort = 1, load = {}) {
  updateTyreTemperatures(car,dt,load);
  const previousWear=car.wear;
  car.tyreAge += distance;
  car.wear = clamp(
    car.wear +
      (distance / (TRACK.length * TYRES[car.tyre].life)) *
        effort * thermalWear(car) *
        (car.tyre === "I" || car.tyre === "W"
          ? 1 +
            Math.max(
              0,
              (car.tyre === "W" ? 0.55 : 0.28) - (car.trackWetness || 0),
            ) *
              5
          : 1 - (car.trackWetness || 0) * 0.25) *
        (1 - (car.upgrades?.tyres || 0) * 0.07),
    0,
    1.12,
  );
  const wearAmount=car.wear-previousWear;car.wear=previousWear;distributeWear(car,wearAmount,load);
  // Fuel follows the power map and actual load, independently of the tyre effort.
  const fuelLoad=load.throttle==null ? 1 : .82+.18*clamp(load.throttle,0,1);
  car.fuel=Math.max(0,car.fuel-distance/TRACK.length*fuelPerLap(car.drive,car.upgrades,fuelLoad));
  if (car.tyreSet) {
    car.tyreSet.wear = car.wear;
    car.tyreSet.distance += distance;
    if (distance > 0) car.tyreSet.used = true;
  }
}
export function chooseNextTyre(car, laps) {
  const remaining = laps - car.s / TRACK.length;
  if (remaining <= TYRES.S.life * 0.9 && car.tyre !== "S") return "S";
  if (remaining > 8) return "H";
  return car.tyre === "M" ? "H" : "M";
}
export function createDriverStyle(random) {
  return {aggression:.2+random()*.8,consistency:.55+random()*.43,
    wetSkill:.5+random()*.48,tyreCare:.65+random()*.35,
    pace:.975+random()*.05,line:(random()-.5)*28,phase:random()*Math.PI*2};
}
function createCar(i, setup, upgrades, mode) {
  const team = TEAMS[Math.floor(i / 2)];
  const player = i === 21;
  const {s,offset:off}=gridSlot(i);
  const
    p = sample(s);
  const tyre = player ? setup.tyre : ["M", "S", "H"][i % 3];
  return {
    id: i,
    gridPosition: i + 1,
    team,
    player,
    name: player
      ? "YOU"
      : team.name.split(" ")[0].toUpperCase().slice(0, 3) + " " + ((i % 2) + 1),
    x: p.x - Math.sin(p.angle) * off,
    y: p.y + Math.cos(p.angle) * off,
    angle: p.angle,
    s,
    speed: 0,
    sideSpeed: 0,
    offset: off,
    tyre,
    wear: 0,
    tyreAge: 600,
    fuel: player ? setup.fuel : setup.laps * 1.1 + 0.9,
    pace: player
      ? mode === "career"
        ? 0.94
        : 1
      : team.pace * (0.99 + (i % 2) * 0.008),
    upgrades: player
      ? { ...upgrades }
      : { engine: 0, aero: 0, tyres: 0, crew: 0 },
    used: new Set([tyre]),
    stops: 0,
    pit: null,
    penalty: 0,
    penalties: 0,
    contacts: 0,
    contactCooldown: 0,
    finished: false,
    dnf: false,
    finishTime: null,
    lastLap: 0,
    bestLap: Infinity,
    lapStart: 0,
    drive: "balanced",
    raceFormat:raceFormat(setup),
    trackLimits: 0,
    limitExcursion: false,
    limitOutside: 0,
    limitInside: 0,
    penaltySecondsTotal: 0,
    weatherPitTime: -100,
    history: [],
  };
}
export class Race {
  constructor(setup, upgrades = {}, mode = "quick", profile = null) {
    if(mode==="career" && setup.playerUpgrades)upgrades=setup.playerUpgrades;
    setup={...setup,raceFormat:setup.raceFormat ?? (mode==="quick" ? quickRaceFormat(setup.laps) : "grandPrix")};
    selectTrack(setup.track);
    this.setup = {...setup,track:TRACK.id};
    this.laps = setup.laps;
    this.mode = mode;
    this.difficulty=normalizeDifficulty(setup.difficulty);
    this.aiSeed=(setup.aiSeed ?? Math.floor(Math.random()*2147483646)+1) >>> 0;
    this.raceSeed=this.aiSeed;
    this.weather = createWeather(setup.weather || "dry",{seed:setup.weatherSeed ?? (this.raceSeed^0x9e3779b9)>>>0,duration:raceWeatherDuration(this.laps,TRACK.length)});
    this.time = 0;
    this.countdown = 4;
    this.cars = Array.from({ length: 22 }, (_, i) =>
      createCar(i, setup, upgrades, mode),
    );
    this.setup.aiSeed=this.raceSeed;
    this.aiRandom=()=>{
      this.aiSeed=(Math.imul(this.aiSeed,1664525)+1013904223)>>>0;
      return this.aiSeed/4294967296;
    };
    for(const c of this.cars) {
      c.driverStyle=createDriverStyle(this.aiRandom);
      const level=DIFFICULTIES[this.difficulty];
      c.driverStyle.pace*=level.pace;
      c.driverStyle.consistency=clamp(c.driverStyle.consistency+level.skill,.4,.99);
      c.driverStyle.wetSkill=clamp(c.driverStyle.wetSkill+level.skill,.4,.99);
      c.aiRandom=seededRandom(driverSeed(this.raceSeed,c.id));
      c.ai={strategy:createStrategy(c.aiRandom),lineVelocity:0,mode:"cruise",pace:1,nextDecision:this.aiRandom()*5,
        mistakeUntil:0,mistake:null,slip:0};
    }
    for(const c of this.cars)if(!c.player){
      c.tyre=this.chooseAIStartingTyre(c).compound;c.used=new Set([c.tyre]);
      c.ai.strategy.nextReview=c.aiRandom()*7;
    }
    this.player = this.cars[21];
    if (mode === "quick") {
      const requested = Number(setup.startingPosition ?? 22);
      const position = Number.isFinite(requested) ? clamp(Math.round(requested), 1, 22) : 22;
      this.setup.startingPosition = position;
      const grid = this.cars.filter(c => !c.player);
      grid.splice(position - 1, 0, this.player);
      for (const [slot, car] of grid.entries()) {
        car.gridPosition = slot + 1;
        Object.assign(car,gridSlot(slot));
        const p = sample(car.s);
        car.x = p.x - Math.sin(p.angle) * car.offset;
        car.y = p.y + Math.cos(p.angle) * car.offset;
        car.angle = p.angle;
      }
    }
    const identity = normalizeProfile(profile);
    if (mode === "career" && identity) {
      // Swap seats to retain two cars per team and the player's back-row start.
      const displaced = this.cars[identity.teamIndex * 2 + 1];
      if (displaced !== this.player) {
        displaced.team = this.player.team;
        displaced.name =
          displaced.team.name.split(" ")[0].toUpperCase().slice(0, 3) + " 2";
        displaced.pace = displaced.team.pace * 0.998;
      }
      this.player.team = TEAMS[identity.teamIndex];
      this.player.name = identity.driverName;
    }
    this.player.upgrades=normalizeUpgrades(upgrades);
    this.player.aeroSpec=aeroPackage(upgrades,setup.aeroSpec)===AERO_PACKAGES.balanced ? "balanced" : setup.aeroSpec;
    for(const car of this.cars)if(!car.player){
      const team=setup.teamDevelopment?.find(t=>t.teamIndex===TEAMS.indexOf(car.team));
      if(team){car.upgrades=normalizeUpgrades(team.upgrades);car.aeroSpec=aeroPackage(car.upgrades,team.aeroSpec)===AERO_PACKAGES.balanced ? "balanced" : team.aeroSpec;}
      car.fuel*=fuelMultiplier(car.upgrades);
      car.ai.strategy.forecastHorizon+=level(car.upgrades,"engineer")*15;
    }
    this.pitRequested = false;
    this.pitLimiter = false;
    this.autoPitLimiter = true;
    this.nextTyre = setup.tyre === "M" ? "H" : "M";
    this.nextAeroSpec = this.player.aeroSpec;
    for(const car of this.cars){car.tyreTemperatureEnabled=setup.tyreTemperatureEnabled!==false;prepareTyres(car,null,true);}
    this.tyreTemperatureEnabled=setup.tyreTemperatureEnabled!==false;
    this.message = "Get ready. Find your braking points.";
    this.messageUntil = 8;
    this.done = false;
    this.particles = [];
    this.skids = [];
    this.result = null;
    this.settled = false;
  }
  say(msg) {
    this.message = msg;
    this.messageUntil = this.time + 6;
  }
  order() {
    return [...this.cars].sort((a, b) => {
      if (a.finished && b.finished) return (a.trackFinishTime ?? a.finishTime-(a.penalty || 0))-(b.trackFinishTime ?? b.finishTime-(b.penalty || 0));
      if (a.finished) return -1;
      if (b.finished) return 1;
      if (a.dnf !== b.dnf) return a.dnf ? 1 : -1;
      return raceProgress(b)-raceProgress(a) || a.gridPosition-b.gridPosition;
    });
  }
  classification() {
    return [...this.cars].sort((a,b)=>{
      if(a.finished && b.finished) return a.finishTime-b.finishTime;
      if(a.finished) return -1;
      if(b.finished) return 1;
      if(a.dnf!==b.dnf) return a.dnf ? 1 : -1;
      return raceProgress(b)-raceProgress(a) || a.gridPosition-b.gridPosition;
    });
  }
  requestPit() {
    if (this.player.pit) return;
    if(this.pitRequested){
      this.pitRequested=false;
      this.player.ai.pitEntryS=null;
      this.say("Pit request cancelled.");
      return;
    }
    if (this.player.finished || this.player.dnf) return;
    this.pitRequested=true;
    this.say(this.autoPitLimiter ? "Box this lap. Steer into the separate pit road; assistance starts at its entrance." : "Box this lap. Steer into the pit road and slow to 80 km/h before its entrance.");
  }
  togglePitLimiter() {
    if(this.autoPitLimiter) { this.say("Pit limiter is automatic. Choose manual control in Settings to use P."); return; }
    this.pitLimiter = !this.pitLimiter;
    this.say(
      this.pitLimiter
        ? "Pit limiter ON · 80 km/h. P to release."
        : "Pit limiter OFF. Watch the 80 km/h pit limit.",
    );
  }
  penalizePitSpeed(car) {
    if (car.player && car.speed > PIT_SPEED + 0.5 && !car.pit.speeding) {
      car.pit.speeding = true;
      car.penalty += 5;
      car.penalties++;
      car.penaltySecondsTotal = (car.penaltySecondsTotal || 0) + 5;
      this.say("Pit speeding. 5-second penalty.");
    }
  }
  canSelectAero() {
    const c=this.player;
    return !this.done && level(c.upgrades,"aero")>=1 &&
      (!this.qualifying || !!c.pit && (c.garage || c.pit.stage==="service"));
  }
  selectAero(spec) {
    if(!this.canSelectAero() || !AERO_PACKAGES[spec])return false;
    const c=this.player,p=c.pit;
    this.nextAeroSpec=spec;
    if(p && !p.serviced && p.stage!=="service")p.nextAeroSpec=spec;
    if(p && (p.stage==="service" || c.garage)) {
      if((p.nextAeroSpec || c.aeroSpec)===spec)return true;
      // Tyre/penalty work is followed by ten seconds of aero work. Changing
      // the order restarts only the unfinished aero task, never the tyre job.
      const otherWork=Math.max(0,(p.timer || 0)-(p.aeroRemaining || 0));
      p.nextAeroSpec=spec;
      p.aeroRemaining=spec===c.aeroSpec ? 0 : 10;
      p.timer=otherWork+p.aeroRemaining;p.aeroServiceSeconds=p.aeroRemaining;
      if(p.serviced){p.previousSet=c.tyreSet;p.nextSet=c.tyreSet;p.nextTyre=c.tyre;}
      p.serviced=p.timer===0;p.stage=p.serviced ? "exit" : "service";
      c.speed=0;c.qNeedsRelease=true;
    }
    this.say(spec===c.aeroSpec ? "Keeping the fitted aero package." :
      AERO_PACKAGES[spec].name+" selected · adds 10 seconds in the pit box.");
    return true;
  }
  pitEntryTarget(car,requested){
    if(!requested){car.ai.pitEntryS=null;return null;}
    if(car.ai.pitEntryS==null || car.s>car.ai.pitEntryS+80){
      const next=car.s+wrap(TRACK.pitEntry-car.s,TRACK.length),current=next-TRACK.length;
      car.ai.pitEntryS=car.player && car.s-current<=PIT_BOUNDARY_HALF_LENGTH ? current : next;
    }
    return car.ai.pitEntryS;
  }
  tryEnterPit(car,previous,entryS){
    if(car.pit || !crossesPitEntry(previous,car,entryS))return false;
    this.enterPit(car);
    if(car.pit && car.slipstream){car.slipstream.strength=0;car.slipstream.carry=0;}
    return !!car.pit;
  }
  // Service setup is called only after tryEnterPit validates a forward crossing.
  enterPit(car) {
    let nextSet = null;
    const aiChoice=!car.player ? (!this.qualifying && car.ai.strategy.choice) || this.chooseAITyres(car,this.qualifying ? 3 : undefined)[0]?.set : null;
    if (car.tyreInventory) {
      const available = selectableSets(car.tyreInventory,car.tyrePhase || "R",this.qualifying ? null : car.tyreSet?.id);
      const desired = car.player ? this.nextSetId : aiChoice?.id || (this.qualifying && car.tyre === car.weatherTarget ? car.tyreSet?.id : null);
      nextSet =
        available.find((t) => t.id === desired) ||
        available
          .filter(
            (t) =>
              t.compound ===
              (car.player
                ? this.nextTyre
                : aiChoice?.compound || car.weatherTarget || chooseNextTyre(car, this.laps)),
          )
          .sort((a, b) => a.wear - b.wear)[0] ||
        available.sort((a, b) => a.wear - b.wear)[0];
      if (!nextSet) {
        if (car.player) {
          this.pitRequested = false;
          this.say("No available tyre set. Pit request cancelled.");
        }
        return;
      }
    }
    // Capture the physical entrance position, preserving lateral placement.
    const entry = pitEntranceLocation(car.x,car.y);
    const close = entry.separation < PIT_LANE.width/2;
    const entryDistance = close ? entry.distance : 0;
    const entryProgress = close ? entry.progress : clamp(wrap(car.s, TRACK.length)-TRACK.pitEntry,0,25);
    const entryLoc=samplePit(entryDistance),entryOffset=close ? entry.offset : 0;
    // The painted mouth extends before the trimmed centreline starts. Blend
    // its remaining longitudinal displacement too, so assistance never snaps.
    const entryShiftX=close ? car.x-(entryLoc.x-Math.sin(entryLoc.angle)*entryOffset) : 0;
    const entryShiftY=close ? car.y-(entryLoc.y+Math.cos(entryLoc.angle)*entryOffset) : 0;
    car.weatherPitTime = this.time;
    car.pit = {
      distance: entryDistance,
      entryDistance,
      stage: "entry",
      timer: 0,
      serviced: false,
      boxDistance: this.pitBoxForCar(car),
      startS: car.s - entryProgress,
      entryOffset,entryShiftX,entryShiftY,
      speeding: false,
      nextTyre:
        nextSet?.compound ||
        (car.player
          ? this.nextTyre
          : aiChoice?.compound || car.weatherTarget || chooseNextTyre(car, this.laps)),
      nextSet,
      previousSet: car.tyreSet,
      nextAeroSpec: car.player ? this.nextAeroSpec : car.aeroSpec,
      entryWear:car.wear,entryWater:car.trackWetness || 0,entryTime:this.time,
    };
    if(!car.player && !this.qualifying){
      car.ai.strategy.pitRequested=false;
      car.ai.strategy.lastStop=this.time;
      car.ai.strategy.choice=null;
    }
    if (car.player) {
      this.pitRequested = false;
      this.say(
        this.autoPitLimiter ? "Automatic pit stop engaged. Speed, box stop and exit are handled for you." : this.pitLimiter
          ? "Box confirmed. Limiter ON · crew ready."
          : "In pit lane. Press P for the 80 km/h limiter.",
      );
    }
    if(car.player && this.autoPitLimiter) { this.pitLimiter=true; car.speed=Math.min(car.speed,PIT_SPEED); }
    this.penalizePitSpeed(car);
    car.speed = Math.min(
      car.speed,
      car.player && !this.pitLimiter ? 180 : PIT_SPEED,
    );
  }
  pitBoxForCar(car) {
    return (
      PIT_LANE.boxDistance +
      (TEAMS.findIndex((t) => t.name === car.team.name) - 5) * 40
    );
  }
  stepPit(car, dt, input = {}) {
    const p = car.pit;
    if(p.stage==="service")updateTyreTemperatures(car,dt);
    if(car.player && this.autoPitLimiter) this.pitLimiter=true;
    if (p.stage === "service") {
      p.timer = Math.max(0,p.timer-dt);
      p.aeroRemaining=Math.min(p.aeroRemaining || 0,p.timer);
      car.speed = 0;
      if (p.timer <= 0) {
        if(p.nextAeroSpec && p.nextAeroSpec!==car.aeroSpec) {
          car.aeroSpec=p.nextAeroSpec;
          if(car.player){
            this.nextAeroSpec=car.aeroSpec;
            if(this.weekend)this.weekend.setup.aeroSpec=car.aeroSpec;
          }
        }
        car.tyre = p.nextTyre;
        car.used.add(car.tyre);
        car.wear = p.nextSet?.wear || 0;
        car.tyreSet = p.nextSet || null;
        if (p.nextSet !== p.previousSet || (!this.qualifying && !p.nextSet) || !car.tyreTemperatures) {car.tyreAge = 0;prepareTyres(car,p.nextSet);}
        car.stops++;
        car.history.push({
          lap: Math.max(1, Math.floor(car.s / TRACK.length) + 1),
          tyre: car.tyre,
          aeroSpec:car.aeroSpec,aeroSeconds:p.aeroServiceSeconds || 0,
          time: this.time,
          entryTime:p.entryTime,wear:p.entryWear,water:p.entryWater,
          reason:car.player ? "requested" : car.ai.strategy.reason || (this.qualifying ? "in lap" : "tyres"),
        });
        p.stage = "exit";
        p.serviced = true;
        if (car.player)
          this.say(
            (this.qualifying && p.nextSet === p.previousSet ? "Fitted tyres retained. Limiter " : "Tyres fitted. Limiter ") +
              (this.pitLimiter
                ? this.autoPitLimiter ? "ON — releases automatically at exit." : "ON — release with P after exit."
                : "OFF — keep below 80 in the lane."),
          );
      }
    } else {
      const cap = car.player && !this.pitLimiter ? 180 : PIT_SPEED;
      const remaining = p.boxDistance - p.distance;
      const automatic=!car.player || this.autoPitLimiter;
      let target = !automatic
        ? input.reverse || (input.brake && car.speed<=.5 && (p.serviced || Math.abs(remaining)>20))
          ? -30
          : input.brake ? 0 : input.throttle ? cap : 0
        : !p.serviced
          ? Math.min(PIT_SPEED, Math.sqrt(Math.max(0, remaining) * 280))
          : PIT_SPEED;
      if(automatic && p.serviced){
        const exitRemaining=PIT_LANE.length-p.distance;
        if(exitRemaining<140){
          const arrival=exitRemaining/Math.max(25,car.speed),exitS=p.startS+PIT_LANE.span;
          const blocked=this.cars.some(other=>{
            if(other===car || other.pit || other.garage || other.dnf || other.finished || other.offset<24)return false;
            const gap=wrap(other.s-exitS+TRACK.length/2,TRACK.length)-TRACK.length/2;
            return Math.abs(gap+other.speed*arrival)<65 || Math.abs(gap)<45;
          });
          if(blocked)target=Math.min(target,Math.sqrt(Math.max(0,exitRemaining-35)*280));
        }
      }
      const rate = !automatic
        ? input.brake
          ? 240
          : input.throttle || input.reverse
            ? 80
            : 16
        : 180;
      car.speed = clamp(
        car.speed + clamp(target - car.speed, -rate * dt, rate * dt),
        automatic ? 0 : -30,
        cap,
      );
      if (car.fuel <= 0) car.speed = Math.max(0, car.speed - 55 * dt);
      this.penalizePitSpeed(car);
      const occupied = this.cars.some(
        (c) =>
          c !== car &&
          c.team.name === car.team.name &&
          c.pit?.stage === "service",
      );
      if (occupied && !p.serviced) {
        car.speed = Math.min(
          car.speed,
          Math.sqrt(Math.max(0, remaining - 120) * 280),
        );
        if (remaining < 120) car.speed = 0;
      }
      const oldDistance = p.distance;
      p.distance = clamp(
        p.distance + car.speed * dt,
        0,
        p.serviced ? PIT_LANE.length : p.boxDistance + 100,
      );
      if (automatic && !p.serviced && !occupied && (p.distance >= p.boxDistance || Math.abs(remaining) < 0.5)) {
        p.distance = p.boxDistance;
        car.speed = 0;
      }
      if (
        !p.serviced &&
        Math.abs(p.distance - p.boxDistance) <= 20 &&
        Math.abs(car.speed) < 1.5 &&
        !occupied
      ) {
        p.stage = "service";
        car.speed = 0;
        p.serviceDuration=this.qualifying && p.nextSet===p.previousSet ? 2.3 : tyreServiceTime(car.upgrades.crew,this.pitRandom || (car.player ? Math.random : car.aiRandom));
        p.aeroRemaining=p.nextAeroSpec && p.nextAeroSpec!==car.aeroSpec ? 10 : 0;
        p.aeroServiceSeconds=p.aeroRemaining;
        p.timer=p.serviceDuration+car.penalty+p.aeroRemaining;
        car.penalty = 0;
        if (car.player)
          this.say(
            this.qualifying && p.nextSet === p.previousSet ? "Stopped in the box. Refuelling; keeping fitted tyres — hold position." : "Stopped in the box. Tyre change in progress — hold position.",
          );
      } else if (
        car.player &&
        !p.serviced &&
        p.distance > p.boxDistance + 30 &&
        !p.overshot
      ) {
        p.overshot = true;
        this.say(
          "Box missed. Brake, then hold R to reverse back into the outline.",
        );
      }
      resources(car, dt, Math.abs(p.distance - oldDistance), 0.35,{throttle:.2});
    }
    const loc = samplePit(p.distance);
    car.s = p.startS + loc.progress;
    const bayEntry = smootherStep((p.distance - (p.boxDistance - 120)) / 100);
    const bayExit = p.serviced
      ? 1 - smootherStep((p.distance - (p.boxDistance + 45)) / 120)
      : 1;
    const offset =
      p.entryOffset * (1 - smootherStep((p.distance-(p.entryDistance || 0)) / 150)) +
      26 * bayEntry * bayExit;
    const entryBlend=1-smootherStep((p.distance-(p.entryDistance || 0))/150);
    car.x = loc.x - Math.sin(loc.angle) * offset + (p.entryShiftX || 0)*entryBlend;
    car.y = loc.y + Math.cos(loc.angle) * offset + (p.entryShiftY || 0)*entryBlend;
    car.angle = loc.angle;
    car.motionAngle=loc.angle;
    car.sideSpeed = 0;
    if(car.ai){car.ai.slip=0;car.ai.slipSideSpeed=0;}
    car.offset = 0;
    if (p.distance >= PIT_LANE.length) {
      car.pit = null;
      if(car.ai)car.ai.pitExitUntil=car.s+220;
      car.offset = nearest(car.x,car.y).offset;
      if(car.player && this.autoPitLimiter) this.pitLimiter=false;
      if (car.player)
        this.say(
          this.pitLimiter
            ? "Pit exit clear. Press P to release the limiter."
            : this.tyreTemperatureEnabled===false ? "Pit exit clear. Rejoin safely." : "Pit exit clear. Build grip on the cold tyres.",
        );
    }
  }
  step(dt, input = {}) {
    if (this.done) return;
    dt = Math.min(dt, 0.05);
    if (this.countdown > 0) {
      for(const car of this.cars)updateTyreTemperatures(car,dt);
      this.countdown -= dt;
      return;
    }
    capturePoses(this.cars);
    for(const car of this.cars)if(!car.finished&&!car.dnf)recordTiming(car,this.time,raceProgress(car),TRACK.length);
    this.time += dt;
    advanceWeather(this.weather, dt);
    this.traffic = this.cars.map((c) => ({
      id: c.id,
      x:c.x,y:c.y,angle:c.angle,
      team:c.team.name,boxRequested:!!c.ai.strategy.pitRequested,
      s: c.s,
      speed: c.speed,
      offset: c.offset,
      performance:c.player ? passingPerformance(c,this.difficulty) : c.ai.racePace,
      passingTarget:c.ai.lane?.phase==="passing" ? c.ai.lane.targetId : null,
      pit: c.pit,
      garage: c.garage,
      finished: c.finished,
      dnf: c.dnf,
    }));
    this.updateDrafting(dt);
    for (const car of this.cars) {
      if (car.finished || car.dnf) continue;
      coolStoredSets(car,dt);
      const oldS = car.s;
      car.trackWetness = trackWater(
        this.weather,
        car.s,
        TRACK.length,
        car.offset,
      );
      car.contactCooldown = Math.max(0, car.contactCooldown - dt);
      if (car.pit) this.stepPit(car, dt, input);
      else if (car.player) this.stepPlayer(car, dt, input);
      else this.stepAI(car, dt);
      const crossedLine=updateRaceLaps(car,oldS), newLap=Math.floor(Math.max(0,raceProgress(car))/TRACK.length);
      if (crossedLine) {
        const lapTime = this.time - car.lapStart;
        car.lastLap = lapTime;
        car.bestLap = Math.min(car.bestLap, lapTime);
        car.lapStart = this.time;
        if (car.player && !tyreRuleMet(car) && newLap >= this.laps - 2)
          this.say("Use a second dry compound before the finish.");
      }
      if (raceProgress(car) >= this.laps * TRACK.length) {
        car.finished = true;
        car.trackFinishTime=this.time;
        car.finishTime = this.time + car.penalty + (!tyreRuleMet(car) ? 60 : 0);
        car.speed = 0;
      }
      // Crossing the finish takes precedence over stopping with an empty tank.
      if (!car.finished && car.fuel <= 0 && car.speed < 4) {
        car.dnf = true;
        car.speed = 0;
        if (car.player) this.say("Out of fuel. Race retired.");
      }
    }
    this.collisions();
    for(const car of this.cars)if(!car.dnf)recordTiming(car,car.trackFinishTime ?? this.time,raceProgress(car),TRACK.length);
    this.updateEngineer();
    this.skids = this.skids.filter((s) => this.time - s.t < 16);
    if (
      (this.player.finished &&
        (!tyreRuleMet(this.player) || this.time >= this.player.finishTime)) ||
      this.player.dnf
    ) {
      this.done = true;
      const p = this.player;
      this.result = {
        position: this.classification().indexOf(p) + 1,
        gridPosition:p.gridPosition,
        difficulty:this.difficulty,
        legal: tyreRuleMet(p),
        raceFormat:this.setup.raceFormat,
        dnf: p.dnf,
        time: p.finished ? p.finishTime : this.time + p.penalty,
        stops: p.stops,
        contacts: p.contacts,
        penalties: p.penalties,
        bestLap: p.bestLap,
        fuel: p.fuel,
        field:this.raceField(),
      };
    }
  }
  engineerReport(){return engineerReport(this,{track:TRACK,pitLane:PIT_LANE,tyres:TYRES,progress:raceProgress,basePitLoss:estimatedPitLoss(this.player)});}
  updateEngineer(){
    if(this.qualifying || this.time<(this.nextEngineer || 20) || this.time<this.messageUntil || !level(this.player.upgrades,"engineer"))return;
    const report=this.engineerReport();this.nextEngineer=this.time+25;
    const index=report.fuelMargin<0 ? 0 : report.tyreLaps<1.2 ? 1 : report.crossover && report.crossover.seconds<=60 ? 2 : (this.engineerMessageIndex || 0)%report.items.length;
    this.engineerMessageIndex=(this.engineerMessageIndex || 0)+1;
    this.say(report.items[index]);
  }
  raceField(){return this.classification().map((c,i)=>({id:c.id,teamIndex:TEAMS.indexOf(c.team),position:i+1,dnf:c.dnf,legal:tyreRuleMet(c),raceFormat:this.setup.raceFormat,contacts:c.contacts,penalties:c.penalties,gridPosition:c.gridPosition,stops:c.stops}));}
  stepPlayer(c, dt, input) {
    const previousPosition={x:c.x,y:c.y,s:c.s},entryS=this.pitEntryTarget(c,this.pitRequested);
    if(this.autoPitLimiter) {
      this.pitLimiter=!!c.pit;
    }
    const n=nearest(c.x,c.y,c.s);
    // Read water at the physical car position, including during off-track recovery.
    c.offset=n.offset;
    c.trackWetness=trackWater(this.weather,n.s,TRACK.length,n.offset);
    const g=grip(c,"front"),rearGrip=grip(c,"rear"),off=n.dist>TRACK.width/2;
    if(c.speed<-.1 || ((input.brake || input.reverse) && c.speed<.5)) {
      this.stepReverse(c,dt,input,n);
      return;
    }
    const top=maximumSpeed(c);
    const throttle = applyThrottle(c,input.throttle && !input.brake ? 1 : 0,dt),
      brake = input.brake ? 1 : 0;
    const steer = clamp(input.steer || 0, -1, 1);
    const traction = clamp(accelerationGrip(c), 0.25, 1);
    const accel =
      throttle && c.fuel > 0
        ? acceleration(c) * throttle * (1 - 0.45 * steer * steer) * traction *
          Math.cos(angleDiff(c.motionAngle ?? c.angle,c.angle))
        : -(4 + c.speed * 0.012);
    c.speed = clamp(c.speed + (accel - brake * brakingDeceleration(c) - overspeedDrag(c)) * dt, 0, top);
    if (this.pitLimiter) c.speed = Math.min(c.speed, PIT_SPEED);
    // Grass costs pace, but rolling resistance falls at low speed so the engine
    // can always get a fuelled car moving again. Do not subtract a fixed 90/sec.
    if(off) c.speed=Math.max(0,c.speed-(6+c.speed*.65)*dt);
    const slowControl=1-clamp(c.speed/110,0,1);
    const steeringGrip=clamp(g,.1,1)+(1-clamp(g,.1,1))*slowControl;
    const turnRate=(2.3/(1+c.speed/180))*(.55+.45*steeringGrip)*
      clamp(Math.max(c.speed,off && throttle ? 12 : 0)/32,0,1);
    const travelAngle=c.motionAngle ?? (c.angle+Math.atan2(c.sideSpeed || 0,Math.max(c.speed,1)));
    const previous = c.angle;
    const recoverySlip=angleDiff(travelAngle,c.angle);
    const countersteering=Math.abs(recoverySlip)>.05 && Math.sign(steer)===Math.sign(recoverySlip);
    const recoveryBoost=countersteering ? (1.5+.9*throttle+.5*clamp(Math.abs(recoverySlip)/.8,0,1))*(1+level(c.upgrades,"suspension")*.06) : 1;
    let yawStep=steer*turnRate*recoveryBoost*dt;
    if(countersteering) yawStep=Math.sign(yawStep)*Math.min(Math.abs(yawStep),Math.abs(recoverySlip));
    c.angle+=yawStep;
    const turning = Math.abs(angleDiff(c.angle, previous)) / dt;
    // Tyres can only bend the velocity vector by the available lateral force.
    // The body can yaw past that travel direction: real sideways drift, not a
    // fixed speed subtraction whenever skid marks are shown.
    // On wet asphalt, acceleration / braking use some of the same traction
    // budget as cornering. Lifting frees lateral grip instead of killing speed.
    const wet=clamp(c.trackWetness || 0,0,1);
    const longitudinalDemand=wet*(throttle*.48+brake*.62*(1-level(c.upgrades,"brakes")*.025))*clamp(c.speed/100,0,1);
    const cornerGrip=(g*.45+rearGrip*.55)*Math.sqrt(Math.max(.35,1-longitudinalDemand**2));
    const recoveryAuthority=countersteering ? Math.abs(steer)*(.65+.9*throttle)*clamp(Math.abs(recoverySlip)/.8,0,1) : 0;
    const travelTurn=225*cornerGrip/Math.max(c.speed,25)*(countersteering ? 1.15+.25*throttle : 1)+recoveryAuthority*(1+level(c.upgrades,"suspension")*.08);
    c.motionAngle=travelAngle+clamp(angleDiff(c.angle,travelAngle),-travelTurn*dt,travelTurn*dt);
    const slipAngle=angleDiff(c.motionAngle,c.angle);
    const slide=Math.max(clamp((c.speed*turning)/(225*cornerGrip)-1,0,1),clamp(Math.abs(slipAngle)/.35,0,1));
    c.sliding=slide;
    c.speed=Math.max(0,c.speed-(slidingResistance(c.speed,slide,slipAngle)+
      Math.abs(steer)*Math.max(0,c.speed-180)*.025)*dt);
    c.sideSpeed=c.speed*Math.sin(slipAngle);
    const dx=Math.cos(c.motionAngle)*c.speed*dt,
      dy=Math.sin(c.motionAngle)*c.speed*dt;
    c.x += dx;
    c.y += dy;
    const next = nearest(c.x, c.y,c.s);
    let delta = next.s - wrap(c.s, TRACK.length);
    if (delta > TRACK.length / 2) delta -= TRACK.length;
    if (delta < -TRACK.length / 2) delta += TRACK.length; // Reject teleporting across nearby track sections.
    const travelled=Math.hypot(dx,dy);
    if(off || next.dist>TRACK.width/2) c.recoveryDistance=(c.recoveryDistance || 0)+travelled;
    const rejoining=next.dist<TRACK.width/2-3 && (c.recoveryDistance || 0)>0;
    if((Math.abs(delta)<Math.max(35,c.speed*dt*3) && next.dist<190) ||
      (rejoining && Math.abs(delta)<c.recoveryDistance+35)) c.s+=delta;
    if(rejoining) c.recoveryDistance=0;
    c.offset = next.offset;
    const entranceApproach = this.pitRequested && crossesPitEntry(previousPosition,c,entryS);
    const limits = updateTrackLimits(c, dt, entranceApproach ? 0 : next.dist);
    if (limits) this.say(limits);
    const distance = Math.hypot(dx, dy),
      effort = drivingTyreEffort(c,{qualifying:!!this.qualifying,slide,brake,steer});
    resources(c, dt, distance, effort,{throttle,brake,corner:Math.sign(steer)*clamp(c.speed*turning/225,0,1.3),wheelspin:throttle*clamp(1-traction+(paceMode(c).power-1)*2,0,1)});
    this.tyreAdvice(c);
    if ((slide > 0.12 || (brake && c.speed > 160)) && this.skids.length < 1400)
      this.skids.push({ x: c.x, y: c.y, a: c.angle, t: this.time });
    if (n.dist < 120 && next.dist >= 120 && c.contactCooldown === 0) {
      c.contacts++;
      c.contactCooldown = 2;
      c.speed *= 0.7;
      this.say("Off circuit. Ease back onto the racing line.");
    }
    if(this.pitRequested)this.tryEnterPit(c,previousPosition,entryS);
    if (c.wear > 0.9 && this.time % 20 < dt)
      this.say("Tyres are fading. Consider a stop.");
  }
  stepReverse(c,dt,input,n) {
    const target=input.throttle || c.fuel<=0 ? 0 : input.brake || input.reverse ? -30 : 0;
    const rate=target<0 ? 45*clamp(accelerationGrip(c),.3,1) : 90;
    c.speed=clamp(c.speed+clamp(target-c.speed,-rate*dt,rate*dt),-30,0);
    c.angle-=clamp(input.steer || 0,-1,1)*1.4*clamp(-c.speed/20,0,1)*dt;
    const distance=-c.speed*dt;
    c.x+=Math.cos(c.angle)*c.speed*dt;c.y+=Math.sin(c.angle)*c.speed*dt;
    c.motionAngle=c.angle+(c.speed<0 ? Math.PI : 0);c.sideSpeed=0;c.sliding=0;
    const next=nearest(c.x,c.y,c.s);
    const delta=wrap(next.s-n.s+TRACK.length/2,TRACK.length)-TRACK.length/2;
    if(Math.abs(delta)<Math.max(35,distance*3) && next.dist<190) c.s+=delta;
    c.offset=next.offset;
    const limits=updateTrackLimits(c,dt,next.dist);if(limits) this.say(limits);
    resources(c,dt,distance,.72);
  }
  setTyreTemperature(enabled){
    this.tyreTemperatureEnabled=enabled!==false;
    this.setup.tyreTemperatureEnabled=this.tyreTemperatureEnabled;
    if(this.weekend)this.weekend.setup.tyreTemperatureEnabled=this.tyreTemperatureEnabled;
    for(const car of this.cars){
      car.tyreTemperatureEnabled=this.tyreTemperatureEnabled;
      if(!this.tyreTemperatureEnabled){holdOptimalTemperature(car);coolStoredSets(car,0);}
    }
  }
  tyreAdvice(c){
    if(c.tyreTemperatureEnabled===false || !c.player || c.pit || c.garage || this.time<this.messageUntil || this.time<(this.nextTyreAdvice || 0))return;
    const {low,high}=THERMAL[c.tyre],t=c.tyreTemperatures;
    const message=t.slice(2).some(v=>v>high+12) ? "Rears overheating — ease the throttle." : t.slice(0,2).some(v=>v>high+12) ? "Front tyres hot — brake earlier and steer smoothly." : t.slice(0,2).every(v=>v<low-12) ? "Front tyres cold — build pace smoothly." : null;
    if(message){this.say(message);this.nextTyreAdvice=this.time+24;}
  }
  updateDrafting(dt){
    for(const car of this.cars)updateSlipstream(car,this.traffic || this.cars,dt,{width:TRACK.width,layer:trackLayer,length:TRACK.length});
  }
  chooseAIStartingTyre(c){
    const water=trackWater(this.weather,c.s,TRACK.length,c.offset);
    const ranked=rankTyres(c,{tyres:TYRES,remaining:this.laps,water,futureWater:this.freezeWeather ? c.trackWetness : forecastWater(this.weather,c.ai.strategy.forecastHorizon),lapTime:Math.max(25,TRACK.length/205),pitLoss:estimatedPitLoss(c),starting:true});
    if(!ranked.length)return null;
    const options=ranked.filter(o=>o.score<ranked[0].score+.18),weights=options.map(o=>Math.exp(-(o.score-ranked[0].score)/(.05+c.ai.strategy.risk*.1)));
    let pick=c.aiRandom()*weights.reduce((a,b)=>a+b,0);
    for(let i=0;i<options.length;i++){pick-=weights[i];if(pick<=0){c.ai.strategy.plannedMode=options[i].mode || "balanced";return options[i].set;}}
    return options.at(-1).set;
  }
  aiStrategyContext(c,remaining){
    const lapTime=Math.max(15,TRACK.length/(205*(c.pace || 1)));
    const baseLoss=estimatedPitLoss(c);
    const rejoin=c.s-baseLoss*TRACK.length/lapTime;
    const traffic=(this.traffic || []).some(o=>o.id!==c.id && !o.pit && !o.dnf && wrap(o.s-rejoin,TRACK.length)<120);
    return {tyres:TYRES,remaining,water:c.trackWetness || 0,
      futureWater:this.freezeWeather ? c.trackWetness : forecastWater(this.weather,c.ai.strategy.forecastHorizon),
      lapTime,pitLoss:baseLoss+(traffic?2:0),qualifying:!!this.qualifying};
  }
  chooseAITyres(c,remaining=this.laps-raceProgress(c)/TRACK.length){
    return rankTyres(c,this.aiStrategyContext(c,remaining));
  }
  reviewAIStrategy(c,remaining){
    const plan=c.ai.strategy;
    if(this.time<plan.nextReview)return plan.pitRequested;
    this.strategyReviewedAt=this.time;
    plan.nextReview=this.time+Math.max(5,plan.reaction)+c.aiRandom()*4;
    const context=this.aiStrategyContext(c,remaining),ranked=rankTyres(c,context),best=ranked[0];
    const staying=planRaceStrategy(c,{...context,sets:availableAISets(c),current:{compound:c.tyre,wear:c.wear,id:c.tyreSet?.id}})[0];
    if(staying)plan.plannedMode=staying.mode;
    const family=tyre=>["I","W"].includes(tyre)?tyre:"dry";
    plan.projectedStopLaps=staying?.stint ?? null;
    if(!best || remaining<.55)return plan.pitRequested=false;
    const water=c.trackWetness || 0;
    const dryWear=['I','W'].includes(c.tyre) ? 1+Math.max(0,(c.tyre==='W' ? .55 : .28)-water)*5 : 1-water*.25;
    const effort=paceMode(c).wear;
    const wearRate=dryWear*effort*(1+(c.sliding || 0)*.5)*thermalWear(c)*(1-(c.upgrades?.tyres || 0)*.07)/TYRES[c.tyre].life;
    const toEntry=wrap(TRACK.pitEntry-c.s,TRACK.length)/TRACK.length;
    // Leave another entrance available if traffic prevents a safe turn-in.
    const mustChange=!tyreRuleMet(c) && remaining<3.25+plan.risk*.5;
    const currentGrip=TYRES[c.tyre].grip*tyreWeatherGrip(c.tyre,water)*tyreWearFactor(c.tyre,c.wear,level(c.upgrades,"tyres"));
    const replacementGrip=best.grip*tyreWearFactor(best.set.compound,best.set.wear,level(c.upgrades,"tyres"));
    const usefulReplacement=replacementGrip>currentGrip*1.015 && (best.set.compound!==c.tyre || c.wear-best.set.wear>.06);
    // A fresh-set search can find a better *later* stint split than the bounded
    // keep-tyres search. That is not evidence to throw away healthy tyres now.
    // Open an optional stop only when the current stint reaches this entrance;
    // allow enough lead time for the next review and the physical pit approach.
    const reviewLead=Math.min(.25,(plan.nextReview-this.time)/context.lapTime+900/TRACK.length);
    const stopWindow=staying?.stops>0 && staying.stint<=toEntry+reviewLead;
    const strategicStop=stopWindow && usefulReplacement && best.totalTime!=null &&
      family(best.set.compound)===family(c.tyre) &&
      best.totalTime+context.pitLoss*1.2+2<staying.totalTime;
    const canFinish=remaining<1.8 && c.wear+wearRate*remaining<.97;
    const tyreLife=!canFinish && usefulReplacement && (c.wear+wearRate*toEntry>strategyWearLimit(c,c.tyre) || (c.wear+wearRate>.98 && remaining>1.1));
    const urgent=c.wear>.96 && usefulReplacement || mustChange;
    const gain=(Math.pow(1/Math.max(.08,currentGrip),.32)-Math.pow(1/Math.max(.08,replacementGrip),.32))*Math.max(25,TRACK.length/205)*Math.min(remaining,2.5+plan.forecastHorizon/Math.max(25,TRACK.length/205));
    // Damp conditions can favour a different slick as well as Intermediates.
    // The surface-grip advantage must still repay the stop, regardless of age.
    const weatherAdvantage=family(best.set.compound)!==family(c.tyre) ||
      tyreWeatherGrip(best.set.compound,water)>tyreWeatherGrip(c.tyre,water)*1.15;
    const weather=weatherAdvantage && usefulReplacement &&
      ((currentGrip<.52 && replacementGrip>currentGrip*1.35) || gain>context.pitLoss*(1.15+plan.risk*.35));
    const committed=plan.pitRequested && c.ai.pitEntryS!=null && c.ai.pitEntryS-c.s>=-80 && c.ai.pitEntryS-c.s<=900;
    const expiredStrategy=plan.reason==='faster race strategy' && !strategicStop && !tyreLife && !weather && !mustChange;
    const expiredWeather=plan.reason==='weather crossover' && !tyreLife && !mustChange && currentGrip>.75 && gain<5;
    if(plan.pitRequested && !committed && (expiredStrategy || expiredWeather)){plan.pitRequested=false;plan.choice=null;}
    const recent=this.time-plan.lastStop<18;
    const teammate=(this.traffic || []).some(o=>o.id!==c.id && o.team===c.team.name && (o.boxRequested || o.pit && !o.pit.serviced));
    // A teammate already committing to the box can make a marginal stop costly.
    // Urgent tyre changes and the last legal compound stop take precedence.
    if(teammate && !urgent && !weather && c.wear+wearRate<.95){plan.reason='teammate traffic';return plan.pitRequested=false;}
    if(plan.pitRequested || (!recent && (tyreLife || weather || mustChange || strategicStop))){
      plan.pitRequested=true;plan.choice=best.set;
      plan.reason=mustChange ? 'compound rule' : weather ? 'weather crossover' : tyreLife ? 'tyre life' : strategicStop ? 'faster race strategy' : plan.reason;
    }
    plan.lastReview=this.time;
    return plan.pitRequested;
  }
  stepAI(c, dt) {
    const oldX=c.x,oldY=c.y,oldS=c.s,oldAngle=c.angle;
    const remain=this.laps-raceProgress(c)/TRACK.length;
    const water=c.trackWetness || 0;
    const style=c.driverStyle,ai=c.ai;
    // Launch in the assigned grid lane before gradually joining the racing line.
    if(ai.launch===undefined)ai.launch=!this.qualifying&&this.time<.1&&c.speed<2 ? {s:c.s,offset:c.offset} : null;
    const launchProgress=ai.launch ? clamp((c.s-ai.launch.s-120)/140,0,1) : 1;
    const launching=launchProgress<1;
    const shouldPit=this.qualifying ? c.qState==='in' : this.strategyReviewedAt===this.time ? c.ai.strategy.pitRequested : this.reviewAIStrategy(c,remain);
    // Commit to the next entrance when the request begins. In qualifying the
    // timed lap ends just AFTER some circuits' pit entries: that is the start
    // of an in lap, not permission to cut sideways into the boxes behind us.
    const entryS=this.pitEntryTarget(c,shouldPit);
    const pitApproach=shouldPit && c.s>=entryS-900 ? aiPitApproach(c.s) : null;
    const curvature=angleDiff(sample(c.s+15).angle,sample(c.s-15).angle)/30;
    const path=racingPoint(AI_LINE,c.s);
    const courtesy=this.qualifying ? qualifyingLane(c,AI_LINE,this.traffic || this.cars) : null;
    ai.qualifyingLane=courtesy;
    const yielding=courtesy && !courtesy.preparing && !pitApproach;
    const nearby=(this.traffic || this.cars).find(o=>o.id!==c.id && !o.pit && !o.garage && !o.dnf && !o.finished &&
      wrap(o.s-c.s,TRACK.length)>0 && wrap(o.s-c.s,TRACK.length)<150);
    if(this.time>=ai.nextDecision) {
      ai.nextDecision=this.time+5+c.aiRandom()*8;
      const roll=c.aiRandom();
      const enoughFuel=c.fuel>remain*fuelPerLap("balanced",c.upgrades)+.4;
      const tyresReady=c.wear<strategyWearLimit(c,c.tyre)-.06;
      const attack=tyresReady && enoughFuel && (nearby && roll<style.aggression || remain<2.5 || shouldPit);
      ai.mode=attack ? "attack" : c.ai.strategy.plannedMode==="save" ? "conserve" : "cruise";
      ai.pace=.98+c.aiRandom()*.04;
      const risk=(.025+.1*(1-style.consistency))*(.4+water+c.wear)*(ai.mode==="attack" ? 1.5 : 1);
      if(Math.abs(curvature)>.001 && c.aiRandom()<risk && !shouldPit) {
        ai.mistake=c.aiRandom()<.5 ? "wide" : "oversteer";
        ai.mistakeSide=-Math.sign(curvature);
        ai.mistakeUntil=this.time+.8+c.aiRandom()*1.1;
      }
    }
    const mistake=this.time<ai.mistakeUntil ? ai.mistake : null;
    const temperatures=c.tyreTemperatureEnabled!==false ? c.tyreTemperatures || [] : [],high=THERMAL[c.tyre].high;
    if(temperatures.some(t=>t>high+10))ai.cooling=true;
    else if(!temperatures.some(t=>t>high-3))ai.cooling=false;
    const mustSave=ai.cooling || (!this.qualifying && c.fuel<remain*fuelPerLap("balanced",c.upgrades)+.15);
    const passingAttack=ai.lane?.phase==="passing" && ai.strategy.plannedMode!=="save" &&
      c.wear<strategyWearLimit(c,c.tyre)-.06 && c.fuel>remain*fuelPerLap("balanced",c.upgrades)+.4;
    c.drive=yielding ? (c.qState==="in" ? "save" : "balanced") : mustSave ? "save" : this.qualifying || ai.mode==="attack" || passingAttack ? "push" : ai.mode==="conserve" ? "save" : c.ai.strategy.plannedMode || "balanced";
    // Reuse grip until movement changes the contact point or speed.
    const contact={all:grip(c),front:grip(c,"front"),rear:grip(c,"rear")};
    ai.racePace=passingPerformance(c,this.difficulty,contact);
    const braking=Math.min(300,240+level(c.upgrades,"brakes")*12)*contact.front;
    // Difficulty changes how closely the driver uses the same mechanical limits.
    // Separate braking and throttle skills remain meaningful on fast circuits.
    const skill=DIFFICULTIES[this.difficulty];
    // Grip already includes compound, surface water, wear and temperature.
    // Use that available grip instead of stacking a large safety margin on it.
    // Wet skill improves execution, never the car's underlying tyre grip.
    const confidence=.98+water*.04*style.wetSkill;
    const commitment=clamp(confidence*(c.pace || 1)*style.pace*ai.pace*(1-c.fuel*.002),.65,1.035);
    const brakingSkill=Math.min(1,skill.braking+water*.14*style.wetSkill);
    const drivenPath=laneGeometry(AI_LINE,c.s,c.offset-path.offset);
    const pitSpeedLimit=pitApproach ? Math.sqrt(PIT_SPEED**2+2*braking*.82*Math.max(0,pitApproach.distance-25)) : Infinity;
    // Out/in laps and pit approaches already have a lower speed ceiling.
    // Start lookahead at that ceiling so irrelevant distant corners cost no work.
    const paceCeiling=Math.min(yielding ? 210 : Infinity,mistake ? Infinity : pitSpeedLimit)/(yielding ? .82 : 1);
    let target=brakingTarget(AI_LINE,c.s,contact.all,braking*brakingSkill,maximumSpeed(c),commitment,c.offset-path.offset,paceCeiling,ai.racePace.aero);
    if(yielding) target=Math.min(target*.82,210);
    if(mistake)target*=mistake==='wide' ? .88 : .94;
    if(pitApproach)target=Math.min(target,pitSpeedLimit);
    const lane=planRacingLane(c,AI_LINE,this.traffic || this.cars,{time:this.time,
      allowPass:!launching&&!pitApproach&&!mistake&&(!this.qualifying||c.qState==="timed"),
      baseOffset:launching ? ai.launch.offset+(path.offset-ai.launch.offset)*launchProgress : null,
      routeOffset:pitApproach?.offset ?? null,
      paceAdvantage:(other,shift=0)=>projectedPaceAdvantage(AI_LINE,c.s,c.speed,ai.racePace,
        other.performance || other.ai?.racePace || passingPerformance(this.cars.find(o=>o.id===other.id),this.difficulty),
        {ownShift:shift,otherShift:other.offset-racingPoint(AI_LINE,other.s).offset}),
      yieldOffset:yielding ? courtesy.offset : null});
    let desiredOffset=lane.offset;
    target=Math.min(target,lane.followingSpeed);
    if(mistake==="wide")desiredOffset=clamp(path.offset+(ai.mistakeSide || -Math.sign(curvature))*22,lane.min,lane.max);
    // The pit route is a lane request; traffic keeps priority over that request.
    const demand=c.speed*c.speed*Math.abs(drivenPath.curvature)/(225*Math.max(.08,contact.all));
    // Hold a small rotation near the wet traction limit and countersteer it.
    // The direction follows the actual racing arc, not the track centreline.
    const onset=water>.15 ? .84+.06*(1-style.wetSkill) : .98;
    const excess=Math.max(0,demand-onset);
    const turn=Math.abs(path.curvature)>.0005 ? Math.sign(path.curvature) : mistake==="oversteer" ? -(ai.mistakeSide || 1) : 0;
    const slipTarget=pitApproach || yielding ? 0 : -turn*clamp(excess*.38+
      (mistake==="oversteer" ? .2 : 0),0,mistake ? .28 : .12);
    ai.slip+=(slipTarget-ai.slip)*(1-Math.exp(-(slipTarget ? 3 : (5+style.wetSkill*3)*(1+level(c.upgrades,"suspension")*.06))*dt));
    // Slip is already smoothed above. Keep its velocity consistent with the
    // body angle, while a separate impact component decays rather than being
    // erased by the line controller after a collision.
    const impactSideSpeed=((c.sideSpeed || 0)-(ai.slipSideSpeed || 0))*Math.exp(-5*dt);
    ai.slipSideSpeed=c.speed*Math.sin(ai.slip);
    c.sideSpeed=ai.slipSideSpeed+impactSideSpeed;
    // Follow the path's lateral velocity directly; smooth only the recovery
    // toward it. Filtering both together made the car lag each apex and then
    // countersteer repeatedly, even when it was alone on the circuit.
    const slope=pitApproach ? pitApproach.slope : yielding ? 0 : path.slope;
    const progressRate=c.speed/Math.hypot(clamp(1-curvature*c.offset,.5,1.5),slope);
    let feedForward=pitApproach || yielding ? slope*progressRate :
      (racingPoint(AI_LINE,c.s+progressRate*dt).offset-path.offset)/dt;
    if(launching)feedForward*=launchProgress;
    if(desiredOffset<=lane.min+.1&&feedForward<0 || desiredOffset>=lane.max-.1&&feedForward>0&&(!pitApproach || lane.max<pitApproach.offset-.1))feedForward=0;
    const recovery=clamp((desiredOffset-c.offset)*2.4-c.sideSpeed,-55,55);
    ai.recoveryVelocity=(ai.recoveryVelocity || 0)+clamp((recovery-(ai.recoveryVelocity || 0))*8,-180*Math.max(.25,contact.all),180*Math.max(.25,contact.all))*dt;
    ai.lineVelocity=clamp(feedForward+ai.recoveryVelocity,-c.speed*.85-c.sideSpeed,c.speed*.85-c.sideSpeed);
    // A smoothed steering correction must not carry us through the space
    // reserved for a car alongside. Limit motion, never teleport the car.
    if(!yielding && lane.min<=lane.max){
      const margin=TRACK.width/2-18;
      if(lane.min>-margin)ai.lineVelocity=Math.max(ai.lineVelocity,Math.min(0,(lane.min-c.offset)/dt)-c.sideSpeed);
      if(lane.max<(pitApproach || ai.pitExitUntil>c.s ? Math.max(margin,c.offset,pitApproach?.offset || 0) : margin))ai.lineVelocity=Math.min(ai.lineVelocity,Math.max(0,(lane.max-c.offset)/dt)-c.sideSpeed);
    }
    c.offset+=ai.lineVelocity*dt+c.sideSpeed*dt;
    c.sliding=clamp(Math.abs(ai.slip)/.2,0,1);
    const oldSpeed=c.speed;
    const throttleSkill=Math.min(1,skill.throttle+water*.10*style.wetSkill);
    // Holding the corner target still needs throttle. Cutting it to zero
    // at equality repeatedly reset power delivery, penalising the grippier
    // car as it reached its target earlier and tried to accelerate away.
    const throttle=applyThrottle(c,target>=c.speed-.01 ? 1 : 0,dt);
    const accel = Math.min(acceleration(c) * throttle * clamp(accelerationGrip(c), 0.25, 1)*throttleSkill,
      cornerAccelerationLimit(c.speed,drivenPath.curvature,grip(c,"rear")));
    c.speed += clamp(target - c.speed, -braking * dt, accel * dt)-overspeedDrag(c)*dt;
    c.speed = Math.max(0, c.speed);
    if(!pitApproach && Math.abs(c.offset)>TRACK.width/2) c.speed=Math.max(0,c.speed-(6+c.speed*.65)*dt);
    if(!pitApproach) updateTrackLimits(c,dt,Math.abs(c.offset));
    if (c.fuel <= 0) c.speed = Math.max(0, c.speed - 55 * dt);
    // Speed is the magnitude of travel, as it is for the player. Body slip
    // changes orientation; it must not subtract forward speed a second time.
    c.speed=Math.max(0,c.speed-slidingResistance(c.speed,c.sliding,ai.slip)*dt);
    const forward=Math.sqrt(Math.max(0,c.speed**2-(ai.lineVelocity+c.sideSpeed)**2));
    const delta=forward*dt/clamp(1-curvature*c.offset,.5,1.5);
    c.s += delta;
    const loc = sample(c.s);
    c.x = loc.x - Math.sin(loc.angle) * c.offset;
    c.y = loc.y + Math.cos(loc.angle) * c.offset;
    // The sprite, collision box and slipstream must follow the movement that
    // actually happened. A traffic-constrained lane no longer points the body
    // along the unrestricted racing-line tangent (the old sideways "crab").
    const distance=Math.hypot(c.x-oldX,c.y-oldY);
    if(distance>.0001){
      c.motionAngle=Math.atan2(c.y-oldY,c.x-oldX);
      c.angle=c.motionAngle-ai.slip;
      ai.slipSideSpeed=c.speed*Math.sin(ai.slip);
      c.sideSpeed=ai.slipSideSpeed+impactSideSpeed;
    }
    const turning=angleDiff(c.angle,oldAngle)/dt;
    const turnRate=(2.3/(1+c.speed/180))*(.55+.45*clamp(grip(c,"front"),.1,1));
    const brake=clamp((oldSpeed-c.speed)/(braking*dt),0,1),steer=clamp(turning/Math.max(.1,turnRate),-1,1);
    // Holding a steady target still needs power against drag; do not give AI
    // free rear-tyre cooling merely because net acceleration is zero.
    const load={throttle:target>=oldSpeed-.01 ? Math.max(throttle,.5) : 0,brake,
      corner:Math.sign(turning)*clamp(c.speed*Math.abs(turning)/225,0,1.3),wheelspin:c.sliding*.4+throttle*clamp(paceMode(c).power-1,0,1)};
    // Charge the actual route travelled, including lateral movement, with the
    // same slide/braking effort and tyre model used by the player.
    resources(c,dt,Math.hypot(c.x-oldX,c.y-oldY),drivingTyreEffort(c,{qualifying:!!this.qualifying,brake,steer}),load);
    if(pitApproach && remain>.6){
      c.weatherTarget=this.qualifying ? recommendedTyre(water) : c.ai.strategy.choice?.compound;
      this.tryEnterPit(c,{x:oldX,y:oldY,s:oldS},entryS);
    }
    if(c.sliding>.18 && this.time%(1/12)<dt && this.skids.length<1400)
      this.skids.push({x:c.x,y:c.y,a:c.angle,t:this.time});
  }
  collisions() {
    const active = this.cars.filter(
      (c) => !c.pit && !c.finished && !c.dnf && !c.garage,
    );
    for (let i = 0; i < active.length; i++)
      for (let j = i + 1; j < active.length; j++) {
        const a = active[i],
          b = active[j],
          dx = b.x - a.x,
          dy = b.y - a.y;
        if(trackLayer(a.s)!==trackLayer(b.s) && Math.abs(wrap(a.s-b.s+TRACK.length/2,TRACK.length)-TRACK.length/2)>200) continue;
        if (Math.abs(dx) > 55 || Math.abs(dy) > 55) continue;
        const axes = [
          a.angle,
          a.angle + Math.PI / 2,
          b.angle,
          b.angle + Math.PI / 2,
        ];
        let penetration = Infinity,
          normal = null;
        for (const axis of axes) {
          const nx = Math.cos(axis),
            ny = Math.sin(axis),
            extent = (c) =>
              18 * Math.abs(Math.cos(c.angle - axis)) +
              12 * Math.abs(Math.sin(c.angle - axis));
          const projection = dx * nx + dy * ny,
            overlap = extent(a) + extent(b) - Math.abs(projection);
          if (overlap <= 0) {
            normal = null;
            break;
          }
          if (overlap < penetration) {
            penetration = overlap;
            normal = {
              x: nx * (projection < 0 ? -1 : 1),
              y: ny * (projection < 0 ? -1 : 1),
            };
          }
        }
        if (!normal) continue;
        // Resolve the contact normal with equal masses; the struck car receives momentum.
        const velocity=c=>c.motionAngle!==undefined ?
          {x:Math.abs(c.speed)*Math.cos(c.motionAngle),y:Math.abs(c.speed)*Math.sin(c.motionAngle)} :
          {x:c.speed*Math.cos(c.angle)-(c.sideSpeed||0)*Math.sin(c.angle),
          y:c.speed*Math.sin(c.angle)+(c.sideSpeed||0)*Math.cos(c.angle)};
        const av=velocity(a),bv=velocity(b);
        const closing=(av.x-bv.x)*normal.x+(av.y-bv.y)*normal.y;
        if(closing>0) {
          const impulse=Math.min(65,closing*.525);
          for(const [c,v,sign] of [[a,av,-1],[b,bv,1]]) {
            v.x+=normal.x*impulse*sign; v.y+=normal.y*impulse*sign;
            if(c.motionAngle!==undefined) {
              c.speed=(c.speed<0 ? -1 : 1)*Math.min(maximumSpeed(c),Math.hypot(v.x,v.y));
              c.motionAngle=Math.atan2(v.y,v.x);
              c.sideSpeed=c.speed*Math.sin(angleDiff(c.motionAngle,c.angle));
            } else {
              c.speed=clamp(v.x*Math.cos(c.angle)+v.y*Math.sin(c.angle),0,maximumSpeed(c));
              c.sideSpeed=clamp(-v.x*Math.sin(c.angle)+v.y*Math.cos(c.angle),-65,65);
            }
          }
        }
        // Small positional correction removes overlap without a visible jump.
        const shift=Math.min(1.5,Math.max(0,penetration-.15)*.35);
        for(const [c,sign] of [[a,-1],[b,1]]) {
          const ox=normal.x*shift*sign, oy=normal.y*shift*sign;
          c.x+=ox; c.y+=oy;
          const loc=sample(c.s);
          c.offset+=ox*-Math.sin(loc.angle)+oy*Math.cos(loc.angle);
          c.s+=ox*Math.cos(loc.angle)+oy*Math.sin(loc.angle);
        }
        const p = a.player ? a : b.player ? b : null;
        if (p && p.contactCooldown === 0) {
          p.contacts++;
          p.contactCooldown = 1.5;
          this.say("Contact. Leave room on the next corner.");
        }
      }
  }
}
