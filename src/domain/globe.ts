import {COUNTRY_LL,WORLD_OUTLINES} from './world';
export function countryCode(code:string){const normalized=code.trim().toUpperCase();return normalized==='UK'?'GB':normalized.split('-')[0];}
export function coordinates(code:string){return COUNTRY_LL[countryCode(code)]||null;}
export function project(lon:number,lat:number,view:{lon:number;lat:number}){
 const rad=Math.PI/180,phi=lat*rad,center=view.lat*rad,delta=(lon-view.lon)*rad;
 return {x:220+104*Math.cos(phi)*Math.sin(delta),y:130-104*(Math.cos(center)*Math.sin(phi)-Math.sin(center)*Math.cos(phi)*Math.cos(delta)),visible:Math.sin(center)*Math.sin(phi)+Math.cos(center)*Math.cos(phi)*Math.cos(delta)>0.02};
}
export function globeLine(points:[number,number][],view:{lon:number;lat:number}){
 let drawing='',pen=false;
 for(const [lon,lat] of points){const p=project(lon,lat,view);if(!p.visible){pen=false;continue;}drawing+=`${pen?'L':'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)} `;pen=true;}
 return drawing.trim();
}
export function coastlines(view:{lon:number;lat:number}){return WORLD_OUTLINES.map(ring=>globeLine([...ring,ring[0]],view)).filter(Boolean);}
export function gridlines(view:{lon:number;lat:number}){
 const rings:[number,number][][]=[];
 for(let lon=-180;lon<180;lon+=30)rings.push(Array.from({length:61},(_,i)=>[lon,-90+i*3]));
 for(let lat=-60;lat<=60;lat+=30)rings.push(Array.from({length:121},(_,i)=>[-180+i*3,lat]));
 return rings.map(r=>globeLine(r,view)).filter(Boolean);
}
