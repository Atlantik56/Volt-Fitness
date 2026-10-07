import type Database from "better-sqlite3";
import { USERNAME } from "./user.ts";

export const HEALTH_AGGREGATE_ORIGIN = "health_connect.aggregate";
type RecordRow = { id:number;recordType:string;origin:string;start:string;end:string;metrics:string;modified:string|null;timeZone:string };
export type HealthWellnessDay = {
  date:string;weight?:number;weightRecordId?:number;steps?:number;activeCalories?:number;totalCalories?:number;
  sleepSeconds?:number;restingHr?:number;hrvRmssd?:number;averageHeartRate?:number;sources:Record<string,string>;
};
const dayInZone=(instant:string,zone:string)=>new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(instant));
const priority=(origin:string)=>origin===HEALTH_AGGREGATE_ORIGIN?0:origin.toLowerCase().includes("garmin")?1:2;
const fresh=(a:RecordRow,b:RecordRow)=>Date.parse(b.start)-Date.parse(a.start)||Date.parse(b.modified||b.end)-Date.parse(a.modified||a.end)||b.id-a.id;

/** Only wellness records. Never reads or creates workouts/imports/drafts. */
export function readHealthWellness(database:Database.Database,from="2000-01-01",to="2999-12-31",username=USERNAME):HealthWellnessDay[]{
  // Some isolated Coach fixtures intentionally contain no bridge tables.
  if(!database.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='health_connect_records'").get())return [];
  const rows=database.prepare(`SELECT id,record_type recordType,source_origin origin,start_time start,end_time end,metrics,
    source_modified_at modified,time_zone timeZone FROM health_connect_records WHERE username=?
    AND record_type IN ('weight','steps','active_calories','total_calories','sleep','resting_heart_rate','heart_rate_variability','heart_rate')
    AND (record_type!='heart_rate' OR source_origin='health_connect.aggregate')
    AND start_time>=? AND start_time<? ORDER BY start_time DESC,id DESC LIMIT 100000`).all(username,new Date(Date.parse(`${from}T00:00:00Z`)-86400000).toISOString(),new Date(Date.parse(`${to}T00:00:00Z`)+2*86400000).toISOString()) as RecordRow[];
  const groups=new Map<string,RecordRow[]>();
  for(const row of rows){
    const date=dayInZone(row.recordType==="sleep"?row.end:row.start,row.timeZone);
    if(date<from||date>to)continue;
    const key=`${date}|${row.recordType}`;groups.set(key,[...(groups.get(key)||[]),row]);
  }
  const days=new Map<string,HealthWellnessDay>();
  for(const [key,records] of groups){
    const [date,type]=key.split("|");const day=days.get(date)||{date,sources:{}};
    const origins=[...new Set(records.map(row=>row.origin))].sort((a,b)=>priority(a)-priority(b)||a.localeCompare(b));
    const selected=records.filter(row=>row.origin===origins[0]).sort(fresh);
    const values=selected.map(row=>({row,metrics:JSON.parse(row.metrics) as Record<string,number>}));
    if(type==="weight"){day.weight=values[0].metrics.kilograms;day.weightRecordId=values[0].row.id;day.sources.weight=origins[0]}
    else if(type==="heart_rate"){day.averageHeartRate=values[0].metrics.averageBpm;day.sources.averageHeartRate=origins[0]}
    else if(type==="resting_heart_rate"){day.restingHr=values[0].metrics.bpm;day.sources.restingHr=origins[0]}
    else if(type==="heart_rate_variability"){day.hrvRmssd=values[0].metrics.rmssdMillis;day.sources.hrvRmssd=origins[0]}
    else {
      // SDK daily totals supersede legacy raw intervals. Never add both.
      const intervals=selected.sort((a,b)=>Date.parse(a.start)-Date.parse(b.start)||Date.parse(b.end)-Date.parse(a.end));
      let end=-Infinity,total=0,overlap=false;
      for(const row of intervals){
        const startMs=Date.parse(row.start),endMs=Date.parse(row.end);
        if(startMs<end){overlap=true;break}
        // Legacy cross-midnight steps/calories cannot be apportioned accurately.
        if(type!=="sleep"&&row.origin!==HEALTH_AGGREGATE_ORIGIN&&dayInZone(new Date(endMs-1).toISOString(),row.timeZone)!==date){overlap=true;break}
        const metrics=JSON.parse(row.metrics);total+=type==="sleep"?metrics.durationSeconds:type==="steps"?metrics.count:metrics.kilocalories;end=endMs;
      }
      // Ambiguous legacy intervals stay raw rather than inflating daily totals.
      if(!overlap){const field=type==="sleep"?"sleepSeconds":type==="steps"?"steps":type==="active_calories"?"activeCalories":"totalCalories";
        day[field]=Math.round(total*100)/100;day.sources[field]=origins[0]}
    }
    days.set(date,day);
  }
  return [...days.values()].sort((a,b)=>b.date.localeCompare(a.date));
}

export function mergeHealthMeasurements<T extends {date:string;weight?:number|null}>(manual:T[],days:HealthWellnessDay[]):(T|{id:number;date:string;weight:number;waist:null;chest:null;biceps:null;thigh:null;neck:null;metricsSource:string})[]{
  const manualDates=new Set(manual.filter(row=>row.weight!=null).map(row=>row.date));
  const measured=days.filter(day=>day.weight!=null&&!manualDates.has(day.date)).map(day=>({id:-day.weightRecordId!,date:day.date,weight:day.weight!,waist:null,chest:null,biceps:null,thigh:null,neck:null,metricsSource:"health_connect"}));
  return [...manual,...measured].sort((a,b)=>b.date.localeCompare(a.date)||Number((b as {id?:number}).id||0)-Number((a as {id?:number}).id||0));
}

export function mergeHealthActivity<T extends {date:string;steps?:number;calories?:number;sleepHours?:number;healthOverrides?:string}>(manual:T[],days:HealthWellnessDay[]){
  const result=new Map<string,Record<string,any>&{date:string}>(manual.map(row=>[row.date,{...row}]));
  for(const day of days){
    const row=result.get(day.date)||{date:day.date,id:0,steps:0,calories:0,sleepHours:0,activeMinutes:0,beers:0} as Record<string,any>&{date:string};
    const overrides=new Set<string>(JSON.parse(row.healthOverrides||"[]"));
    const measured={steps:day.steps,calories:day.activeCalories,sleepHours:day.sleepSeconds==null?undefined:day.sleepSeconds/3600};
    const sources:Record<string,string>={};
    for(const [field,value] of Object.entries(measured))if(value!=null&&!overrides.has(field)&&!(Number(row[field])>0)){row[field]=value;sources[field]="health_connect"}
    row.healthConnect={...day};row.metricsSources=sources;result.set(day.date,row);
  }
  return [...result.values()].sort((a,b)=>b.date.localeCompare(a.date));
}

export function mergeHealthRecovery<T extends {date:string;sleepSeconds?:number|null;hrvRmssd?:number|null;restingHr?:number|null}>(intervals:T[],days:HealthWellnessDay[]){
  const result=new Map<string,{date:string;sleepSeconds:number|null;hrvRmssd:number|null;restingHr:number|null}&Record<string,any>>(intervals.map(row=>[row.date,{...row,sleepSeconds:row.sleepSeconds??null,hrvRmssd:row.hrvRmssd??null,restingHr:row.restingHr??null}]));
  for(const day of days){
    const row=result.get(day.date)||{date:day.date,sleepSeconds:null,hrvRmssd:null,restingHr:null};
    for(const field of ["sleepSeconds","hrvRmssd","restingHr"] as const)if(row[field]==null&&day[field]!=null)row[field]=day[field];
    result.set(day.date,row);
  }
  return [...result.values()].sort((a,b)=>b.date.localeCompare(a.date));
}
