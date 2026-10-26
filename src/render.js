import {gridSlot,
  TRACK,
  trackLayer,
  nearest,
  sample,
  TYRES,
  wrap,
  PIT_LANE,
  PIT_MARKERS,
  targetSpeed,
  samplePit,
  APEXES,
  angleDiff,
  interpolatedCar,
} from "./core.js";
// One opaque asphalt colour prevents translucent round joins from building
// blue patches where curved road strokes meet.
export function asphaltColour(wetness=0){
 const water=Math.max(0,Math.min(1,Number(wetness)||0))*.4;
 return "rgb("+[52,61,66].map((dry,i)=>Math.round(dry+([110,150,177][i]-dry)*water)).join(",")+")";
}
// Reveal the road below only around the driver, with an explicit underpass
// outline. Both roads and their cars retain their real collision layers.
export function underpassView(car){
 if(!car || car.pit || car.garage || trackLayer(car.s))return null;
 let distance=Infinity;
 for(const [a,b] of TRACK.bridges){
  const routeGap=Math.abs(wrap(car.s-(a+b)/2+TRACK.length/2,TRACK.length)-TRACK.length/2);
  if(routeGap<(b-a)/2+300)continue; // Approaching the upper deck is not an underpass.
  const points=[sample(a),...TRACK.pts.filter(p=>p.s>a&&p.s<b),sample(b)];
  for(let i=1;i<points.length;i++){
   const p=points[i-1],q=points[i],dx=q.x-p.x,dy=q.y-p.y;
   const t=Math.max(0,Math.min(1,((car.x-p.x)*dx+(car.y-p.y)*dy)/(dx*dx+dy*dy || 1)));
   distance=Math.min(distance,Math.hypot(car.x-p.x-dx*t,car.y-p.y-dy*t));
  }
 }
 const blend=Math.max(0,Math.min(1,(TRACK.width/2+150-distance)/110));
 const radius=135*blend*blend*(3-2*blend);
 return blend>0 && radius+TRACK.width/2>distance ? {x:car.x,y:car.y,radius,alpha:blend} : null;
}
export function countdownPulse(countdown) {
  if(countdown<=0 || countdown>4) return 0;
  const phase=(4-countdown)%1;
  return Math.sin(Math.PI*phase)**2;
}
export function pitBoundaryMark(name) {
  const marker=PIT_MARKERS[name],s=nearest(marker.x,marker.y).s;
  const points=[];
  for(let d=-55;d<=55;d+=5) {
    const p=sample(s+d),offset=TRACK.width/2+1;
    points.push({x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset});
  }
  const p=sample(s),offset=TRACK.width/2+15;
  let angle=p.angle;
  if(Math.cos(angle)<0) angle+=Math.PI;
  return {points,label:{x:p.x-Math.sin(p.angle)*offset,y:p.y+Math.cos(p.angle)*offset,angle}};
}
export const NORTHLINE_BUILDING={x:1490,y:2070,width:340,height:140};
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.w = innerWidth;
    this.h = innerHeight;
    this.camera = { x: 1150, y: 850, zoom: 0.5, lookahead: 0 };
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.rebuildTrack();
    this.decor = [];
    let seed = 52;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 180; i++)
      this.decor.push({
        x: rand() * 2600 - 100,
        y: rand() * 1900 - 100,
        r: 10 + rand() * 12,
      });
    this.decorLowDetail=this.decor.filter((_,i)=>i%2===0);
  }
  rebuildTrack() {
    this.trackRef=TRACK;
    this.road = new Path2D();
    TRACK.pts.forEach((p, i) =>
      i ? this.road.lineTo(p.x, p.y) : this.road.moveTo(p.x, p.y),
    );
    this.road.closePath();
    const outsideRoad = new Path2D();
    const bounds=TRACK.bounds;
    outsideRoad.rect(bounds.minX-1000,bounds.minY-1000,bounds.maxX-bounds.minX+2000,bounds.maxY-bounds.minY+2000);
    for(const [side,points] of [[1,TRACK.pts],[-1,[...TRACK.pts].reverse()]])
      points.forEach((p,i) => {
        const x=p.x-Math.sin(p.angle)*TRACK.width/2*side;
        const y=p.y+Math.cos(p.angle)*TRACK.width/2*side;
        side===1 && i===0 ? outsideRoad.moveTo(x,y) : outsideRoad.lineTo(x,y);
      });
    outsideRoad.closePath();
    this.outsideRoad = outsideRoad;
    // Leave a proper opening in the kerbs wherever pit asphalt meets the circuit.
    const outsidePitRoad=new Path2D();
    outsidePitRoad.rect(-5000,-5000,10000,10000);
    const edges=PIT_LANE.surfacePts.map((p,i,pts)=>{
      const before=pts[Math.max(0,i-1)],after=pts[Math.min(pts.length-1,i+1)];
      return {...p,angle:Math.atan2(after.y-before.y,after.x-before.x)};
    });
    for(const [side,points] of [[1,edges],[-1,[...edges].reverse()]])
      points.forEach((p,i)=>{
        const x=p.x-Math.sin(p.angle)*(PIT_LANE.width/2+3)*side;
        const y=p.y+Math.cos(p.angle)*(PIT_LANE.width/2+3)*side;
        side===1 && i===0 ? outsidePitRoad.moveTo(x,y) : outsidePitRoad.lineTo(x,y);
      });
    outsidePitRoad.closePath();this.outsidePitRoad=outsidePitRoad;
  }
  resize() {
    this.w = innerWidth;
    this.h = innerHeight;
    const d = Math.min(devicePixelRatio || 1, document.body.classList.contains("mobile-game") ? 1.5 : 2);
    this.canvas.width = this.w * d;
    this.canvas.height = this.h * d;
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }
  draw(race, menu = false, overview = false, dt = 0.016, alpha = 1) {
    if(this.trackRef!==TRACK) this.rebuildTrack();
    const ctx = this.ctx,
      w = this.w,
      h = this.h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = TRACK.theme==="desert" ? "#675443" : TRACK.theme==="city" ? "#303b40" : "#263f39";
    ctx.fillRect(0, 0, w, h);
    const bounds=TRACK.bounds,bw=bounds.maxX-bounds.minX,bh=bounds.maxY-bounds.minY;
    let zoom=menu ? Math.min(w*.72/bw,h/bh) : overview ? Math.min((w-130)/bw,(h-180)/bh) : Math.max(.6,Math.min(1.15,w/1250));
    let tx=(bounds.minX+bounds.maxX)/2,ty=(bounds.minY+bounds.maxY)/2;
    if (!menu && !overview && race) {
      const p=interpolatedCar(race.player,alpha);
      this.camera.lookahead+=((race.mobile ? Math.min(100,p.speed*.5) : p.speed*.8)-this.camera.lookahead)*(1-Math.exp(-3*dt));
      tx=p.x+Math.cos(p.angle)*this.camera.lookahead;
      ty=p.y+Math.sin(p.angle)*this.camera.lookahead;
    }
    this.camera.x += (tx - this.camera.x) *(1-Math.exp(-6*dt));
    this.camera.y += (ty - this.camera.y) *(1-Math.exp(-6*dt));
    this.camera.zoom += (zoom - this.camera.zoom) *(1-Math.exp(-5*dt));
    zoom = this.camera.zoom;
    ctx.save();
    ctx.translate(w * (menu ? 0.66 : 0.5), h * (menu ? 0.54 : 0.51));
    ctx.scale(zoom, zoom);
    ctx.translate(-this.camera.x, -this.camera.y);
    // Subtle lawn stripes and foliage, clipped naturally beneath the wide circuit.
    ctx.fillStyle = TRACK.theme==="desert" ? "#705c47" : TRACK.theme==="city" ? "#364247" : "#2a443c";
    for(let i=bounds.minX-200;i<bounds.maxX+200;i+=160) ctx.fillRect(i,bounds.minY-200,80,bh+400);
    for (const d of (race?.mobile ? this.decorLowDetail : this.decor)) {
      ctx.fillStyle = "#1a342f";
      ctx.beginPath();
      ctx.arc(d.x + 3, d.y + 5, d.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#36534a";
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
    if(TRACK.id==="northline") this.buildings(ctx);
    else {ctx.fillStyle="#9da99e";ctx.fillRect(bounds.minX+260,bounds.maxY-120,500,70);this.text(ctx,TRACK.name.toUpperCase(),bounds.minX+280,bounds.maxY-80,16,"#203b34");}
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#153029";
    ctx.lineWidth = 174;
    ctx.stroke(this.road);
    ctx.strokeStyle = "#c9c9b5";
    ctx.lineWidth = 142;
    ctx.stroke(this.road);
    ctx.strokeStyle = "#df655e";
    ctx.lineWidth = 136;
    ctx.setLineDash([20, 20]);
    ctx.stroke(this.road);
    ctx.setLineDash([]);
    ctx.strokeStyle = asphaltColour(race?.weather?.wetness);
    ctx.lineWidth = TRACK.width;
    ctx.stroke(this.road);
    for(const [a,b] of TRACK.banks) {
      ctx.save();ctx.strokeStyle="#b5a68c";ctx.lineWidth=3;ctx.setLineDash([18,18]);
      for(const offset of [-46,-35]) {ctx.beginPath();for(let d=a;d<=b;d+=8){const p=sample(d),x=p.x-Math.sin(p.angle)*offset,y=p.y+Math.cos(p.angle)*offset;d===a ? ctx.moveTo(x,y) : ctx.lineTo(x,y);}ctx.stroke();}
      ctx.restore();const p=sample((a+b)/2);this.text(ctx,"BANKED",p.x+65,p.y,12,"#e5d6b7");
    }
    // Geometry is shared with pit navigation: no visual/physical mismatches.
    const pit = new Path2D();
    PIT_LANE.surfacePts.forEach((p, i) =>
      i ? pit.lineTo(p.x, p.y) : pit.moveTo(p.x, p.y),
    );
    // Cut off only the pit asphalt that would cover the main racing surface.
    const outsideRoad = this.outsideRoad;
    ctx.save();ctx.clip(outsideRoad,"evenodd");ctx.lineCap="butt";
    ctx.strokeStyle = "#c0c7c1";
    ctx.lineWidth = PIT_LANE.width + 6;
    ctx.stroke(pit);
    ctx.strokeStyle = "#465055";
    ctx.lineWidth = PIT_LANE.width;
    ctx.stroke(pit);
    ctx.setLineDash([10, 12]);
    ctx.strokeStyle = "#f4d784";
    ctx.lineWidth = 2;
    ctx.stroke(pit);
    ctx.setLineDash([]);
    ctx.restore();
    // Entrance and exit markings share the actual road endpoints.
    ctx.save();

    for(const [name,marker] of Object.entries(PIT_MARKERS)) {
      const boundary=pitBoundaryMark(name);
      const color=name==="entry" ? "#ffa64f" : "#a6f0d1";
      ctx.strokeStyle=color;ctx.lineWidth=4;ctx.lineCap="butt";ctx.beginPath();
      boundary.points.forEach((p,i)=>i ? ctx.lineTo(p.x,p.y) : ctx.moveTo(p.x,p.y));
      ctx.stroke();
      ctx.save();ctx.translate(boundary.label.x,boundary.label.y);ctx.rotate(boundary.label.angle);
      ctx.textAlign="center";ctx.textBaseline="middle";
      this.text(ctx,name==="entry" ? "PIT ENTRY · 80" : "PIT EXIT",0,0,12,color);
      ctx.restore();
    }
    ctx.restore();
    const pitLabel=samplePit(PIT_LANE.boxDistance);
    this.text(ctx, "PIT LANE  /  80", pitLabel.x+90, pitLabel.y+6, 12, "#d8ddd3");
    const start = sample(0);
    ctx.save();
    ctx.translate(start.x, start.y);
    ctx.rotate(start.angle);
    for (let x = 0; x < 12; x += 6)
      for (let y = -63; y < 63; y += 9) {
        ctx.fillStyle = (x / 6 + y / 9) & 1 ? "#e9ede7" : "#20272b";
        ctx.fillRect(x, y, 6, 9);
      }
    ctx.restore();
    for (let i = 0; i < 22; i++) {
      const slot=gridSlot(i),s=sample(slot.s);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.strokeStyle = "#899093";
      ctx.lineWidth = 1;
      ctx.strokeRect(-18,slot.offset-14,36,28);
      ctx.restore();
    }
    // Wider, alternating red and white kerbs along the inside of each corner.
    ctx.save();
    ctx.lineCap = "butt";
    ctx.clip(this.outsidePitRoad,"evenodd");
    for (const apex of APEXES) {
      for (let d = -105; d < 105; d += 15) {
        ctx.beginPath();
        for (let j=0;j<=4;j++) {
          const p=sample(apex.s+d+j*15/4);
          const edge=apex.side*(TRACK.width/2+3);
          const x=p.x-Math.sin(p.angle)*edge, y=p.y+Math.cos(p.angle)*edge;
          j ? ctx.lineTo(x,y) : ctx.moveTo(x,y);
        }
        ctx.lineWidth=18;
        ctx.strokeStyle=((d+105)/15)%2 ? "#f1eee6" : "#ed514b";
        ctx.stroke();
      }
    }
    ctx.restore();
    if (race && (race.pitRequested || race.player.pit)) {
      const rawBox = samplePit(race.pitBoxForCar(race.player)),
        box = {
          ...rawBox,
          x: rawBox.x - Math.sin(rawBox.angle) * 26,
          y: rawBox.y + Math.cos(rawBox.angle) * 26,
        },
        service = race.player.pit?.stage === "service",
        ready = !!race.player.pit?.serviced;
      ctx.save();
      ctx.translate(box.x, box.y);
      ctx.rotate(box.angle);
      ctx.fillStyle = "#465055";
      ctx.fillRect(-43, -30, 86, 60);
      ctx.fillStyle = service ? "#ffd17e28" : "#d6fca120";
      ctx.fillRect(-40, -27, 80, 54);
      ctx.strokeStyle = service ? "#ffd17e" : "#d6fca1";
      ctx.lineWidth = 3;
      ctx.setLineDash(service ? [] : [10, 6]);
      ctx.strokeRect(-40, -27, 80, 54);
      ctx.setLineDash([]);
      ctx.restore();
      this.text(
        ctx,
        service ? `SERVICE — HOLD ${Math.max(0,race.player.pit.timer).toFixed(1)}s` : ready ? "READY — GO" : "STOP IN BOX",
        box.x - 55,
        box.y - 40,
        13,
        service ? "#ffd17e" : "#d6fca1",
      );
    }
    if (race && !menu) {
      for (const s of race.skids) {
        ctx.globalAlpha = Math.max(0, 0.35 * (1 - (race.time - s.t) / 16));
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.a);
        ctx.fillStyle = "#12191d";
        ctx.fillRect(-7, -10, 14, 3);
        ctx.fillRect(-7, 7, 14, 3);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      for(const c of race.cars) if((!c.garage || c.player) && !trackLayer(c.s)) this.car(ctx,interpolatedCar(c,alpha),c.player ? countdownPulse(race.countdown) : 0);
      this.flyovers(ctx,race,alpha);
      for(const c of race.cars) if((!c.garage || c.player) && trackLayer(c.s)) this.car(ctx,interpolatedCar(c,alpha),c.player ? countdownPulse(race.countdown) : 0);
    } else {
      this.flyovers(ctx,null);
      this.text(ctx,TRACK.name.toUpperCase(),tx-300,ty,36,"#78988a");
    }
    ctx.restore();
    const vignette = ctx.createRadialGradient(
      w * 0.6,
      h * 0.5,
      100,
      w * 0.5,
      h * 0.5,
      w * 0.8,
    );
    vignette.addColorStop(0, "#07131800");
    vignette.addColorStop(1, menu ? "#071318b0" : "#07131835");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    if (race && !menu && race.weather.rain > 0.02) {
      ctx.save();
      ctx.strokeStyle = `rgba(187,211,226,${race.weather.rain * 0.35})`;
      ctx.lineWidth = 1;
      const clock = race.weather.elapsed;
      for (let i = 0; i < (race.mobile ? 50 : 100) * Math.max(0.1, race.weather.rain); i++) {
        const x = (i * 173 + clock * 110) % w,
          y = (i * 97 + clock * 650) % h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 8, y + 20);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (race && !menu && !race.mobile) this.minimap(race);
  }
  flyovers(ctx,race,alpha=1) {
    const view=underpassView(race?.player);
    const path=(a,b)=>{
      // Use the very same vertices as the main tarmac, avoiding mismatched
      // chords where the elevated overlay rejoins the base road.
      const road=new Path2D(),start=sample(a),end=sample(b);road.moveTo(start.x,start.y);
      for(const p of TRACK.pts)if(p.s>a&&p.s<b)road.lineTo(p.x,p.y);
      road.lineTo(end.x,end.y);return road;
    };
    ctx.save();
    if(view){const mask=new Path2D();mask.rect(-10000,-10000,20000,20000);mask.moveTo(view.x+view.radius,view.y);mask.arc(view.x,view.y,view.radius,0,Math.PI*2);ctx.clip(mask,"evenodd");}
    for(const [a,b] of TRACK.bridges) {
      const road=path(a,b);
      ctx.save();ctx.lineCap="butt";ctx.lineJoin="round";
      // Inset the shadow so it cannot cast a transverse dark seam onto the
      // continuing road at either end. The full road paint covers its ends.
      ctx.shadowColor="#0009";ctx.shadowBlur=20;ctx.shadowOffsetY=18;
      ctx.strokeStyle="#c9c9b5";ctx.lineWidth=142;ctx.stroke(path(a+55,b-55));
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.stroke(road);
      ctx.strokeStyle="#df655e";ctx.lineWidth=136;ctx.setLineDash([20,20]);ctx.lineDashOffset=-a;ctx.stroke(road);ctx.setLineDash([]);ctx.lineDashOffset=0;
      ctx.strokeStyle=asphaltColour(race?.weather?.wetness);ctx.lineWidth=TRACK.width;ctx.stroke(road);
      ctx.restore();
    }
    ctx.restore();
    if(view){
      // The base drawing contains both roads. Repaint the lower route inside
      // the window, otherwise it looks like a flat four-way intersection.
      ctx.save();ctx.beginPath();ctx.arc(view.x,view.y,view.radius,0,Math.PI*2);ctx.clip();
      ctx.fillStyle=TRACK.theme==="city" ? "#364247" : "#2a443c";
      ctx.fillRect(view.x-view.radius,view.y-view.radius,view.radius*2,view.radius*2);
      const s=wrap(race.player.s,TRACK.length),a=Math.max(0,s-240),b=Math.min(TRACK.length,s+240),road=path(a,b);
      ctx.lineCap="butt";ctx.lineJoin="round";ctx.strokeStyle="#153029";ctx.lineWidth=174;ctx.stroke(road);
      ctx.strokeStyle="#c9c9b5";ctx.lineWidth=142;ctx.stroke(road);
      ctx.strokeStyle="#df655e";ctx.lineWidth=136;ctx.setLineDash([20,20]);ctx.lineDashOffset=-a;ctx.stroke(road);ctx.setLineDash([]);ctx.lineDashOffset=0;
      ctx.strokeStyle=asphaltColour(race.weather?.wetness);ctx.lineWidth=TRACK.width;ctx.stroke(road);
      for(const c of race.cars)if(!c.garage&&!trackLayer(c.s))this.car(ctx,interpolatedCar(c,alpha));
      ctx.restore();
      ctx.save();ctx.globalAlpha=.65*view.alpha;ctx.strokeStyle="#d6fca1";ctx.lineWidth=2;ctx.setLineDash([7,7]);
      ctx.beginPath();ctx.arc(view.x,view.y,view.radius,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
      ctx.globalAlpha=view.alpha;ctx.fillStyle="#102027e8";ctx.fillRect(view.x-52,view.y-view.radius-24,104,22);
      ctx.textAlign="center";this.text(ctx,"UNDERPASS",view.x,view.y-view.radius-8,12,"#d6fca1");ctx.restore();
    }
  }
  buildings(ctx) {
    ctx.fillStyle = "#162b29";
    ctx.fillRect(820, 1630, 550, 105);
    ctx.fillStyle = "#b3c0b8";
    ctx.fillRect(820, 1615, 550, 75);
    for (let i = 0; i < 11; i++) {
      ctx.fillStyle = i % 2 ? "#687c76" : "#71847e";
      ctx.fillRect(830 + i * 48, 1625, 40, 54);
    }
    ctx.fillStyle = "#142b29";
    ctx.fillRect(1490, NORTHLINE_BUILDING.y+10, 340, 130);
    ctx.fillStyle = "#92a7a0";
    ctx.fillRect(1490, NORTHLINE_BUILDING.y, 340, 95);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i % 2 ? "#657e75" : "#bbd0c4";
      ctx.fillRect(1496, NORTHLINE_BUILDING.y+7+i*13, 328, 6);
    }
    this.text(ctx, "NORTHLINE MOTOR PARK", 1540, NORTHLINE_BUILDING.y+40, 12, "#203b34");
    ctx.fillStyle = "#c2bca4";
    ctx.fillRect(120, 1050, 250, 30);
    ctx.fillStyle = "#a8b3a2";
    ctx.fillRect(360, 75, 450, 80);
  }
  text(ctx, text, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.font = `700 ${size}px system-ui`;
    ctx.fillText(text, x, y);
  }
  car(ctx, c, pulse=0) {
    ctx.save();
    ctx.translate(c.x + 3, c.y + 4);
    ctx.rotate(c.angle);
    ctx.fillStyle = "#0006";
    ctx.fillRect(-17, -12, 35, 25);
    ctx.restore();
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    if (c.player && pulse>0) {
      ctx.save();ctx.globalAlpha*=pulse;
      ctx.strokeStyle = "#dfffaf";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 25+6*pulse, 0, Math.PI * 2);
      ctx.stroke();ctx.restore();
    }
    ctx.fillStyle = "#131c22";
    ctx.fillRect(-12, -13, 9, 6);
    ctx.fillRect(-12, 7, 9, 6);
    ctx.fillRect(8, -13, 8, 6);
    ctx.fillRect(8, 7, 8, 6);
    ctx.fillStyle = c.team.color;
    ctx.fillRect(-17, -11, 4, 22);
    ctx.fillRect(14, -13, 4, 26);
    ctx.beginPath();
    ctx.moveTo(-13, -7);
    ctx.lineTo(1, -8);
    ctx.lineTo(17, -3);
    ctx.lineTo(17, 3);
    ctx.lineTo(1, 8);
    ctx.lineTo(-13, 7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = c.team.accent;
    ctx.fillRect(-12, -5, 13, 10);
    ctx.fillRect(8, -2, 10, 4);
    ctx.fillStyle = "#13212b";
    ctx.beginPath();
    ctx.ellipse(-2, 0, 5, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e5eae6";
    ctx.beginPath();
    ctx.arc(-1, 0, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = TYRES[c.tyre].color;
    ctx.fillRect(-9, -13, 2, 6);
    ctx.fillRect(-9, 7, 2, 6);
    ctx.restore();
    if (c.player && pulse>0) {
      ctx.save();ctx.globalAlpha*=pulse;
      ctx.fillStyle = "#e4ffb2";
      ctx.font = "700 10px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("YOU", c.x, c.y - 34);
      ctx.textAlign = "left";ctx.restore();
    }
  }
  minimap(race) {
    const ctx = this.ctx;
    const small = this.w < 700;
    const w = small ? 125 : 180,
      h = w * 0.65,
      x = this.w - w - 24,
      y = small ? 280 : 105;
    ctx.save();
    ctx.fillStyle = "#101c22d9";
    ctx.beginPath();
    ctx.roundRect(x - 10, y - 10, w + 20, h + 25, 12);
    ctx.fill();
    ctx.translate(x, y);
    const b=TRACK.bounds,scale=Math.min(w/(b.maxX-b.minX),h/(b.maxY-b.minY));
    ctx.scale(scale,scale);ctx.translate(-b.minX,-b.minY);
    ctx.strokeStyle = "#7e918d";
    ctx.lineWidth = 25;
    ctx.stroke(this.road);
    for (const c of race.cars) {
      if (c.dnf) continue;
      ctx.fillStyle = c.player ? "#dbffa6" : c.team.color;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.player ? 43 : 23, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
