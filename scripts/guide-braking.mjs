// Input belongs to the stretch ending at each point. Work around the lap
// cyclically so the timing line never splits one corner's brake application.
export function consolidateBraking(points, samples){
  const count=points.length;
  const braked=[];
  for(let i=0;i<count;i++)if(points[i][2]==='B')braked.push(i);
  if(braked.length<2)return;

  function separate(first,next){
    let time=0,lowSpeed=samples[first].speed;
    for(let i=(first+1)%count;i!==next;i=(i+1)%count){
      const sample=samples[i];
      time+=sample.duration;
      lowSpeed=Math.min(lowSpeed,sample.speed);
      if(time>.7 || sample.speed-lowSpeed>5)return true;
    }
    return false;
  }
  const breaks=braked.map((index,i)=>separate(index,braked[(i+1)%braked.length]));
  const start=(breaks.indexOf(true)+1)%braked.length;
  let first=braked[start],hasGap=false;
  for(let n=0;n<braked.length;n++){
    const j=(start+n)%braked.length,last=braked[j];
    if(breaks[j] || n===braked.length-1){
      if(hasGap)compress(first,last);
      first=braked[(j+1)%braked.length];
      hasGap=false;
    }else if((last+1)%count!==braked[(j+1)%braked.length])hasGap=true;
  }

  function compress(first,last){
    const length=(last-first+count)%count+1;
    let remaining=0;
    for(let j=0;j<length;j++)remaining+=samples[(first+j)%count].brakeLoss;
    for(let j=0;j<length;j++){
      const i=(first+j)%count,point=points[i],sample=samples[i];
      // Spend the recorded loss of speed at the available full braking
      // force on entry. Only the release point may fall between samples.
      const fraction=Math.min(1,remaining/sample.capacity);
      remaining=Math.max(0,remaining-sample.capacity);
      if(fraction>=1)point[2]='B';
      else {
        point[2]=sample.throttling ? 'A' : 'L';
        if(fraction>0)point[3]=fraction;
      }
    }
  }
}
