const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const WEATHER_OPTIONS = [
  {id:"dynamic",name:"Varied weather",description:"A different forecast each race: dry spells, light rain, sustained rain or changing fronts."},
  {id:"showers",name:"Changeable showers",description:"Long spells of intermediate conditions can clear, return or develop into heavier rain."},
  {id:"intermediate",name:"Light rain · intermediate conditions",description:"Sustained damp running without full-wet conditions. Rain can ease and the circuit gradually dries."},
  {id:"sustainedRain",name:"Sustained rain",description:"A wet start and prolonged heavy rain, with possible lighter spells."},
  {id:"wetToDry",name:"Wet start → drying",description:"Rain persists for several laps before easing through intermediate conditions and drying."},
  {id:"lateRain",name:"Rain arriving later",description:"A dry opening, followed by a lasting rain front that may strengthen."},
  {id:"dry",name:"Dry",description:"No rain expected."},
];
const weatherIds=new Set(WEATHER_OPTIONS.map(option=>option.id));
function randomFor(seed) {
  let value=seed>>>0;
  return ()=>{value=(value+0x6d2b79f5)>>>0;let n=value;n=Math.imul(n^(n>>>15),n|1);n^=n+Math.imul(n^(n>>>7),n|61);return ((n^(n>>>14))>>>0)/4294967296;};
}
const DRY_WEATHER_CHANCE=.25;
// Career presets describe a circuit's weather tendency, not guaranteed rain.
// Pick once for the weekend; quick-race explicit weather choices stay literal.
export function careerWeatherPattern(pattern,seed) {
  if(pattern==="dry"||pattern==="dynamic")return pattern;
  return randomFor((seed^0x5bd1e995)>>>0)()<DRY_WEATHER_CHANCE ? "dry" : pattern;
}
export const raceWeatherDuration=(laps,length)=>Math.max(240,(laps || 16)*Math.max(25,(length || 5260)/170));

// Generate once, then save the complete front sequence. Forecasting, reloading
// and speeding up a session never roll the weather again.
function buildFronts(pattern,seed,duration) {
  const random=randomFor(seed),between=(a,b)=>a+(b-a)*random();
  const roll=pattern==="dynamic" ? random() : null;
  const wetScenarios=["intermediate","intermediate","sustainedRain","showers","showers","wetToDry","lateRain"];
  const scenario=roll===null ? pattern : roll<DRY_WEATHER_CHANCE ? "dry" :
    wetScenarios[Math.floor((roll-DRY_WEATHER_CHANCE)/(1-DRY_WEATHER_CHANCE)*wetScenarios.length)];
  const damp=()=>between(.32,.43),heavy=()=>between(.86,.99);
  let rain=scenario==="wetToDry" || scenario==="sustainedRain" ? heavy() : scenario==="intermediate" ? damp() : 0;
  const initialWater=rain>.6 ? between(.72,.86) : rain>.1 ? between(.35,.47) : 0;
  const points=[[0,rain]];let time=0;
  const ramp=(seconds,value)=>{time+=seconds;rain=value;points.push([time,value]);};
  const hold=(seconds,value=rain)=>{
    // Gentle changes within a front, rather than jitter from frame to frame.
    ramp(seconds*.45,clamp(value+between(-.02,.02),0,1));ramp(seconds*.55,value);
  };
  const spell=(fraction=.35)=>clamp(duration*between(fraction*.85,fraction*1.15),240,600);
  if(scenario==="dry")ramp(duration+360,0);
  else if(scenario==="intermediate"){
    hold(Math.max(300,duration*between(.5,.8)));
    if(random()<.65){ramp(between(60,100),between(.16,.26));hold(between(150,240));ramp(between(60,100),0);}
    else hold(Math.max(240,duration-time+360),damp());
  }else if(scenario==="wetToDry"){
    hold(clamp(duration*between(.22,.32),180,480));
    ramp(between(60,90),damp());hold(between(120,200));ramp(between(60,100),0);
  }else if(scenario==="sustainedRain"){
    hold(Math.max(360,duration*between(.5,.75)));
    if(random()<.6){ramp(between(60,100),damp());hold(spell());ramp(between(60,100),heavy());}
    hold(Math.max(240,duration-time+360),heavy());
  }else if(scenario==="lateRain"){
    ramp(Math.max(90,duration*between(.4,.58)),0);ramp(between(60,90),damp());
    if(random()<.65){hold(240);ramp(between(60,100),heavy());}
    hold(Math.max(300,duration-time+180));
  }else{
    ramp(between(45,105),0);
    do{
      ramp(between(45,75),damp());hold(spell());
      if(random()<.6){ramp(between(60,100),heavy());hold(spell());}
      ramp(between(60,100),0);
      // A clearing is a meaningful dry spell, with time for surface water to drain.
      ramp(between(300,480),0);
    }while(time<duration-300);
  }
  ramp(Math.max(1,duration+600-time),rain);
  return {scenario,points,initialWater};
}
export function createWeather(pattern="showers",options={}) {
  if(!weatherIds.has(pattern))pattern="dynamic";
  const seed=(options.seed ?? Math.floor(Math.random()*4294967296))>>>0;
  const duration=clamp(Number.isFinite(options.duration)?options.duration:900,180,7200);
  const plan=buildFronts(pattern,seed,duration);
  let points=plan.points;
  // A new race forecast must not make existing rainfall switch instantly.
  if(Number.isFinite(options.initialRain) && Math.abs(options.initialRain-points[0][1])>.001)
    points=[[0,clamp(options.initialRain,0,1)],...points.map(([t,r])=>[t+60,r])];
  const wet=clamp(options.wetness ?? plan.initialWater,0,1);
  const sectors=options.sectors?.length===32 ? options.sectors.map(v=>clamp(v,0,1)) : Array(32).fill(wet);
  return {version:2,pattern,scenario:plan.scenario,seed,duration,points,elapsed:0,rain:points[0][1],
    wetness:Number.isFinite(options.wetness)?wet:sectors.reduce((a,b)=>a+b,0)/32,sectors};
}
export function migrateWeather(state,options={}) {
  if(!state || state.version===2 && Array.isArray(state.points))return state;
  const elapsed=Math.max(0,state.elapsed || 0),rain=clamp(state.rain || 0,0,1);
  const next=createWeather(state.pattern,{...options,seed:state.seed ?? options.seed ?? 1,initialRain:rain,wetness:state.wetness,sectors:state.sectors});
  next.points=next.points.map(([t,r])=>[t+elapsed,r]);
  if(elapsed)next.points.unshift([0,rain]);
  Object.assign(state,next,{elapsed,rain});
  return state;
}
export function rainAt(state,t=state.elapsed) {
  const points=state.points;
  if(!points?.length)return clamp(state.rain || 0,0,1);
  // The sequence can span a whole qualifying weekend; avoid scanning its
  // already-completed fronts on every physics frame and forecast sample.
  let lo=0,hi=points.length-1;
  if(t<=points[0][0])return points[0][1];
  if(t>=points[hi][0])return points[hi][1];
  while(hi-lo>1){const mid=(lo+hi)>>1;if(points[mid][0]<=t)lo=mid;else hi=mid;}
  const a=points[lo],b=points[hi],f=clamp((t-a[0])/(b[0]-a[0]),0,1);
  return a[1]+(b[1]-a[1])*f;
}
export function advanceWeather(state,dt) {
  if(!state || !Number.isFinite(dt) || dt<=0)return;
  migrateWeather(state);
  state.sectors ||= Array(32).fill(state.wetness || 0);
  const end=state.elapsed+dt;
  while(state.elapsed<end){
    const step=Math.min(1,end-state.elapsed),rain=rainAt(state,state.elapsed+step/2);
    for(let i=0;i<32;i++){
      const drainage=.8+(i%7)*.07,water=state.sectors[i];
      // Runoff grows with standing water. Light rain reaches an equilibrium
      // instead of eventually flooding the circuit; heavy rain can saturate it.
      const input=rain*.012-(1-rain)*.0005;
      const rate=input-drainage*(.008*water+.002*water*water);
      const predicted=clamp(water+rate*step,0,1);
      const nextRate=input-drainage*(.008*predicted+.002*predicted*predicted);
      state.sectors[i]=clamp(water+(rate+nextRate)*.5*step,0,1);
    }
    state.elapsed+=step;
  }
  state.rain=rainAt(state);
  state.wetness=state.sectors.reduce((a,b)=>a+b,0)/32;
}
export function trackWater(state,s,length,offset=0) {
  if(!state)return 0;
  const index=Math.floor(((((s%length)+length)%length)/length)*32)%32;
  const base=state.sectors?.[index] ?? state.wetness ?? 0;
  const lineDrying=state.rain<.1 ? .08*(1-clamp(Math.abs(offset)/50,0,1)) : 0;
  return clamp(base-lineDrying,0,1);
}
// Wetness/grip anchors: Medium retains near-dry grip through 5% water and
// Hard through 12%; Soft starts fading immediately. Smooth interpolation
// across every anchor avoids grip steps at the displayed crossover ranges.
const slickWetnessCurves={
  S:[[0,1],[.05,.715],[.4,.40],[1,.18]],
  M:[[0,1],[.05,.985],[.12,.845],[.4,.55],[1,.20]],
  H:[[0,1],[.12,.97],[.20,.935],[.4,.70],[1,.23]],
};
export function tyreWeatherGrip(compound, water) {
  if (compound === "I")
    return clamp(
      0.68 + 0.40 * Math.sin(Math.PI * clamp(water / 0.85, 0, 1)) + .05*(1-clamp(water/.25,0,1)),
      0.65,
      1.08,
    );
  if (compound === "W") return 0.48 + 0.59 * clamp(water / 0.75, 0, 1) + .08*(1-clamp(water/.45,0,1));
  const curve=slickWetnessCurves[compound] || slickWetnessCurves.M,w=clamp(water,0,1);
  const end=curve.findIndex(([at])=>at>=w);
  if(end<=0)return curve[0][1];
  const [from,startGrip]=curve[end-1],[to,endGrip]=curve[end];
  const t=(w-from)/(to-from),blend=t*t*(3-2*t);
  return startGrip+(endGrip-startGrip)*blend;
}
export function recommendedTyre(water) {
  const inter=tyreWeatherGrip("I",water),wet=tyreWeatherGrip("W",water),slick=tyreWeatherGrip("M",water);
  return wet>inter && wet>slick ? "W" : inter>slick ? "I" : "M";
}
export function forecast(state) {
  if(!state)return "Dry";
  const now=state.rain,limit=state.elapsed+360;
  let event=null;
  for(let t=state.elapsed+15;t<=limit;t+=15){
    const future=rainAt(state,t);
    const change=now<=.05 ? future>.05 ? "Rain arriving" : null :
      future<=.05 ? "Rain clearing" : now<=.6 && future>.6 ? "Heavier rain" :
      now>.6 && future<=.6 ? "Lighter rain" : null;
    if(change){event=`${change} in ${Math.ceil((t-state.elapsed)/60)} min`;break;}
  }
  const label=now>.6 ? "Heavy rain" : now>.05 ? "Light rain" : state.wetness>.08 ? "Rain stopped · track drying" : "Dry";
  return event ? `${label} · ${event}` : now>.05 ? `${label} · holding for 6+ min` : `${label} · no rain in next 6 min`;
}
export function projectWeather(state,seconds) {
  const projected={...state,sectors:[...(state.sectors || Array(32).fill(state.wetness || 0))]};
  advanceWeather(projected,seconds);
  return projected;
}
// HUD and AI projections use the exact same runoff and rainfall as live play.
export function weatherTimeline(state,horizon=360,interval=15) {
  if(!(interval>0) || !(horizon>=0))return [];
  const projected=projectWeather(state,0);
  const points=[{time:state.elapsed,rain:state.rain,water:state.wetness}];
  for(let t=interval;t<=horizon;t+=interval){
    advanceWeather(projected,interval);
    points.push({time:projected.elapsed,rain:projected.rain,water:projected.wetness});
  }
  return points;
}

// A whole-race briefing, projected from the already-saved plan. Reading it
// neither advances the live clock nor generates a different weather seed.
export function raceForecast(state,{duration=state.duration,laps=16}={}) {
  const horizon=Math.max(1,Number.isFinite(duration)?duration:900),projected=projectWeather(state,0);
  const segments=[];
  const describe=()=>{
    const tyre=recommendedTyre(projected.wetness);
    const rain=projected.rain>.6 ? 'heavy' : projected.rain>.05 ? 'light' : 'dry';
    return {key:rain+tyre,rain,tyre,label:rain==='heavy' ? 'Heavy rain' : rain==='light' ? 'Light rain' : projected.wetness>.17 ? 'Rain stopped' : 'Dry'};
  };
  for(let start=0;start<horizon;){
    const info=describe(),end=Math.min(horizon,start+15),water=projected.wetness;
    let segment=segments.at(-1);
    if(!segment || segment.key!==info.key){segment={...info,start,end,minWater:water,maxWater:water};segments.push(segment);}
    advanceWeather(projected,end-start);
    segment.end=end;segment.minWater=Math.min(segment.minWater,water,projected.wetness);segment.maxWater=Math.max(segment.maxWater,water,projected.wetness);
    start=end;
  }
  for(const segment of segments){
    segment.firstLap=Math.min(laps,Math.floor(segment.start/horizon*laps)+1);
    segment.lastLap=Math.min(laps,Math.max(segment.firstLap,Math.ceil(segment.end/horizon*laps)));
    segment.surface=segment.tyre==='W' ? 'Very wet track' : segment.tyre==='I' ? 'Damp track' : 'Dry / drying track';
    segment.tyreLabel=segment.tyre==='W' ? 'Wet tyres' : segment.tyre==='I' ? 'Intermediates' : 'Slick tyres';
  }
  return {duration:horizon,laps,segments};
}

// Suggested competitive bands, with a 5% grip overlap around crossovers.
// Slick compounds are compared with wet-weather tyres, not one another.
export function tyreWetnessRange(compound,tyres){
 const rivals=["S","M","H"].includes(compound)?["I","W"]:Object.keys(tyres).filter(k=>k!==compound);
 const values=[];
 for(let percent=0;percent<=100;percent++){
  const water=percent/100,own=tyres[compound].grip*tyreWeatherGrip(compound,water);
  if(own>=Math.max(...rivals.map(k=>tyres[k].grip*tyreWeatherGrip(k,water)))*.95)values.push(percent);
 }
 return {min:values[0]??0,max:values.at(-1)??0};
}
