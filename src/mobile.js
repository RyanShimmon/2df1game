const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function stickSteering(distance,radius=42,sensitivity=1){
 const value=clamp(distance/Math.max(1,radius),-1,1),dead=.08;
 return Math.abs(value)<=dead ? 0 : clamp(Math.sign(value)*(Math.abs(value)-dead)/(1-dead)*sensitivity,-1,1);
}
export class TouchControls {
 constructor(){this.pointers=new Map();}
 press(id,control,value=1){this.pointers.set(id,{control,value});}
 move(id,value){const p=this.pointers.get(id);if(p)p.value=value;}
 release(id){this.pointers.delete(id);}
 reset(){this.pointers.clear();}
 state(){
  const entries=[...this.pointers.values()],has=k=>entries.some(p=>p.control===k);
  const stick=entries.find(p=>p.control==='stick')?.value || 0;
  return {steer:clamp(stick+(has('right')?1:0)-(has('left')?1:0),-1,1),throttle:has('throttle'),brake:has('brake'),reverse:has('reverse')};
 }
}
export class LandscapeGate {
 constructor(){this.blocked=false;this.portrait=false;}
 sync(mobile,running,width,height){
  this.portrait=!!mobile && !!running && width<height;
  if(!mobile || !running)this.blocked=false;
  else if(this.portrait)this.blocked=true;
 }
 resume(){if(!this.portrait)this.blocked=false;}
}
export function mobileLessonText(text,steering='stick'){
 const steer=steering==='arrows' ? 'use the left/right arrows' : 'drag the steering pad';
 return String(text)
  .replace('W / ↑ accelerates, S / ↓ brakes then reverses, and A/D or ←/→ steer.',`Hold GAS to accelerate. BRAKE slows, then reverses.\n${steering==='arrows' ? 'Hold the left/right arrows to steer.' : 'Drag the steering pad left/right; release to centre.'}`)
  .replace('Watch your lap time and P16 cutoff.','Tap Timing to see lap times and the P16 cutoff.')
  .replace(/1 = Soft[^\n]*\n/g,'')
  .replace(/1\/2\/3\/4\/5 selects S\/M\/H\/I\/W\./g,'Tap Choose tyre set to select tyres.')
  .replace(/The compound buttons remain available for quick choices\./g,'')
  .replace(/Press W \/ ↑ or click Leave pit box\./g,'Tap Leave pit box when ready.')
  .replace(/F moves left toward Save; G moves right toward Push\./g,'Tap Save, Balanced or Push to change pace mode.')
  .replace(/B requests a race pit stop;/g,'Tap Pit to request a race stop;')
  .replace(/Press B to request (?:your race pit stop|a stop|a race pit stop)\./g,'Tap Pit to request a race stop.')
  .replace(/Keep B requested\./g,'Keep your pit request active.')
  .replace(/B PIT REQUEST/g,'PIT REQUEST').replace(/B-request|B request|B pit request/g,'Pit request')
  .replace(/no B needed/g,'no Pit request needed').replace(/without pressing B/g,'without tapping Pit')
  .replace(/with W \/ ↑/g,'with GAS').replace(/Press W \/ ↑/g,'Hold GAS').replace(/press W \/ ↑/g,'hold GAS')
  .replace(/W \/ ↑/g,'GAS').replace(/S \/ ↓/g,'BRAKE')
  .replace(/A\/D or ←\/→/g,'the steering controls').replace(/A\/D steers/g,steer).replace(/steer with A\/D/g,steer)
  .replace(/Press L|press L/g,'Tap Limiter').replace(/Press B/g,'Tap Pit').replace(/pressing B/g,'tapping Pit')
  .replace(/Or click Choose tyre set/g,'Tap Choose tyre set').replace(/click/gi,'tap');
}
