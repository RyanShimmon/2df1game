// Contract goals and settlement are shared by the player and AI teams.
export const SPONSORS=[
 {id:"finish",name:"NORTHLINE",desc:"Finish the race with legal tyre usage.",amount:600,tier:"reliable"},
 {id:"top15",name:"APEX WORKS",desc:"Finish in the top 15 with legal tyre usage.",amount:1000,tier:"challenge"},
 {id:"clean",name:"CLEAR SIGNAL",desc:"Finish legally with no penalties and at most 2 contacts.",amount:900,tier:"reliable"},
 {id:"points",name:"VELOCITY",desc:"Score points: top 10 in a Grand Prix, top 8 in a Sprint.",amount:1400,tier:"ambitious"},
 {id:"top5",name:"REDLINE ENERGY",desc:"Bring it home in the top 5 with legal tyre usage.",amount:1900,tier:"ambitious"},
 {id:"podium",name:"SUMMIT WATCHES",desc:"Finish legally on the podium: P1, P2 or P3.",amount:2400,tier:"ambitious"},
 {id:"win",name:"CROWN MOTORSPORT",desc:"Win the race with legal tyre usage.",amount:3000,tier:"ambitious"},
 {id:"gain3",name:"FORWARD DYNAMICS",desc:"Gain 3 places, or win if starting in the top 3.",amount:750,tier:"challenge"},
 {id:"gain6",name:"OVERTAKE LABS",desc:"Gain 6 places, or win if starting in the top 6.",amount:950,tier:"ambitious"},
 {id:"noContact",name:"PRISTINE AUTO",desc:"Finish legally with zero contacts.",amount:1100,tier:"reliable"},
 {id:"noPenalty",name:"TRUE LINE",desc:"Finish legally without receiving any penalties.",amount:800,tier:"reliable"},
 {id:"oneStop",name:"ENDURANCE FUELS",desc:"Finish legally with exactly one pit stop.",amount:1000,tier:"challenge"},
];
// Climbing contracts resolve against the actual grid, including restart penalties.
// Reward the required finish, not the number printed in the contract name.
function positionReward(position){
 const ladder=[[1,3000],[3,2400],[5,1900],[10,1400],[15,1000],[22,600]];
 for(let i=1;i<ladder.length;i++){
  const [front,high]=ladder[i-1],[back,low]=ladder[i];
  if(position<=back)return Math.round((high+(low-high)*(position-front)/(back-front))/50)*50;
 }
 return 600;
}
export function sponsorTerms(contract,{gridPosition,raceFormat}={}){
 const sponsor=typeof contract==='string' ? SPONSORS.find(s=>s.id===contract) : contract;
 if(!sponsor)return null;
 const gain=sponsor.id==='gain3'?3:sponsor.id==='gain6'?6:0;
 if(gain){
  const known=Number.isInteger(gridPosition) && gridPosition>=1 && gridPosition<=22;
  const targetPosition=known ? Math.max(1,gridPosition-gain) : null;
  return {...sponsor,targetPosition,
   amount:known ? positionReward(targetPosition) : positionReward(22-gain),
   amountMax:known ? positionReward(targetPosition) : positionReward(1),
   desc:known ? `${targetPosition===1 ? 'Win' : `Finish P${targetPosition} or better`} from P${gridPosition}. Legal tyre usage required.` : `Finish legally: gain ${gain} places, or win if starting in the top ${gain}. Reward follows your final grid position.`,
  };
 }
 if(sponsor.id==='points'){
  const targetPosition=raceFormat==='sprint'?8:10,amount=positionReward(targetPosition);
  return {...sponsor,targetPosition,amount,amountMax:amount,desc:`Finish in the top ${targetPosition} with legal tyre usage.`};
 }
 return {...sponsor,amountMax:sponsor.amount};
}
export function sponsorMet(id,row){
 if(row.dnf || row.legal===false || !(row.position>=1 && row.position<=22))return false;
 switch(id){
  case 'finish':return true;
  case 'top15':return row.position<=15;
  case 'points':return row.position<=(row.raceFormat==='sprint'?8:10);
  case 'top5':return row.position<=5;
  case 'podium':return row.position<=3;
  case 'win':return row.position===1;
  case 'clean':return row.penalties===0 && row.contacts<=2;
  case 'noContact':return row.contacts===0;
  case 'noPenalty':return row.penalties===0;
  case 'gain3':case 'gain6':{
   const target=sponsorTerms(id,row).targetPosition;
   return target!==null && row.position<=target;
  }
  case 'oneStop':return row.stops===1;
  default:return false;
 }
}
export function sponsorOffers(career){
 let seed=((career.developmentSeed || 0)^Math.imul(career.season || 1,0x9e3779b9)^Math.imul(career.round || 1,0x85ebca6b)^Math.imul((career.profile?.teamIndex || 0)+1,0xc2b2ae35))>>>0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const pick=(tier,count)=>{
  const pool=SPONSORS.filter(s=>s.tier===tier && s.id!=="finish");
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  return pool.slice(0,count);
 };
 return [SPONSORS[0],...pick("reliable",1),...pick("challenge",2),...pick("ambitious",2)];
}
