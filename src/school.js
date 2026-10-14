import {Race,newCareer,sample,TRACK} from './core.js';
import {createWeekend,QualifyingRun} from './weekend.js';
import {createWeather} from './weather.js';
export const SCHOOL_KEY='v10.race-school.v1';
export const SCHOOL_INTRO=[
 {title:'Your Grand Prix weekend',text:'Q1 trims 22 drivers to 16, Q2 keeps 10, and Q3 decides the front of the grid. Your best valid lap counts. Each outing has an out lap, one timed lap and an in lap. Return to the pits before another timed lap can count.'},
 {title:'Choose pace or tyre life',text:'Softs: quickest, but wear fastest.\nMediums: balance pace and tyre life.\nHards: last longest.\nIntermediates: for damp roads.\nWets: for standing water.\nEase throttle and steer smoothly in the wet.\nEach set keeps its wear across qualifying and the race.'},
 {title:'Fuel is part of your strategy',text:'W / ↑ accelerates, S / ↓ brakes then reverses, and A/D or ←/→ steer. Brake before corners, then build throttle on exit.\nF cycles Save, Balanced and Push: pace costs fuel and tyre life.\nQualifying gets fixed fuel for three laps; race fuel must last the distance, with no refuelling.'},
 {title:'Keep your race legal',text:'Three track-limit warnings precede a 5-second penalty.\nA dry race requires two different dry compounds.\nB requests a race pit stop; steer into the separate pit road at the orange entry marking. Automatic pits handle 80 km/h, stopping, service and exit.\nQualifying in-laps arm entry automatically and keep you parked after service.'}
];
export function loadSchool(storage){try{const s=JSON.parse(storage.getItem(SCHOOL_KEY));return s?.version===1 && ['intro','qualifying','qualifyingComplete','race','complete'].includes(s.phase) ? s : null;}catch{return null;}}
export class RaceSchool {
 constructor(saved=null){this.state=saved ? JSON.parse(JSON.stringify(saved)) : {version:1,phase:'intro',intro:0,outings:0,lapTimes:[],wear:[]};this.state.lapValid ||= []; }
 save(storage){try{storage.setItem(SCHOOL_KEY,JSON.stringify(this.state));}catch{}}
 createQualifying(){
  this.state.phase='qualifying';const profile={driverName:'Rookie',teamIndex:2};
  const w=this.state.weekend ? JSON.parse(JSON.stringify(this.state.weekend)) : createWeekend(newCareer(profile),{track:'northline',laps:8,fuel:10,tyre:'S',weather:'dry',difficulty:'easy'});
  w.weather=createWeather('dry');
  const q=new QualifyingRun(w,'S1',{engine:0,aero:0,tyres:0,crew:0},profile);
  q.stage={...q.stage,duration:3600};q.school=true;q.autoPitLimiter=true;
  for(const c of q.cars)if(!c.player)c.driverStyle.pace*=.82;
  const launch=q.launch.bind(q);
  q.launch=c=>{
   if(c.player && (c.tyre!==(this.state.outings===0?'S':'M') || (this.state.outings===1 && !this.state.mediumChosen))){
    q.say(this.state.outings===0?'Fit Softs for the first exercise.':'Choose a Medium set before the second outing. This is a lesson, not a qualifying rule.');return false;
   }
   if(c.player)q.timeScale=1;
   return launch(c);
  };
  this.lastStops=q.player.stops;this.lastState='garage';this.outingPending=false;
  if(!this.state.weekend)this.state.weekend=JSON.parse(JSON.stringify(w));
  return q;
 }
 createPractice(){
  this.state.phase='race';this.requestSeen=false;this.modeSeen=false;this.launchSeen=false;
  const r=new Race({track:'northline',laps:3,fuel:4,tyre:'M',weather:'dry',difficulty:'easy',startingPosition:1,aiSeed:17});r.school=true;r.autoPitLimiter=true;return r;
 }
 observe(r){
  const p=r.player;
  if(r.qualifying){
   if(this.lastState==='timed' && p.qState==='in') {this.outingPending=true;this.pendingValid=!p.qInvalid;this.pendingLap=p.lastLap;}
   this.lastState=p.qState;
   if(p.stops>this.lastStops){
    this.lastStops=p.stops;
    if(this.outingPending){
     this.outingPending=false;this.state.lapTimes.push(this.pendingLap);this.state.lapValid.push(this.pendingValid);this.state.wear.push(p.wear);this.state.outings++;
     this.state.weekend=JSON.parse(JSON.stringify(r.weekend));
     if(this.state.outings>=2){this.state.phase='qualifyingComplete';return 'qualifyingComplete';}
     return 'tyreChange';
    }
   }
  } else {
   if(r.time>0 && !p.pit && p.speed>25 && p.s>0 && p.s<400)this.launchSeen=true;
   if(r.time>0 && (r.pitRequested || p.pit))this.requestSeen=true;
   if(p.drive!=='balanced')this.modeSeen=true;
   if(this.launchSeen && this.requestSeen && this.modeSeen && p.stops>0 && !p.pit){this.state.phase='complete';return 'practiceComplete';}
  }
  return null;
 }
 chooseMedium(r,id){
  if(this.state.outings!==1 || !this.state.pickerOpened)return false;
  const set=r.player.tyreInventory.find(t=>t.id===id);
  if(set?.compound!=='M')return false;
  this.state.mediumChosen=true;return true;
 }
 guide(r){
  const p=r.player;
  if(!r.qualifying){
   if(r.countdown>0)return {title:'Race start',text:'Wait for lights out, then accelerate with W / ↑. Control the throttle and leave room for the other cars.'};
   if(!this.launchSeen)return {title:'Launch from the grid',text:'Press W / ↑ to accelerate away from the start. Brake with S / ↓ and steer with A/D. Once you are moving, we will try fuel modes and a requested pit stop.'};
   if(!this.modeSeen)return {title:'Try a fuel mode',text:'Press F to choose Save or Push. Save protects fuel and tyres; Push trades them for pace.',highlight:'.drive-modes'};
   if(!this.requestSeen)return {title:'Request a race stop',text:'Press B to request your race pit stop.\n1 = Soft · 2 = Medium · 3 = Hard · 4 = Intermediate · 5 = Wet.\nOr click Choose tyre set to pick a specific set.\nThen steer into the pit entrance.',highlight:'[data-action=pit]'};
   if(p.pit)return {title:p.pit.stage==='service'?'Your race pit stop':'Follow the pit road',text:'The crew holds the car during service, then drives it out automatically. Race stops do not leave you parked like qualifying.'};
   return {title:'Drive into the pit entrance',text:'Keep B requested. Brake before the orange PIT ENTRY marking and steer off the circuit into the separate road. Assistance starts only once you enter.'};
  }
  const n=this.state.outings+1;
  if(p.garage && this.state.outings===0 && p.tyre!=='S')return {title:'Outing 1: choose Softs',text:'Choose a Soft set for the first exercise.\nWait for service, then leave the box.',highlight:'#browse-race-tyres',arrow:true};
  if(p.pit?.stage==='service')return {title:'Wait for service',text:'Wait for the service timer.\nFuel is reset for three laps.\nYou stay parked until you choose to leave.'};
  if(p.garage && this.state.outings===1 && (!this.state.mediumChosen || p.tyre!=='M'))return {title:'Outing 2: choose Mediums',text:'Click Choose tyre set.\nClick a yellow Medium set in the popup.\nWait for service, then leave the box.',highlight:'#browse-race-tyres',arrow:true};
  if(p.garage)return {title:`Outing ${n}: leave when ready`,text:`${this.state.outings===0 ? 'Softs fitted.' : 'Mediums fitted.'}\nPress W / ↑ or click Leave pit box.\nAutomatic assistance takes you to pit exit.`,highlight:'[data-action=pit]',arrow:this.state.outings===1};
  if(p.qState==='out')return {title:`Outing ${n}: out lap`,text:'W / ↑ accelerates · S / ↓ brakes · A/D steers.\nF cycles Save / Balanced / Push.\nBrake before corners; build throttle on exit.\nCross the finish line to start timing.'};
  if(p.qState==='timed')return {title:`Outing ${n}: timed lap`,text:p.qInvalid?'Lap deleted: track limits.\nComplete your in lap and return to service.\nThe school exercise still counts; the qualifying time does not.':'Stay within the track edges.\nWatch your lap time and P16 cutoff.\nAim for smooth exits.'};
  return {title:`Outing ${n}: in lap`,text:'Timed lap complete; extra laps are untimed.\nSteer into the orange pit entrance — no B needed.\nService holds you in the box.'};
 }
 recover(r){const p=r.player;if(p.pit || p.garage)return;const loc=sample(p.s);Object.assign(p,{x:loc.x,y:loc.y,angle:loc.angle,motionAngle:loc.angle,speed:0,sideSpeed:0,offset:0,recoveryDistance:0});if(r.qualifying && p.qState==='timed')p.qInvalid=true;}
 complete(){this.state.phase='complete';}
}
