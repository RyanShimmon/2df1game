// Event definitions stay attached to their circuit when a season is shuffled.
export const WEEKENDS = [
  {name:"Northline Opener", track:"northline", laps:32, weather:"showers"},
  {name:"Velocity Trophy", track:"velocity", laps:32, weather:"wetToDry"},
  {name:"Sunset Grand Prix", track:"sunset", laps:32, weather:"dry"},
  {name:"Harbour Sprint", raceFormat:"sprint", track:"harbour", laps:12, weather:"dynamic"},
  {name:"Crossover Challenge", track:"crossover", laps:32, weather:"dynamic"},
  {name:"Alpine Grand Prix", track:"alpine", laps:32, weather:"sustainedRain"},
  {name:"Dunes Grand Prix", track:"dunes", laps:32, weather:"dry"},
  {name:"Forest Run", track:"forest", laps:32, weather:"intermediate"},
  {name:"Riviera Grand Prix", track:"riviera", laps:32, weather:"dry"},
  {name:"Metro Grand Prix", track:"metro", laps:32, weather:"showers"},
  {name:"Canyon Grand Prix", track:"canyon", laps:32, weather:"dynamic"},
  {name:"Aurora Finale", track:"aurora", laps:32, weather:"dynamic"},
];
export const SEASON_LENGTH=WEEKENDS.length;
export const validSeasonOrder=order=>Array.isArray(order) && order.length===SEASON_LENGTH && new Set(order).size===SEASON_LENGTH && order.every(id=>WEEKENDS.some(w=>w.track===id));
export function shuffledSeasonOrder(previous=[],random=Math.random){
 const order=WEEKENDS.map(w=>w.track);
 for(let i=order.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[order[i],order[j]]=[order[j],order[i]];}
 // Even the unlikely identical shuffle must give a new season a new order.
 if(order.every((id,i)=>id===previous[i]))[order[0],order[1]]=[order[1],order[0]];
 return order;
}
export function ensureSeasonOrder(career){
 if(validSeasonOrder(career.seasonOrder) && career.calendarSeason===career.season)return career.seasonOrder;
 const previous=career.seasonOrder || [];
 if(career.calendarSeason && career.calendarSeason!==career.season)career.seasonOrder=shuffledSeasonOrder(previous);
 else {
  // A legacy save retains completed rounds and its active weekend. Shuffle
  // only the remaining events; a later season shuffles all twelve normally.
  const count=Math.min(SEASON_LENGTH,Math.max(0,career.round-1)+(career.weekend?1:0));
  const fixed=WEEKENDS.slice(0,count).map(w=>w.track);
  const active=career.weekend?.setup.track;
  if(active && fixed.length && !fixed.slice(0,-1).includes(active))fixed[fixed.length-1]=active;
  career.seasonOrder=[...fixed,...shuffledSeasonOrder().filter(id=>!fixed.includes(id))];
 }
 career.calendarSeason=career.season;return career.seasonOrder;
}
export const weekendSchedule=(round,order)=>WEEKENDS.find(w=>w.track===order?.[(round-1)%SEASON_LENGTH]) || WEEKENDS[(round-1)%SEASON_LENGTH];
export const careerSchedule=career=>weekendSchedule(career.round,ensureSeasonOrder(career));
export const careerRound=career=>(career.season-1)*SEASON_LENGTH+career.round;
export function migrateCalendar(career){
  ensureSeasonOrder(career);
  if(career.calendarVersion===2)return;
  // Team accounting used a six-round absolute index. Translate its markers,
  // without awarding income or buying parts a second time after a save reload.
  const convert=n=>n>0 ? Math.floor((n-1)/6)*SEASON_LENGTH+(n-1)%6+1 : 0;
  for(const team of career.teams || []){
    team.lastRound=convert(team.lastRound);team.fundedRound=convert(team.fundedRound);
    if(team.lastIncome)team.lastIncome.round=convert(team.lastIncome.round);
    for(const entry of team.history || [])entry.round=convert(entry.round);
  }
  career.calendarVersion=2;
}
