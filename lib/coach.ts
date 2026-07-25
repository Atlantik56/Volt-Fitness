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
  planKind:CoachPlanKind|null;
  isRestDay:boolean;
  workoutDone:boolean;
  lastWorkoutPain:number|null;
  lastWorkoutEffort:string;
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
  decision:CoachDecision|null;
  advice:CoachAdvice[];
};

export type CoachAction="proceed"|"reduce"|"replace"|"rest"|"complete";
export type CoachPlanKind="strength"|"cardio"|"recovery"|"rest";
export type CoachDecision={
  action:CoachAction;
  priority:number;
  reasonCode:string;
  title:string;
  explanation:string;
  suggestedLoad:{
    title:string;
    type:CoachPlanKind;
    details:string;
  };
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

const normalizeText=(value:unknown)=>String(value??"")
  .trim().toLocaleLowerCase("ru-RU")
  .replace(/ё/g,"е")
  .replace(/[^\p{L}\p{N}]+/gu," ")
  .trim();

// Внутренняя модель Coach. Она намеренно не переиспользует ActivityKind:
// восстановление и отдых не должны по умолчанию становиться силовой.
export function normalizeCoachPlanKind(type:unknown,title:unknown=""):CoachPlanKind{
  const normalizedType=normalizeText(type);
  const normalizedTitle=normalizeText(title);
  if(normalizedType==="отдых"||/\bотдых\b/.test(normalizedTitle))return "rest";
  if(normalizedType==="восстановление"||/восстанов|мобильност|прогулк/.test(normalizedTitle))return "recovery";
  if(normalizedType==="кардио"||normalizedType==="плавание"||/плаван|бассейн/.test(normalizedTitle))return "cardio";
  return "strength";
}

const samePlannedWorkout=(workout:any,plan:{title:string;type:string},date:string)=>
  workout?.date===date
  &&normalizeText(workout?.title)===normalizeText(plan.title)
  &&normalizeCoachPlanKind(workout?.type,workout?.title)===normalizeCoachPlanKind(plan.type,plan.title);

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
  const planKind=plan?normalizeCoachPlanKind(plan.type,plan.title):null;
  const workoutDone=plan?workouts.some(x=>samePlannedWorkout(x,plan,date)):false;

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
    planKind,
    isRestDay:planKind==="rest",
    workoutDone,
    lastWorkoutPain:previousWorkout?numberOrNull(previousWorkout.painAfter):null,
    lastWorkoutEffort:typeof previousWorkout?.effort==="string"?previousWorkout.effort:"",
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

const DECISION_PRIORITY:Record<CoachAction,number>={
  rest:0,
  replace:1,
  reduce:2,
  proceed:3,
  complete:4,
};

const proposed=(title:string,type:CoachPlanKind,details:string)=>({title,type,details});

export function decideCoach(summary:CoachSummary):CoachDecision|null{
  const plan=summary.plan;
  const kind=summary.planKind;
  if(!plan||!kind)return null;

  if(summary.workoutDone)return {
    action:"complete",priority:DECISION_PRIORITY.complete,reasonCode:"planned-workout-completed",
    title:"План на сегодня выполнен",
    explanation:"Запись совпадает с сегодняшним планом по названию и типу. Повторять тренировку не нужно.",
    suggestedLoad:proposed(plan.title,kind,"Тренировка уже завершена; дополнительная нагрузка не предлагается."),
  };

  if(summary.pain!==null&&summary.pain>=7)return {
    action:"rest",priority:DECISION_PRIORITY.rest,reasonCode:"pain-seven-or-higher",
    title:"Сегодня отдых без тренировочной нагрузки",
    explanation:`Боль ${summary.pain}/10 имеет высший приоритет над планом.`,
    suggestedLoad:proposed("Отдых", "rest","Сон и обычная повседневная активность; тренировочную нагрузку сегодня не добавлять."),
  };

  if(summary.pain!==null&&summary.pain>=5){
    if(kind==="rest")return {
      action:"rest",priority:DECISION_PRIORITY.rest,reasonCode:"pain-five-six-rest-plan",
      title:"Сохрани запланированный отдых",
      explanation:`Боль ${summary.pain}/10: нагрузку добавлять нельзя.`,
      suggestedLoad:proposed(plan.title,"rest","Оставь исходный день отдыха без дополнительной активности."),
    };
    if(kind==="strength")return {
      action:"replace",priority:DECISION_PRIORITY.replace,reasonCode:"pain-five-six-strength",
      title:"Замени силовую на существующее восстановление",
      explanation:`Боль ${summary.pain}/10 исключает силовую тренировку.`,
      suggestedLoad:proposed("Прогулка и мобильность","recovery","Только спокойная прогулка и безболезненная мобильность из восстановительного плана."),
    };
    return {
      action:"reduce",priority:DECISION_PRIORITY.reduce,reasonCode:`pain-five-six-${kind}`,
      title:kind==="cardio"?"Сократи кардио до восстановительного темпа":"Сократи восстановительную сессию",
      explanation:`Боль ${summary.pain}/10: допустим только более лёгкий вариант исходного плана.`,
      suggestedLoad:proposed(plan.title,kind,kind==="cardio"
        ?"Сократи продолжительность примерно вдвое, держи спокойный разговорный темп и остановись при боли."
        :"Сократи продолжительность примерно вдвое и оставь только безболезненные движения."),
    };
  }

  const lowEnergy=summary.energy!==null&&summary.energy<=2;
  const shortSleep=summary.sleepHours!==null&&summary.sleepHours<6;
  const previousPainHigh=summary.lastWorkoutPain!==null&&summary.lastWorkoutPain>=5;
  const previousEffortPain=/боль/i.test(summary.lastWorkoutEffort);
  if(lowEnergy||shortSleep||previousPainHigh||previousEffortPain){
    if(kind==="strength"&&(previousPainHigh||previousEffortPain))return {
      action:"replace",priority:DECISION_PRIORITY.replace,reasonCode:"low-readiness-strength-recovery",
      title:"Замени силовую на восстановление",
      explanation:"После предыдущей нагрузки была выраженная боль; сегодня силовую не продолжаем.",
      suggestedLoad:proposed("Прогулка и мобильность","recovery","Используй только спокойную прогулку и безболезненную мобильность из существующего плана."),
    };
    if(kind==="rest")return {
      action:"proceed",priority:DECISION_PRIORITY.proceed,reasonCode:"low-readiness-rest-plan",
      title:"Выполни текущий план отдыха",
      explanation:"Низкая готовность подтверждает день отдыха; дополнительная активность не нужна.",
      suggestedLoad:proposed(plan.title,"rest","Сохрани исходный план отдыха без добавления нагрузки."),
    };
    return {
      action:"reduce",priority:DECISION_PRIORITY.reduce,reasonCode:"low-readiness-reduce",
      title:"Выполни облегчённый вариант",
      explanation:"Низкая готовность по доступным данным требует уменьшить, а не наращивать нагрузку.",
      suggestedLoad:proposed(plan.title,kind,"Убери один круг или сократи длительность примерно на треть; сохрани прежнюю интенсивность или ниже и увеличь отдых."),
    };
  }

  const mediumEnergy=summary.energy===3;
  const mediumSleep=summary.sleepHours!==null&&summary.sleepHours>=6&&summary.sleepHours<7;
  const previousPain=summary.lastWorkoutPain!==null&&summary.lastWorkoutPain>=3;
  const hardEffort=/тяжело/i.test(summary.lastWorkoutEffort);
  if((mediumEnergy&&mediumSleep)||previousPain||hardEffort)return {
    action:"reduce",priority:DECISION_PRIORITY.reduce,reasonCode:"medium-readiness-reduce",
    title:"Сохрани план, но снизь объём",
    explanation:"Готовность средняя или предыдущая нагрузка далась тяжело; прогрессия сегодня не нужна.",
    suggestedLoad:proposed(plan.title,kind,kind==="rest"
      ?"Сохрани исходный отдых без добавления нагрузки."
      :"Убери один круг или сократи длительность примерно на четверть; веса и темп не повышай."),
  };

  return {
    action:"proceed",priority:DECISION_PRIORITY.proceed,reasonCode:"readiness-good",
    title:kind==="rest"?"Следуй плану отдыха":"Выполни текущий план",
    explanation:"Доступные показатели не требуют менять сегодняшний план.",
    suggestedLoad:proposed(plan.title,kind,"Выполни исходный план без увеличения объёма, веса, темпа или интенсивности."),
  };
}

const decisionAdvice=(decision:CoachDecision):CoachAdvice=>({
  // Сохраняем Sprint 3 id для обычного выполнения плана.
  id:decision.action==="proceed"?"workout-todo":`decision-${decision.action}`,
  category:"training",
  priority:decision.priority+0.01,
  tone:decision.action==="rest"?"stop":decision.action==="reduce"||decision.action==="replace"?"warn":"good",
  title:decision.title,
  reason:`${decision.explanation} ${decision.suggestedLoad.details}`,
});

export function resolveCoachAdvice(summary:CoachSummary,candidates:CoachAdvice[],decision:CoachDecision|null):CoachAdvice[]{
  let advice=decision?[decisionAdvice(decision),...candidates]:candidates;
  if(decision)advice=advice.filter((x,index)=>x.id!=="workout-todo"||index===0);

  // Итоговое решение — источник истины для всех нагрузочных советов.
  if(decision?.action==="rest")advice=advice.filter(x=>!LOAD_ADVICE_IDS.has(x.id)&&x.id!=="energy-low"&&x.id!=="sleep-short");
  if(decision?.action==="replace")advice=advice.filter(x=>!LOAD_ADVICE_IDS.has(x.id));
  if(decision?.action==="complete")advice=advice.filter(x=>x.id!=="workout-todo"&&x.id!=="energy-low"&&x.id!=="sleep-short");
  if(decision?.action==="reduce")advice=advice.filter(x=>x.id!=="workout-todo");

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
  if(input.ready===false)return {summary,decision:null,advice:[]};
  const decision=decideCoach(summary);
  const candidates=RULES.map(rule=>rule(summary)).filter((x):x is CoachAdvice=>x!==null);
  return {summary,decision,advice:resolveCoachAdvice(summary,candidates,decision)};
}
