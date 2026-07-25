// Sprint 6.8 — недостающие расчёты для AI Context Builder и недельного отчёта.
// Обычный детерминированный код: ИИ объясняет уже посчитанные здесь числа, а не считает сам.

export type WeightWeeklyTrend={
  avg7d:number|null;
  avgPrev7d:number|null;
  weekChange:number|null;
  trend:"up"|"down"|"flat"|"unknown";
};

export type NutritionWeeklyStats={
  avgCalories7d:number|null;
  avgProtein7d:number|null;
  daysLogged7d:number;
  planAdherencePct:number|null;
};

const round1=(n:number)=>Math.round(n*10)/10;
const avg=(values:number[])=>values.length?values.reduce((a,b)=>a+b,0)/values.length:null;

const daysBetween=(from:string,to:string)=>{
  const a=Date.parse(`${from}T00:00:00Z`),b=Date.parse(`${to}T00:00:00Z`);
  if(!Number.isFinite(a)||!Number.isFinite(b))return null;
  return Math.round((b-a)/86400000);
};

// Среднее за последние 7 и предыдущие 7 дней, а не два точечных замера —
// одиночный выброс не должен читаться как «вес пошёл вверх/вниз».
export function computeWeightWeeklyTrend(measurements:{date:string;weight:number|null}[],anchor:string):WeightWeeklyTrend{
  const points=measurements.filter(m=>m.weight!=null&&m.date<=anchor);
  const inWindow=(days0:number,days1:number)=>points.filter(m=>{const gap=daysBetween(m.date,anchor);return gap!==null&&gap>=days0&&gap<days1}).map(m=>m.weight as number);
  const last7=inWindow(0,7), prev7=inWindow(7,14);
  const avg7d=avg(last7), avgPrev7d=avg(prev7);
  if(avg7d==null)return {avg7d:null,avgPrev7d:null,weekChange:null,trend:"unknown"};
  if(avgPrev7d==null)return {avg7d:round1(avg7d),avgPrev7d:null,weekChange:null,trend:"unknown"};
  const weekChange=round1(avg7d-avgPrev7d);
  const trend=Math.abs(weekChange)<0.2?"flat":weekChange<0?"down":"up";
  return {avg7d:round1(avg7d),avgPrev7d:round1(avgPrev7d),weekChange,trend};
}

// Соблюдение плана по калориям: доля дней за 7, когда записанные калории попали
// в разумный коридор цели (не сам факт «поел», а именно попадание в цель).
export function computeNutritionWeeklyStats(
  foodLogs:{date:string;calories?:number;protein?:number}[],
  anchor:string,
  targets:{calories:number;protein:number},
):NutritionWeeklyStats{
  const byDate=new Map<string,{calories:number;protein:number}>();
  for(const row of foodLogs){
    const gap=daysBetween(row.date,anchor);
    if(gap===null||gap<0||gap>=7)continue;
    const prev=byDate.get(row.date)??{calories:0,protein:0};
    byDate.set(row.date,{calories:prev.calories+(Number(row.calories)||0),protein:prev.protein+(Number(row.protein)||0)});
  }
  const days=[...byDate.values()];
  if(!days.length)return {avgCalories7d:null,avgProtein7d:null,daysLogged7d:0,planAdherencePct:null};
  const withinTarget=days.filter(d=>d.calories>=targets.calories*0.85&&d.calories<=targets.calories*1.15).length;
  return {
    avgCalories7d:Math.round(avg(days.map(d=>d.calories))!),
    avgProtein7d:Math.round(avg(days.map(d=>d.protein))!),
    daysLogged7d:days.length,
    planAdherencePct:Math.round((withinTarget/days.length)*100),
  };
}
