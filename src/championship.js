import {racePoints} from './race-rules.js';

const emptyStandings=career=>({season:career.season,startRound:career.round,rounds:[],complete:true,
 drivers:Array.from({length:22},(_,id)=>({id,points:0,finishes:Array(22).fill(0)}))});
const validState=(state,season)=>state?.season===season && Number.isInteger(state.startRound) && Array.isArray(state.rounds) &&
 Array.isArray(state.drivers) && state.drivers.length===22 && state.drivers.every((row,id)=>row.id===id && Number.isFinite(row.points) && row.points>=0 &&
 Array.isArray(row.finishes) && row.finishes.length===22 && row.finishes.every(n=>Number.isInteger(n)&&n>=0));
function compare(a,b){
 if(a.points!==b.points)return b.points-a.points;
 for(let i=0;i<22;i++)if(a.finishes[i]!==b.finishes[i])return b.finishes[i]-a.finishes[i];
 return 0;
}

// Save the actual classification, not a second simulation of the race. IDs are
// stable across the career, including the seat swapped into the player's team.
export function recordSeasonResult(career,result,format='grandPrix'){
 const state=validState(career.championship,career.season) ? career.championship : emptyStandings(career);
 if(state.rounds.includes(career.round))return;
 const field=new Map((result.field || []).filter(row=>Number.isInteger(row.id)&&row.id>=0&&row.id<22).map(row=>[row.id,row]));
 field.set(21,{...result,id:21});
 if(field.size!==22)state.complete=false;
 for(const row of field.values()){
  if(row.dnf || !row.legal || !Number.isInteger(row.position) || row.position<1 || row.position>22)continue;
  const driver=state.drivers[row.id];driver.points+=racePoints(row.position,format);driver.finishes[row.position-1]++;
 }
 state.rounds.push(career.round);career.championship=state;
}

export function seasonStandings(career){
 const state=validState(career.championship,career.season) ? career.championship : emptyStandings(career);
 const rows=state.drivers.map(row=>({...row,finishes:[...row.finishes]})).sort((a,b)=>compare(a,b)||a.id-b.id);
 let rank=1;
 rows.forEach((row,i)=>{if(i&&compare(row,rows[i-1])!==0)rank=i+1;row.rank=rank;});
 return {season:state.season,startRound:state.startRound,rounds:state.rounds.length,complete:state.complete&&state.startRound===1,
 rows,leaders:state.rounds.length&&rows[0].points>0 ? rows.filter(row=>compare(row,rows[0])===0) : []};
}
