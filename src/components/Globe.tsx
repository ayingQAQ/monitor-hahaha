import {useEffect,useMemo,useRef,useState} from 'react';
import type {Node} from '../data/api';
import {coastlines,coordinates,countryCode,gridlines,project} from '../domain/globe';
import {Button,Stroke} from './Sketch';
export function Globe({nodes,onOpen,focus,onFocus}:{nodes:Node[];onOpen:(id:number)=>void;focus:string;onFocus:(code:string)=>void}){
 const [view,setView]=useState({lon:100,lat:25});
 const surface=useRef<HTMLDivElement>(null),pauseUntil=useRef(0),hovered=useRef(false);

 useEffect(()=>{const ll=coordinates(focus);if(ll){pauseUntil.current=performance.now()+6000;setView({lon:ll[0],lat:ll[1]});}},[focus]);
 const drag=useRef<{x:number;y:number;lon:number;lat:number}|null>(null);
 useEffect(()=>{
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let frame=0,previous=0,inView=true;
  const tick=(now:number)=>{
   if(document.hidden||reduced.matches||!inView){frame=0;return;}
   frame=requestAnimationFrame(tick);
   if(!previous){previous=now;return;}
   if(now-previous<50)return;
   const elapsed=Math.min(now-previous,100);previous=now;
   if(drag.current||hovered.current||now<pauseUntil.current)return;
   setView(v=>({...v,lon:((v.lon+elapsed*.003+180)%360)-180}));
  };
  const sync=()=>{
   cancelAnimationFrame(frame);frame=0;previous=0;
   if(!document.hidden&&!reduced.matches&&inView)frame=requestAnimationFrame(tick);
  };
  const observer=new IntersectionObserver(entries=>{inView=entries[0].isIntersecting;sync();});
  if(surface.current)observer.observe(surface.current);
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);sync();
  return ()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener('visibilitychange',sync);reduced.removeEventListener('change',sync);};
 },[]);
 const land=useMemo(()=>coastlines(view),[view]),grid=useMemo(()=>gridlines(view),[view]);
 const points=nodes.flatMap(n=>{
  const ll=coordinates(n.country);if(!ll)return [];
  const p=project(ll[0],ll[1],view);if(!p.visible)return [];
  const siblings=nodes.filter(s=>countryCode(s.country)===countryCode(n.country)),i=siblings.findIndex(s=>s.id===n.id);
  const angle=i*2.399,r=siblings.length>1?Math.min(16,5*Math.sqrt(i+1)):0;
  return [{node:n,x:p.x+Math.cos(angle)*r,y:p.y+Math.sin(angle)*r}];
 });
 return <div className="node-globe" ref={surface} onMouseEnter={()=>{hovered.current=true;}} onMouseLeave={()=>{hovered.current=false;}} onFocusCapture={()=>{pauseUntil.current=performance.now()+6000;}}>
  <svg className="globe-map" viewBox="80 10 280 250" aria-label="节点地区分布，可拖动地球或点击节点" role="group"
   onPointerDown={e=>{if((e.target as Element).closest('.globe-pin'))return;pauseUntil.current=performance.now()+6000;drag.current={x:e.clientX,y:e.clientY,...view};e.currentTarget.setPointerCapture(e.pointerId);}}
   onPointerMove={e=>{const d=drag.current;if(!d)return;const scale=280/e.currentTarget.getBoundingClientRect().width;onFocus('');setView({lon:(((d.lon-(e.clientX-d.x)*scale*.48+180)%360+360)%360)-180,lat:Math.max(-65,Math.min(65,d.lat+(e.clientY-d.y)*scale*.36))});}}
   onPointerUp={e=>{pauseUntil.current=performance.now()+6000;drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}}
   onPointerCancel={()=>{drag.current=null;}}>
   <Stroke d="M220 26 A104 104 0 1 1 220 234 A104 104 0 1 1 220 26" fill="#bed5d222" color="var(--blue)" roughness={.9} weight={1.2}/>
   {grid.map((d,i)=><Stroke key={`grid-${i}`} d={d} color="#7b9fa155" roughness={.25} weight={.55}/>)}
   {land.map((d,i)=><Stroke key={`land-${i}`} d={d} color="var(--green)" roughness={.55} weight={.85}/>)}
   <Stroke d="M112 239 Q216 257 329 237 M135 247 Q223 253 301 243" color="#97896c50" roughness={1.4} weight={1}/>
   {points.map(({node,x,y})=><g key={node.id} className={`globe-pin ${node.online?'online':'offline'}`} role="button" tabIndex={0} aria-label={`查看节点 ${node.name}`} onClick={()=>onOpen(node.id)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();onOpen(node.id);}}}>
    <title>{node.name} · {node.online?'在线':'离线'}</title>
    <circle cx={x} cy={y} r="12" fill="transparent"/>
    <Stroke d={`M${x} ${y-4} A4 4 0 1 1 ${x} ${y+4} A4 4 0 1 1 ${x} ${y-4}`} color={node.online?'var(--blue)':'var(--red)'} fill={node.online?'var(--blue)':'var(--red)'} roughness={.7} weight={1}/>
   </g>)}
  </svg>

 </div>;
}

export function GlobeRegions({nodes,focus,onFocus}:{nodes:Node[];focus:string;onFocus:(code:string)=>void}){
 const countries=[...new Set(nodes.map(n=>countryCode(n.country)))].filter(c=>/^[A-Z]{2}$/.test(c));
 return <div className="globe-regions" aria-label="国家筛选"><Button label="全部地区" pressed={!focus} onClick={()=>onFocus('')}>全部地区</Button>{countries.map(code=><Button key={code} label={`筛选 ${code} 地区`} pressed={focus===code} onClick={()=>onFocus(code)}>{code} · {nodes.filter(n=>countryCode(n.country)===code).length}</Button>)}</div>;
}
