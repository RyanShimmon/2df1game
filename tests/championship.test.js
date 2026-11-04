import test from 'node:test';
import assert from 'node:assert/strict';
import {recordSeasonResult,seasonStandings} from '../src/championship.js';
import {settleCareer,loadCareer} from '../src/core.js';
import {newCareer} from './career-fixture.js';
const profile={driverName:'Championship driver',teamIndex:2};
function result(order,format='grandPrix',extras={}){
 const ids=[...order,...Array.from({length:22},(_,id)=>id).filter(id=>!order.includes(id))];
 const field=ids.map((id,i)=>({id,teamIndex:id===21?2:id===5?10:Math.floor(id/2),position:i+1,dnf:false,legal:true}));
 return {...field.find(row=>row.id===21),raceFormat:format,contacts:0,penalties:0,field,...extras};
}
test('season points aggregate real GP and Sprint results for every driver and survive reload',()=>{
 const career=newCareer(profile);
 settleCareer(career,result([0,21,1]));
 let table=seasonStandings(career);
 assert.equal(table.leaders[0].id,0);assert.equal(table.leaders[0].points,25);
 assert.equal(table.rows.find(row=>row.id===21).points,18);assert.equal(table.complete,true);
 settleCareer(career,result([21,1,0],'sprint'));
 table=seasonStandings(loadCareer({getItem:()=>JSON.stringify(career)}));
 assert.equal(table.leaders[0].id,0);assert.equal(table.leaders[0].points,31);
 assert.equal(table.rows.find(row=>row.id===21).points,26);
 assert.equal(table.rounds,2);assert.equal(career.seasonPoints,26);
});
test('retired and disqualified drivers do not receive championship points',()=>{
 const career=newCareer(profile),race=result([0,1,21]);
 race.field[0].dnf=true;race.field[1].legal=false;race.legal=false;
 recordSeasonResult(career,race);
 const rows=seasonStandings(career).rows;
 for(const id of [0,1,21])assert.equal(rows.find(row=>row.id===id).points,0);
});
test('equal points use finish countback and a genuine tie shares the lead',()=>{
 const career=newCareer(profile);
 recordSeasonResult(career,result([0,1]));career.round++;
 recordSeasonResult(career,result([1,0]));
 let table=seasonStandings(career);assert.deepEqual(table.leaders.map(row=>row.id),[0,1]);
 assert.equal(table.rows.find(row=>row.id===1).rank,1);
 // Equalise the points to exercise the sporting countback independently of
 // the race scoring table; the extra win must decide the leader.
 career.championship.drivers[1].finishes[0]++;
 table=seasonStandings(career);assert.deepEqual(table.leaders.map(row=>row.id),[1]);
});
test('one round cannot add points twice and reading the garage never mutates standings',()=>{
 const career=newCareer(profile),race=result([21,0]);
 recordSeasonResult(career,race);const before=JSON.stringify(career);
 recordSeasonResult(career,race);const rows=seasonStandings(career).rows;
 rows[0].points=999;rows[0].finishes[0]=999;
 assert.equal(JSON.stringify(career),before);
});
test('a new season starts a clean championship without losing lifetime player points',()=>{
 const career=newCareer(profile);settleCareer(career,result([21,0]));career.round=12;
 settleCareer(career,result([21,0]));
 assert.equal(career.season,2);assert.equal(career.points,50);assert.equal(career.seasonPoints,0);
 const reset=seasonStandings(career);assert.equal(reset.rounds,0);assert.equal(reset.complete,true);assert.equal(reset.leaders.length,0);
 settleCareer(career,result([1,21]));
 const table=seasonStandings(career);assert.equal(table.leaders[0].id,1);assert.equal(table.rows.find(row=>row.id===21).points,18);
});
test('legacy seasons explicitly report partial standings without inventing past AI points',()=>{
 const career=newCareer(profile);career.round=5;career.seasonPoints=85;
 assert.equal(seasonStandings(career).complete,false);assert.equal(seasonStandings(career).leaders.length,0);
 settleCareer(career,result([0,21]));const table=seasonStandings(career);
 assert.equal(table.startRound,5);assert.equal(table.complete,false);assert.equal(table.leaders[0].points,25);
 assert.equal(table.rows.find(row=>row.id===21).points,18);assert.equal(career.seasonPoints,103);
});
test('missing field classifications remain marked incomplete rather than implying zero AI points',()=>{
 const career=newCareer(profile);recordSeasonResult(career,{position:1,legal:true,dnf:false});
 assert.equal(seasonStandings(career).complete,false);
});
