// Original circuits: each has its own geometry, setting and racing character.
// layoutScale sets circuit dimensions at the unchanged road width. Calibrated
// with benchmark-aero.mjs: mixed layouts trade straight-line gains for corner
// losses; Sunset/Velocity favour speed and Harbour/Riviera favour downforce.
// Bends leave room for the full road and kerbs; separate sections meet only at flyovers.
export const CIRCUITS=[
 {"id":"northline","layoutScale":2.1,"name":"Northline Motor Park","country":"Great Britain","character":"Fast & flowing","theme":"park","anchors":[[700,1350],[1450,1350],[1920,1240],[2140,970],[2020,620],[1717,434],[1468,555],[1205,743],[983,666],[774,384],[472,307],[220,500],[240,900],[450,1110]]},
 {"id":"velocity","layoutScale":1.6,"name":"Velocity International","country":"Italy","character":"Triangle layout · long straights","theme":"park","anchors":[[800,1800],[2200,1800],[3520,1786],[3675,1493],[3209,1169],[2639,909],[2142,434],[1829,131],[1483,359],[1100,901],[691,1248],[303,1630],[399,1834]]},
 {"id":"harbour","layoutScale":1.3,"name":"Harbour Street Circuit","country":"Singapore","character":"Street esses · tight corners","theme":"city","anchors":[[700,1500],[1350,1500],[1805,1296],[1757,1063],[1212,900],[1231,656],[1798,462],[1793,218],[1198,111],[816,416],[331,260],[105,462],[150,1150],[350,1450]]},
 {"id":"sunset","name":"Sunset Speedway","country":"United States","character":"Banked oval · flat-out racing","theme":"desert","ovalRadius":750,"banks":[[1,2],[3,4]],"anchors":[[1000,1500],[2200,1500],[3000,1150],[3000,600],[2100,220],[1000,220],[150,600],[150,1120]]},
 {"id":"alpine","layoutScale":2.05,"name":"Alpine Ridge","country":"Austria","character":"Long lap · mountain hairpins","theme":"mountain","anchors":[[850,2150],[1800,2150],[2250,1900],[2386,1373],[2148,1015],[2312,527],[1802,162],[1371,532],[1574,1106],[1208,1420],[875,1150],[636,663],[216,734],[180,1650],[450,1950]]},
 {"id":"crossover","layoutScale":1.85,"name":"Crossover Park","country":"Japan","character":"Figure eight · crossing straight","theme":"park","bridges":[[4.0,6.0]],"anchors":[[700,1600],[1550,1600],[2250,1300],[2150,850],[1650,720],[1201,954],[629,1104],[193,1049],[159,603],[646,448],[1220,540],[1291,1061],[606,1337]]},
 {"id":"dunes","layoutScale":1.8,"name":"Dunes Grand Prix","country":"Bahrain","character":"Twin straights · stadium hairpins","theme":"desert","anchors":[[700,1800],[2600,1800],[3300,1700],[3500,1400],[3300,1000],[2800,669],[2300,826],[2378,1173],[2942,1300],[2979,1513],[2597,1609],[924,1607],[569,1393],[313,917],[722,469],[590,181],[187,324],[50,1001],[180,1500],[314,1663]]},
 {"id":"forest","layoutScale":1.45,"name":"Forest Run","country":"Belgium","character":"Tall serpentine · linked fast esses","theme":"forest","anchors":[[700,2200],[1600,2200],[1804,1969],[1702,1519],[1907,1163],[1763,798],[2024,290],[1705,-32],[795,152],[450,650],[400,1500],[450,2000]]},
 {"id":"riviera","layoutScale":1.4,"name":"Riviera Port","country":"France","character":"Compact kite · coastal hairpin","theme":"coast","anchors":[[553,1063],[1105,1063],[1335,983],[1334,787],[1093,487],[1113,46],[906,-97],[507,270],[186,554],[174,849],[380,1006]]},
 {"id":"metro","layoutScale":2,"name":"Metro Flyway","country":"South Korea","character":"Urban switchbacks · crossing straight","theme":"city","bridges":[[4.3,6.2]],"anchors":[[850,1800],[1300,1800],[2000,1800],[2650,1450],[2300,850],[1600,650],[1050,1100],[500,1150],[180,950],[180,250],[650,150],[1000,450],[1100,700],[1500,900],[1900,1100],[1950,1370],[1700,1500],[1300,1400],[850,1420],[550,1420],[390,1480],[330,1630],[390,1780],[550,1840]]},
 {"id":"canyon","layoutScale":2.1,"name":"Copper Canyon","country":"Mexico","character":"Comb layout · repeated switchbacks","theme":"desert","banks":[[14,16]],"anchors":[[900,1800],[2100,1800],[2684,1468],[2470,1164],[1747,1203],[1781,953],[2734,958],[2748,651],[1630,759],[1606,428],[2336,224],[2244,-18],[1406,167],[919,377],[497,274],[184,695],[252,1354],[608,1663]]},
 {"id":"aurora","layoutScale":1.8,"name":"Aurora Grand Prix","country":"Canada","character":"L-shaped circuit · banked sweeper","theme":"coast","banks":[[1.4,3.2]],"anchors":[[800,1800],[2200,1800],[2900,1500],[2900,950],[2490,727],[1575,759],[1435,211],[1000,44],[610,319],[648,1098],[244,1431],[250,1705]]}
];
export const circuitById=id=>CIRCUITS.find(t=>t.id===id)||CIRCUITS[0];

// Extend only the pit straight and its approach/departure. Keep the inner
// circuit, including flyover topology, in its original position.
export function circuitAnchors(circuit){
 const anchors=circuit.anchors.map(p=>[...p]),span=anchors[1][0]-anchors[0][0],extra=Math.max(0,1600-span);
 const bottom=Math.max(...anchors.map(p=>p[1]))+450;
 anchors[0]=[anchors[0][0]-extra/2,bottom];anchors[1]=[anchors[1][0]+extra/2,bottom];
 // Sunset keeps the same extended pit straight, with matching semicircular
 // ends and a parallel backstretch instead of separate approach bends.
 if(circuit.ovalRadius)return [anchors[0],anchors[1],[anchors[1][0],bottom-2*circuit.ovalRadius],[anchors[0][0],bottom-2*circuit.ovalRadius]];
 anchors[anchors.length-1]=[anchors[0][0]-350,bottom-400];
 if(!["velocity","dunes","canyon","aurora"].includes(circuit.id))anchors[2]=[anchors[1][0]+350,bottom-400];
 if(circuit.id==="velocity"){anchors[2]=[3420,2020];anchors[3]=[3720,1600];}
 if(circuit.id==="harbour")anchors[anchors.length-2]=[100,1100];
 if(circuit.id==="riviera"){anchors[3]=[1640,650];anchors[4]=[1210,420];anchors[5]=[1150,30];anchors[6]=[880,-130];}
 if(circuit.id==="forest")anchors[3]=[2100,1700];
 if(circuit.id==="riviera")anchors[anchors.length-2]=[anchors[0][0]-350,bottom-650];
 if(circuit.id==="metro"){anchors[20]=[150,1420];anchors[21]=[-50,1500];anchors[22]=[-125,1700];}
 return anchors;
}
