// Contract goals and settlement are shared by the player and AI teams.
export const SPONSORS=[
 {id:"finish",name:"NORTHLINE",desc:"Finish the race with legal tyre usage.",amount:3500,tier:"reliable"},
 {id:"top15",name:"APEX WORKS",desc:"Finish in the top 15 with legal tyre usage.",amount:6500,tier:"challenge"},
 {id:"clean",name:"CLEAR SIGNAL",desc:"Finish legally with no penalties and at most 2 contacts.",amount:4500,tier:"reliable"},
 {id:"points",name:"VELOCITY",desc:"Score points: finish legally in the top 10.",amount:10000,tier:"ambitious"},
 {id:"top5",name:"REDLINE ENERGY",desc:"Bring it home in the top 5 with legal tyre usage.",amount:13500,tier:"ambitious"},
 {id:"podium",name:"SUMMIT WATCHES",desc:"Finish legally on the podium: P1, P2 or P3.",amount:16000,tier:"ambitious"},
 {id:"win",name:"CROWN MOTORSPORT",desc:"Win the race with legal tyre usage.",amount:22000,tier:"ambitious"},
 {id:"gain3",name:"FORWARD DYNAMICS",desc:"Finish legally at least 3 places ahead of your grid position.",amount:8500,tier:"challenge"},
 {id:"gain6",name:"OVERTAKE LABS",desc:"Finish legally at least 6 places ahead of your grid position.",amount:11500,tier:"ambitious"},
 {id:"noContact",name:"PRISTINE AUTO",desc:"Finish legally with zero contacts.",amount:7000,tier:"reliable"},
 {id:"noPenalty",name:"TRUE LINE",desc:"Finish legally without receiving any penalties.",amount:5500,tier:"reliable"},
 {id:"oneStop",name:"ENDURANCE FUELS",desc:"Finish legally with exactly one pit stop.",amount:9000,tier:"challenge"},
];
export function sponsorMet(id,row){
 if(row.dnf || row.legal===false || !(row.position>=1 && row.position<=22))return false;
 switch(id){
  case 'finish':return true;
  case 'top15':return row.position<=15;
  case 'points':return row.position<=10;
  case 'top5':return row.position<=5;
  case 'podium':return row.position<=3;
  case 'win':return row.position===1;
  case 'clean':return row.penalties===0 && row.contacts<=2;
  case 'noContact':return row.contacts===0;
  case 'noPenalty':return row.penalties===0;
  case 'gain3':return Number.isInteger(row.gridPosition) && row.gridPosition-row.position>=3;
  case 'gain6':return Number.isInteger(row.gridPosition) && row.gridPosition-row.position>=6;
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
