// VOLT Coach — локальный детерминированный тренер.
// Чистые функции: без React, без обращений к API, без побочных эффектов.
// Никогда не обращается к Gemini: читает только уже сохранённые (подтверждённые) данные.
// Проектное описание: docs/VOLT_COACH_DESIGN.md

export type CoachCategory="safety"|"escalation"|"recovery"|"training"|"load"|"nutrition"|"activity"|"support";
export type CoachTone="stop"|"warn"|"good"|"info";

export type CoachTargets={
  calories:number;
  protein:number;
  steps:number;
  activeMinutes:number;
  targetWeight:number|null;
};

export type CoachNutrition={
  logged:boolean;
  meals:number;
  calories:number|null;
  protein:number|null;
  fat:number|null;
  carbs:number|null;
};

export type CoachWeight={
  current:number;
  previous:number|null;
  baseline:number|null;
  deltaSincePrevious:number|null;
  deltaSinceBaseline:number|null;
};

export type CoachSummary={
  date:string;
  sleepHours:number|null;
  energy:number|null;
  pain:number|null;
  painArea:string;
  recentPainDays:number;
  hasWellness:boolean;
  plan:{title:string;type:string}|null;
  isRestDay:boolean;
  workoutDone:boolean;
  lastWorkoutPain:number|null;
  nutrition:CoachNutrition;
  steps:number|null;
  activeMinutes:number|null;
  weight:CoachWeight|null;
  targets:CoachTargets;
};

export type CoachAdvice={
  id:string;
  category:CoachCategory;
  priority:number;
  tone:CoachTone;
  title:string;
  reason:string;
};

export type CoachResult={
  summary:CoachSummary;
  advice:CoachAdvice[];
};

export type CoachInput={
  date:string;
  // false — данные ещё не загружены или загрузка не удалась: советы не строятся.
  ready?:boolean;
  plan?:{title:string;type:string}|null;
  wellnessLogs?:any[];
  activity?:any[];
  foodLogs?:any[];
  workouts?:any[];
  measurements?:any[];
  profile?:any;
};

export const COACH_MAX_ADVICE=3;
export const COACH_TARGETS:CoachTargets={calories:1700,protein:150,steps:10000,activeMinutes:75,targetWeight:null};

const MIN_SAFE_CALORIES=1200;
const LOW_PROTEIN_RATIO=0.7;
const LOW_STEPS_RATIO=0.5;
const SHORT_SLEEP_HOURS=6;
const BASELINE_DAYS=14;
const SEVERE_PAIN=8;
const NOTABLE_PAIN=5;
const PAIN_WINDOW_DAYS=7;
const PERSISTENT_PAIN_DAYS=3;

// Число из произвольного источника; null, если значения нет или оно нечитаемо.
// Пустая строка, null и undefined — это «нет данных», а не ноль.
const numberOrNull=(raw:any):number|null=>{
  if(raw===null||raw===undefined||raw==="")return null;
  const value=Number(raw);
  return Number.isFinite(value)?value:null;
};

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

const round1=(value:number)=>Math.round(value*10)/10;

const daysBetween=(from:string,to:string)=>{
  const a=Date.parse(`${from}T00:00:00Z`),b=Date.parse(`${to}T00:00:00Z`);
  if(!Number.isFinite(a)||!Number.isFinite(b))return null;
  return Math.round((b-a)/86400000);
};

function buildNutrition(foodLogs:any[],date:string):CoachNutrition{
  const todays=foodLogs.filter(x=>x?.date===date);
  // Нет сохранённых записей — это «ещё не записано», а не «съедено 0».
  // Распознавание Gemini, не подтверждённое пользователем, сюда не попадает по построению.
  if(!todays.length)return {logged:false,meals:0,calories:null,protein:null,fat:null,carbs:null};
  const sum=(key:string)=>todays.reduce((total,row)=>total+(numberOrNull(row?.[key])??0),0);
  return {logged:true,meals:todays.length,calories:sum("calories"),protein:sum("protein"),fat:sum("fat"),carbs:sum("carbs")};
}

function buildWeight(measurements:any[],date:string):CoachWeight|null{
  const points=measurements
    .filter(x=>x&&typeof x.date==="string"&&numberOrNull(x.weight)!==null)
    .map(x=>({date:x.date as string,weight:numberOrNull(x.weight) as number}))
    .filter(x=>x.date<=date)
    .sort((a,b)=>b.date.localeCompare(a.date));
  if(!points.length)return null;
  const current=points[0];
  const previous=points[1]??null;
  const baseline=points.find(point=>{
    const gap=daysBetween(point.date,current.date);
    return gap!==null&&gap>=BASELINE_DAYS;
  })??null;
  return {
    current:current.weight,
    previous:previous?previous.weight:null,
    baseline:baseline?baseline.weight:null,
    deltaSincePrevious:previous?round1(current.weight-previous.weight):null,
    deltaSinceBaseline:baseline?round1(current.weight-baseline.weight):null,
  };
}

export function buildCoachSummary(input:CoachInput):CoachSummary{
  const date=input.date;
  const wellnessLogs=input.wellnessLogs??[];
  const activity=input.activity??[];
  const foodLogs=input.foodLogs??[];
  const workouts=input.workouts??[];
  const measurements=input.measurements??[];

  const wellness=wellnessLogs.find(x=>x?.date===date)??null;
  const today=activity.find(x=>x?.date===date)??null;

  const rawEnergy=wellness?numberOrNull(wellness.energy):null;
  const rawPain=wellness?numberOrNull(wellness.pain):null;
  // Форма активности сохраняет все поля разом, поэтому незаполненный сон приходит нулём.
  // Ноль здесь означает «не заполнено», как и в lib/readiness.ts.
  const rawSleep=today?numberOrNull(today.sleepHours):null;

  const previousWorkout=workouts
    .filter(x=>x&&typeof x.date==="string"&&x.date<date)
    .sort((a,b)=>String(b.date).localeCompare(String(a.date)))[0]??null;

  const plan=input.plan??null;

  // Устойчивая боль: сколько дней за последнюю неделю боль достигала заметного уровня.
  const recentPainDays=wellnessLogs.filter(row=>{
    if(!row||typeof row.date!=="string")return false;
    const gap=daysBetween(row.date,date);
    if(gap===null||gap<0||gap>=PAIN_WINDOW_DAYS)return false;
    return (numberOrNull(row.pain)??0)>=NOTABLE_PAIN;
  }).length;

  return {
    date,
    sleepHours:rawSleep!==null&&rawSleep>0?clamp(rawSleep,0,24):null,
    energy:rawEnergy!==null?clamp(rawEnergy,1,5):null,
    pain:rawPain!==null?clamp(rawPain,0,10):null,
    painArea:typeof wellness?.painArea==="string"?wellness.painArea.trim():"",
    recentPainDays,
    hasWellness:Boolean(wellness),
    plan,
    isRestDay:plan?plan.type==="Отдых":false,
    workoutDone:workouts.some(x=>x?.date===date),
    lastWorkoutPain:previousWorkout?numberOrNull(previousWorkout.painAfter):null,
    nutrition:buildNutrition(foodLogs,date),
    steps:today?numberOrNull(today.steps)??0:null,
    activeMinutes:today?numberOrNull(today.activeMinutes)??0:null,
    weight:buildWeight(measurements,date),
    targets:{...COACH_TARGETS,targetWeight:numberOrNull(input.profile?.targetWeight)},
  };
}

// Правила. Каждое — чистая функция сводки, возвращает совет или null.
// Приоритеты уникальны: целая часть — уровень P0–P5, дробная задаёт явный порядок
// внутри уровня. Порядок объявления ни на что не влияет.
const RULES:((s:CoachSummary)=>CoachAdvice|null)[]=[
  // P0 — боль и безопасность
  s=>s.pain!==null&&s.pain>=NOTABLE_PAIN?{
    id:"pain-high",category:"safety",priority:0,tone:"stop",
    title:s.painArea?`Сегодня без силовой нагрузки — щади ${s.painArea.toLowerCase()}`:"Сегодня без силовой нагрузки",
    reason:`Боль ${s.pain}/10. Замени тренировку на спокойную прогулку и безболезненную мобильность.`,
  }:null,
  // Эскалация вынесена в отдельную категорию: она дополняет pain-high, а не дублирует его,
  // поэтому не должна вытесняться им при дедупликации.
  s=>(s.pain!==null&&s.pain>=SEVERE_PAIN)||s.recentPainDays>=PERSISTENT_PAIN_DAYS?{
    id:"pain-persistent",category:"escalation",priority:0.5,tone:"stop",
    title:"Покажись врачу с этой болью",
    reason:s.recentPainDays>=PERSISTENT_PAIN_DAYS
      ?`Боль держится ${s.recentPainDays} дн. за неделю. Повторяющаяся боль — повод для очной консультации, а не для терпения.`
      :`Боль ${s.pain}/10 — это много. Если она повторяется день за днём, это повод для очной консультации.`,
  }:null,

  // P1 — восстановление
  s=>s.sleepHours!==null&&s.sleepHours<SHORT_SLEEP_HOURS?{
    id:"sleep-short",category:"recovery",priority:1,tone:"warn",
    title:"Снизь объём и ложись раньше",
    reason:`Сон ${round1(s.sleepHours)} ч — меньше ${SHORT_SLEEP_HOURS}. На недосыпе техника падает быстрее, чем силы.`,
  }:null,
  s=>s.energy!==null&&s.energy<=2?{
    id:"energy-low",category:"recovery",priority:1.1,tone:"warn",
    title:"Сделай облегчённую версию сессии",
    reason:`Энергия ${s.energy}/5. Убери один круг и добавь отдыха между подходами — это лучше пропуска.`,
  }:null,

  // P2 — тренировка
  s=>s.plan&&!s.isRestDay&&!s.workoutDone?{
    id:"workout-todo",category:"training",priority:2,tone:"good",
    title:`Выполни тренировку: ${s.plan.title}`,
    reason:"Сессия на сегодня ещё не отмечена. Начни с разминки — дальше проще.",
  }:null,
  s=>s.lastWorkoutPain!==null&&s.lastWorkoutPain>=3?{
    id:"workout-no-progression",category:"load",priority:2.5,tone:"warn",
    title:"Не повышай рабочие веса",
    reason:`После прошлой тренировки боль ${s.lastWorkoutPain}/10. Сохрани нагрузку или выбери безопасную замену.`,
  }:null,
  s=>s.isRestDay?{
    id:"rest-day",category:"training",priority:2.1,tone:"info",
    title:"Сегодня восстановление, а не нагрузка",
    reason:"По плану день отдыха. Прогулка и сон дадут больше, чем внеплановая тренировка.",
  }:null,

  // P3 — питание (только подтверждённые записи)
  s=>!s.nutrition.logged?{
    id:"food-unlogged",category:"nutrition",priority:3,tone:"info",
    title:"Запиши приёмы пищи за сегодня",
    reason:"Записей пока нет — без них не видно ни калорий, ни белка. Это не значит, что ты не ел.",
  }:null,
  s=>s.nutrition.logged&&s.nutrition.calories!==null&&s.nutrition.calories<MIN_SAFE_CALORIES?{
    id:"calories-too-low",category:"nutrition",priority:3.1,tone:"warn",
    title:"Добавь еды — калорий слишком мало",
    reason:`Записано ${Math.round(s.nutrition.calories)} ккал при цели ${s.targets.calories}. Слишком глубокий дефицит съедает мышцы и силы.`,
  }:null,
  s=>s.nutrition.logged&&s.nutrition.protein!==null&&s.nutrition.protein<s.targets.protein*LOW_PROTEIN_RATIO?{
    id:"protein-low",category:"nutrition",priority:3.2,tone:"warn",
    title:"Добери белок в следующем приёме",
    reason:`Белка ${Math.round(s.nutrition.protein)} г из ${s.targets.protein}. На дефиците белок держит мышцы.`,
  }:null,

  // P4 — активность
  s=>s.steps!==null&&s.steps<s.targets.steps*LOW_STEPS_RATIO?{
    id:"steps-low",category:"activity",priority:4,tone:"info",
    title:"Добавь прогулку на 20–30 минут",
    reason:`Шагов ${s.steps} из ${s.targets.steps}. Ходьба не грузит суставы и добирает дневной расход.`,
  }:null,

  // P5 — поддержка
  s=>s.weight&&s.weight.deltaSincePrevious!==null&&s.weight.deltaSincePrevious>0
    &&s.weight.deltaSinceBaseline!==null&&s.weight.deltaSinceBaseline<0?{
    id:"weight-fluctuation",category:"support",priority:5,tone:"good",
    title:"Плюс на весах — это не откат",
    reason:`С прошлого замера +${round1(s.weight.deltaSincePrevious)} кг, но за две недели ${round1(s.weight.deltaSinceBaseline)} кг. Вода и гликоген колеблются, тренд важнее одной цифры.`,
  }:null,
  s=>!s.hasWellness?{
    id:"wellness-missing",category:"support",priority:5.1,tone:"info",
    title:"Отметь самочувствие за 30 секунд",
    reason:"Без оценки сна, энергии и боли советы остаются общими.",
  }:null,
  s=>s.workoutDone?{
    id:"keep-going",category:"support",priority:5.2,tone:"good",
    title:"Тренировка закрыта — так и держи",
    reason:"Сегодня главное уже сделано. Добавь воду, белок и спокойный вечер.",
  }:null,
];

// Советы, предполагающие нагрузку: подавляются, когда боль требует щадящего дня.
// workout-no-progression тоже здесь: при боли ≥ 5 тренировки нет вовсе, и совет
// «не повышай веса» противоречил бы отказу от нагрузки.
const LOAD_ADVICE_IDS=new Set(["workout-todo","steps-low","workout-no-progression"]);

export function resolveCoachAdvice(summary:CoachSummary,candidates:CoachAdvice[]):CoachAdvice[]{
  let advice=candidates;

  // 1. Безопасность подавляет нагрузку: боль ≥ 5 исключает тяжёлую тренировку и рост нагрузки.
  if(summary.pain!==null&&summary.pain>=NOTABLE_PAIN)advice=advice.filter(x=>!LOAD_ADVICE_IDS.has(x.id));

  // 2. Выполненная тренировка не предлагается повторно.
  if(summary.workoutDone)advice=advice.filter(x=>x.id!=="workout-todo");

  // 3. Одна категория — один совет (с наивысшим приоритетом).
  const byCategory=new Map<CoachCategory,CoachAdvice>();
  for(const item of advice){
    const chosen=byCategory.get(item.category);
    if(!chosen||item.priority<chosen.priority)byCategory.set(item.category,item);
  }

  // 4. Приоритеты уникальны, поэтому сортировка по ним — полный детерминированный порядок.
  return [...byCategory.values()]
    .sort((a,b)=>a.priority-b.priority)
    .slice(0,COACH_MAX_ADVICE);
}

export function buildCoachResult(input:CoachInput):CoachResult{
  const summary=buildCoachSummary(input);
  // Пока данные не загружены (или загрузка не удалась), Coach молчит:
  // сводка на пустом состоянии неотличима от «ничего не сделано» и дала бы ложные утверждения.
  if(input.ready===false)return {summary,advice:[]};
  const candidates=RULES.map(rule=>rule(summary)).filter((x):x is CoachAdvice=>x!==null);
  return {summary,advice:resolveCoachAdvice(summary,candidates)};
}
