// Seeded endurance regression using the actual race update and physical pits.
import assert from 'node:assert/strict';
import {Race,newCareer,TYRES,TRACK,tyreRuleMet} from '../src/core.js';
import {createWeekend,prepareRace} from '../src/weekend.js';
import {WEEKENDS} from '../src/calendar.js';
import {createWeather} from '../src/weather.js';
const profile={driverName:'Balance test',teamIndex:2},results=[];
for(const [track,defaultWeather] of [['northline','dry'],['metro','dry'],['harbour','intermediate'],['dunes','dry']].filter(([track])=>!process.argv[2]||track===process.argv[2])){
 const weather=process.argv[3] || defaultWeather;
 const career=newCareer(profile,{seasonOrder:WEEKENDS.map(w=>w.track)});career.round=WEEKENDS.findIndex(w=>w.track===track)+1;
 const w=createWeekend(career,{tyre:'M',aiSeed:117,tyreTemperatureEnabled:true});
 w.phase='R';w.grid=Array.from({length:22},(_,i)=>i);w.weather=createWeather(weather,{seed:117,duration:w.setup.weatherDuration});w.raceWeatherReady=true;
 // Model qualifying consumption without inventing fresh race sets.
 for(const inv of w.inventories){for(const set of inv){if(set.id==='S1')set.wear=.28;if(set.id==='S2')set.wear=.16;if(set.reserved)set.returned=true;set.used=set.wear>0;}}
 const start=weather==='dry'?'M1':w.weather.wetness>.65?'W1':'I1',r=new Race(w.setup,career.upgrades,'career',profile);prepareRace(r,w,start);
 r.player.player=false;r.countdown=0;
 const modes=new Set();
 for(let frame=0;frame<30*2400 && r.cars.some(c=>!c.finished&&!c.dnf);frame++){
  r.done=false;r.step(1/30);for(const c of r.cars)modes.add(c.drive);
 }
 const cars=r.cars.map(c=>({id:c.id,finished:c.finished,dnf:c.dnf,legal:tyreRuleMet(c),fuel:+c.fuel.toFixed(2),stops:c.stops,compounds:[...c.used],history:c.history.map(h=>({lap:h.lap,tyre:h.tyre,reason:h.reason}))}));
 assert.ok(cars.every(c=>c.finished&&!c.dnf&&c.legal),track+': all cars finish legally without running out');
 if(track==='harbour')assert.ok(cars.every(c=>c.stops<=5),'weather should not cause repeated speculative tyre swaps');
 assert.ok(r.cars.every(c=>c.tyreInventory.includes(c.tyreSet)),track+': every fitted tyre belongs to the weekend stock');
 results.push({track,weather,laps:r.laps,modes:[...modes],cars});
 console.error(`${track}: ${cars.length} finishers; stops ${Math.min(...cars.map(c=>c.stops))}–${Math.max(...cars.map(c=>c.stops))}`);
}
console.log(JSON.stringify({conditions:'Seed 117; Normal AI; full 22-car grid; calendar distance (12-lap Sprint or 32-lap Grand Prix); limited physical sets with qualifying wear; temperatures enabled.',results},null,2));
