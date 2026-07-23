"use client";

import { useMemo, useState } from "react";

const localIso=(d:Date)=>{const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)};
const post=(body:Record<string,unknown>)=>fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});

const zones=["Шея","Плечи","Локти","Запястья","Спина","Тазобедренные","Колени","Голеностоп"];
const zoneMarkers:Record<string,string[]>={
 "Шея":["neck"],
 "Плечи":["shoulder-left","shoulder-right"],
 "Локти":["elbow-left","elbow-right"],
 "Запястья":["wrist-left","wrist-right"],
 "Спина":["back"],
 "Тазобедренные":["hip-left","hip-right"],
 "Колени":["knee-left","knee-right"],
 "Голеностоп":["ankle-left","ankle-right"],
};
export function BodyMap({data,refresh}:{data:any;refresh:()=>void}){
 const today=localIso(new Date()),current=(data.wellnessLogs||[]).find((x:any)=>x.date===today)||{},[zone,setZone]=useState(current.painArea||""),[pain,setPain]=useState(String(current.pain||0)),[message,setMessage]=useState("");
 const save=async()=>{const r=await post({action:"wellness",date:today,energy:current.energy||3,pain,painArea:zone,note:current.note||""});setMessage(r.ok?"Состояние сохранено":"Не удалось сохранить");if(r.ok)refresh()};
 return <section className="body-map card"><div><p className="eyebrow">КАРТА ТЕЛА</p><h3>Где ощущается дискомфорт?</h3><p>Отметь область и интенсивность. При повторяющейся или острой боли нужна консультация врача.</p></div><div className={`body-silhouette${zone?" has-active-zone":""}`} aria-label={zone?`Выбрана область боли: ${zone}`:"Область боли не выбрана"}>{zoneMarkers[zone]?.map(marker=><span className={`pain-marker ${marker}`} key={marker} aria-hidden="true"/>)}{zone&&<b className="pain-zone-label">{zone}</b>}<i className="head"/><i className="torso"/><i className="arm left"/><i className="arm right"/><i className="leg left"/><i className="leg right"/></div><div className="body-controls"><div>{zones.map(x=><button type="button" key={x} className={zone===x?"active":""} aria-pressed={zone===x} onClick={()=>setZone(zone===x?"":x)}>{x}</button>)}</div><label>Интенсивность: <b>{pain}/10</b><input type="range" min="0" max="10" value={pain} onChange={e=>setPain(e.target.value)}/></label><button className="primary" type="button" onClick={save}>Сохранить состояние</button>{message&&<small>{message}</small>}</div></section>
}

function haversine(a:[number,number],b:[number,number]){const r=6371000,p=(x:number)=>x*Math.PI/180,dLat=p(b[0]-a[0]),dLon=p(b[1]-a[1]),q=Math.sin(dLat/2)**2+Math.cos(p(a[0]))*Math.cos(p(b[0]))*Math.sin(dLon/2)**2;return 2*r*Math.asin(Math.sqrt(q))}
export function GarminImport({refresh}:{refresh:()=>void}){
 const [preview,setPreview]=useState<any>(null),[status,setStatus]=useState("");
 const parse=async(file:File)=>{setStatus("");try{const xml=new DOMParser().parseFromString(await file.text(),"application/xml");if(xml.querySelector("parsererror"))throw new Error();const points=Array.from(xml.querySelectorAll("trkpt, Trackpoint")).map((node:any)=>{const lat=Number(node.getAttribute("lat")||node.querySelector("Position LatitudeDegrees")?.textContent),lon=Number(node.getAttribute("lon")||node.querySelector("Position LongitudeDegrees")?.textContent),time=node.querySelector("time, Time")?.textContent||"",hr=Number(node.querySelector("hr, HeartRateBpm Value")?.textContent)||0;return{lat,lon,time,hr}});if(!points.length)throw new Error();const timed=points.filter(x=>x.time),start=new Date(timed[0]?.time),end=new Date(timed[timed.length-1]?.time),duration=Math.max(0,Math.round((end.getTime()-start.getTime())/1000)),distance=Math.round(points.slice(1).reduce((n,p,i)=>n+(Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Number.isFinite(points[i].lat)&&Number.isFinite(points[i].lon)?haversine([points[i].lat,points[i].lon],[p.lat,p.lon]):0),0)),hrs=points.map(x=>x.hr).filter(Boolean),name=xml.querySelector("name, Name")?.textContent||file.name.replace(/\.(gpx|tcx)$/i,"");setPreview({date:Number.isFinite(start.getTime())?localIso(start):localIso(new Date()),title:name,type:/swim|плав/i.test(name)?"Плавание":"Кардио",durationSeconds:duration,distanceMeters:distance,minHeartRate:hrs.length?Math.min(...hrs):0,avgHeartRate:hrs.length?Math.round(hrs.reduce((a,b)=>a+b,0)/hrs.length):0,maxHeartRate:hrs.length?Math.max(...hrs):0,avgSpeed:duration?Number((distance/1000/(duration/3600)).toFixed(1)):0})}catch{setPreview(null);setStatus("Файл не распознан. Поддерживаются экспортированные Garmin GPX и TCX.")}};
 const save=async()=>{if(!preview)return;const r=await post({action:"workout",...preview,rounds:1,restSeconds:0,completed:[],details:[],calories:0});setStatus(r.ok?"Активность Garmin добавлена":"Не удалось добавить активность");if(r.ok){setPreview(null);refresh()}};
 return <section className="garmin-import card"><div><p className="eyebrow">GARMIN · ЛОКАЛЬНЫЙ ИМПОРТ</p><h3>Загрузить активность</h3><p>Файл разбирается прямо в браузере и не отправляется сторонним сервисам.</p></div><label className="file-drop">GPX или TCX<input type="file" accept=".gpx,.tcx,application/gpx+xml,application/xml" onChange={e=>e.target.files?.[0]&&parse(e.target.files[0])}/></label>{preview&&<div className="garmin-preview"><b>{preview.title}</b><span>{Math.round(preview.durationSeconds/60)} мин</span><span>{(preview.distanceMeters/1000).toFixed(2)} км</span><span>Пульс {preview.avgHeartRate||"—"}</span><button onClick={save}>Добавить в журнал</button></div>}{status&&<small>{status}</small>}</section>
}

export function PersonalRecords({data}:{data:any}){
 const records=useMemo(()=>{const groups=new Map<string,any[]>();for(const x of data.strengthLogs||[])groups.set(x.exercise,[...(groups.get(x.exercise)||[]),x]);return [...groups].map(([exercise,logs])=>({exercise,best:Math.max(...logs.map(x=>Number(x.weight)||0)),volume:Math.max(...logs.map(x=>(Number(x.weight)||0)*(Number(x.reps)||0)))})).sort((a,b)=>b.volume-a.volume).slice(0,6)},[data.strengthLogs]);
 if(!records.length)return null;return <section className="records card"><p className="eyebrow">ЛИЧНЫЕ РЕКОРДЫ</p><h3>Лучшие рабочие веса</h3><div>{records.map(x=><article key={x.exercise}><span>{x.exercise}</span><b>{x.best} кг</b><small>лучший объём {x.volume}</small></article>)}</div></section>
}
