// One stock and eligibility rule for every driver. Historical sets are retained
// as returned records so saves never lose their physical set history.
export const WEEKEND_SET_IDS=new Set(["H1","M1","S1","S2","S3","I1","I2","W1"]);
export const WEEKEND_QUOTA={H:1,M:1,S:2,I:2,W:1}; // plus one Q3-reserved Soft
export function tyreAllocation(){
  return ["H","M","S","I","W"].flatMap(compound=>
    Array.from({length:{H:2,M:3,S:8,I:5,W:2}[compound]},(_,i)=>({
      id:compound+(i+1),compound,wear:0,distance:0,used:false,
      returned:!WEEKEND_SET_IDS.has(compound+(i+1)),reserved:compound==="S"&&i===2,
    })));
}
export function selectableSets(inventory,phase,currentId=null){
  return inventory.filter(t=>!t.returned && t.wear<1.05 && t.id!==currentId &&
    (!t.reserved || phase==="Q3" || phase==="R"));
}
export function limitWeekendStock(inventory,selectedIds=[]){
  // Preserve selected/used sets in existing saves within the same per-compound
  // quota for everyone. Excess sets are returned, never deleted or refreshed.
  const priority=t=>selectedIds.includes(t.id) ? 0 : t.used || t.wear>0 || t.distance>0 ? 1 : 2;
  for(const [compound,quota] of Object.entries(WEEKEND_QUOTA)){
    const sets=inventory.filter(t=>t.compound===compound && !t.returned && !t.reserved)
      .sort((a,b)=>priority(a)-priority(b) || a.wear-b.wear || Number(!WEEKEND_SET_IDS.has(a.id))-Number(!WEEKEND_SET_IDS.has(b.id)) || a.id.localeCompare(b.id));
    for(const set of sets.slice(quota))set.returned=true;
  }
  const reserved=inventory.filter(t=>!t.returned && t.reserved);
  for(const set of reserved.slice(1))set.returned=true;
}

// Relabel physical sets without refreshing wear, moving stock, or changing Q3 eligibility.
export function numberSoftSets(inventory){
 const soft=inventory.filter(t=>t.compound==="S"),reserved=soft.find(t=>t.reserved&&!t.returned)||soft.find(t=>t.reserved);
 const regular=soft.filter(t=>!t.reserved&&!t.returned).sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true}));
 const assigned=new Map(),used=new Set();
 regular.forEach((t,i)=>{assigned.set(t,"S"+(i+1));used.add(i+1);});
 if(reserved){assigned.set(reserved,"S3");used.add(3);}
 let n=1;
 for(const t of soft.filter(t=>!assigned.has(t))){while(used.has(n))n++;assigned.set(t,"S"+n);used.add(n);}
 const ids=new Map(soft.map(t=>[t.id,assigned.get(t)]));
 for(const t of soft)t.id=assigned.get(t);
 return ids;
}
