export const GRAND_PRIX_POINTS=[25,18,15,12,10,8,6,4,2,1];
export const SPRINT_POINTS=[8,7,6,5,4,3,2,1];
export const QUICK_DISTANCES=[12,16,24,32,40];
export const raceFormat=setup=>setup?.raceFormat==="sprint" ? "sprint" : "grandPrix";
export const quickRaceFormat=laps=>Number(laps)===12 ? "sprint" : "grandPrix";
export const racePoints=(position,format="grandPrix")=>(format==="sprint" ? SPRINT_POINTS : GRAND_PRIX_POINTS)[position-1] || 0;
export const raceRuleText=format=>format==="sprint" ? "Sprint · no compulsory tyre change · top eight score 8–1 points" : "Grand Prix · use two dry compounds, unless Intermediate or Wet tyres are used";
