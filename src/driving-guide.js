// Include the exact ends of each bridge so guides meet at the deck joins.
export function guideDistances(track){
  const count=Math.ceil(track.length/12);
  return [...new Set([...Array.from({length:count},(_,i)=>i*track.length/count),...track.bridges.flat()])]
    .filter(s=>s>=0 && s<track.length).sort((a,b)=>a-b);
}

const colours={A:'#69dfa4',L:'#ffca64',B:'#ff746f'};

// Cache a closed curve per circuit. Every change of colour or road deck
// shares its end point and tangent with the following piece of the line.
export function buildDrivingGuide(track,points){
  const marks=guideDistances(track);
  if(points.length!==marks.length)throw Error('Racing line does not match '+track.name);
  const layers=[{},{}];
  const count=points.length;
  let lastPath=null;
  function curve(layer,colour,from,c1,c2,to){
    const path=layer[colour] ??= new Path2D();
    if(path!==lastPath)path.moveTo(from[0],from[1]);
    path.bezierCurveTo(...c1,...c2,to[0],to[1]);
    lastPath=path;
  }
  for(let i=0;i<count;i++){
    const previous=points[(i+count-1)%count],from=points[i];
    const to=points[(i+1)%count],after=points[(i+2)%count];
    const middle=(marks[i]+(marks[i+1] ?? track.length))/2;
    const deck=track.bridges.some(([a,b])=>middle>=a && middle<b) ? 1 : 0;
    const third=Math.hypot(to[0]-from[0],to[1]-from[1])/3;
    const startScale=third/(Math.hypot(to[0]-previous[0],to[1]-previous[1]) || 1);
    const endScale=third/(Math.hypot(after[0]-from[0],after[1]-from[1]) || 1);
    const c1=[from[0]+(to[0]-previous[0])*startScale,from[1]+(to[1]-previous[1])*startScale];
    const c2=[to[0]-(after[0]-from[0])*endScale,to[1]-(after[1]-from[1])*endScale];
    const release=to[3];
    if(release===undefined){
      curve(layers[deck],to[2],from,c1,c2,to);
    }else{
      // Split the original cubic at brake release without moving its path.
      const mix=(a,b)=>[a[0]+(b[0]-a[0])*release,a[1]+(b[1]-a[1])*release];
      const a=mix(from,c1),b=mix(c1,c2),c=mix(c2,to);
      const left=mix(a,b),right=mix(b,c),end=mix(left,right);
      curve(layers[deck],'B',from,a,left,end);
      curve(layers[deck],to[2],end,right,c,to);
    }
  }
  return layers;
}

export function drawDrivingGuide(ctx,layer){
  ctx.save();
  ctx.globalAlpha*=.84;
  ctx.lineWidth=5;ctx.lineCap='butt';ctx.lineJoin='round';
  for(const [input,path] of Object.entries(layer)){
    ctx.strokeStyle=colours[input];ctx.stroke(path);
  }
  ctx.restore();
}
