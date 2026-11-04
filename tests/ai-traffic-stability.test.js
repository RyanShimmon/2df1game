import test from 'node:test';
import assert from 'node:assert/strict';
import {planRacingLane} from '../src/racecraft.js';

const line={width:126,length:5000,step:50,points:Array.from({length:100},()=>({offset:0,angle:0,curvature:0,distanceScale:1}))};
const driver=()=>({id:0,s:1000,x:1000,y:0,offset:0,angle:0,speed:240,driverStyle:{line:0},ai:{lineVelocity:0}});
const opponent=(id,gap,offset)=>({id,s:1000+gap,x:1000+gap,y:offset,offset,angle:0,speed:240});

test('steering into or away from a neighbouring car does not change its measured overlap',()=>{
 const plans=[];
 for(const angle of [-.08,0,.08]){
  const c=driver();c.angle=angle;
  plans.push(planRacingLane(c,line,[opponent(1,-51,-34)],{allowPass:false,baseOffset:-30}));
 }
 assert.deepEqual(plans.map(p=>[p.offset,p.min,p.max]),plans.map(()=>[plans[0].offset,plans[0].min,plans[0].max]),
  'body rotation must not switch a lane constraint on and off');
});

test('an adjacent car stays reserved through small changes in longitudinal clearance',()=>{
 const c=driver();c.offset=34;c.y=34;
 for(const [i,gap] of [-49,-50.5,-49.5,-52,-57].entries()){
  const plan=planRacingLane(c,line,[opponent(1,gap,0)],{time:i/60,allowPass:false});
  assert.equal(plan.offset,34,`do not resume a merge while the same neighbour hovers around the cutoff (${gap})`);
 }
 const clear=planRacingLane(c,line,[opponent(1,-66,0)],{time:1,allowPass:false});
 assert.equal(clear.offset,0,'once physically clear, returning to the racing line is allowed');
});

test('adjacent clearance is tracked separately and releases cars that leave the track traffic',()=>{
 const c=driver(),left=opponent(1,0,-34),right=opponent(2,0,34);
 assert.equal(planRacingLane(c,line,[left,right],{allowPass:false,baseOffset:20}).offset,0);
 assert.equal(planRacingLane(c,line,[left],{allowPass:false,baseOffset:20}).offset,20,
  'a departed or pitting neighbour must not leave an invisible lane restriction');
});


test('a faster car can attack again while traffic prevents its return to the ideal line',()=>{
 const c=driver();c.offset=35;c.y=35;c.ai.lane={phase:'return',cooldownUntil:9,nextDecision:0};
 // This slower car occupies our actual lane, beyond 38 units from the ideal
 // line. Waiting to merge first used to conceal it from the pass planner.
 const leader=opponent(1,90,40);leader.speed=230;
 const plan=planRacingLane(c,line,[leader],{time:10,paceAdvantage:()=>4});
 assert.equal(plan.phase,'passing');assert.equal(plan.targetId,1);
});

test('following a curved reference is not mistaken for an unfinished lane change',()=>{
 const c=driver();c.ai.lineVelocity=45;c.ai.recoveryVelocity=0;
 c.ai.lane={phase:'return',cooldownUntil:20,nextDecision:0};
 assert.equal(planRacingLane(c,line,[],{time:10}).phase,'line');
});

test('restarting an attack still respects its cooldown and an occupied corridor',()=>{
 const c=driver();c.offset=35;c.y=35;c.ai.lane={phase:'return',cooldownUntil:12,nextDecision:0};
 assert.equal(planRacingLane(c,line,[opponent(1,90,40)],{time:10,paceAdvantage:()=>4}).phase,'return');
 const traffic=[opponent(1,90,35),opponent(2,90,0),opponent(3,90,-35)];
 assert.equal(planRacingLane(c,line,traffic,{time:13,paceAdvantage:()=>4}).phase,'return');
});
