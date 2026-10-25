// Keep the original rounds in order so an existing weekend stays on its circuit.
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
export const weekendSchedule=round=>WEEKENDS[(round-1)%SEASON_LENGTH];
export const careerRound=career=>(career.season-1)*SEASON_LENGTH+career.round;
export function migrateCalendar(career){
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
