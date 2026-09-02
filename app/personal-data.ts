import { datesOfWeek, isoWeekdayOf, weekRangeContaining, type HomeWeekDay } from "./week-schedule-model.ts";
import { activatedPlanPosition, resolveTrainingVersionWeek, resolveTrainingWeek, programWeekForDate, trainingProgramRegistry } from "@/lib/training-program/registry";
import { LEGACY_PROGRAM_VERSION, PLAN_V2_PROGRAM_VERSION, PLAN_V3_PROGRAM_VERSION, VOLT_PROGRAM_ID } from "@/lib/training-program/definitions";
import { getTrainingWorkout, LEGACY_HOME_EXERCISES, LEGACY_HOME_WARMUP } from "@/lib/training-program/workout-catalog";
import type { TrainingDuration, TrainingExerciseDefinition, TrainingSessionDefinition } from "@/lib/training-program/types";

const DAY_LABELS = ["", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"] as const;
type MutableTrainingExercise = [string, string, string, string?];
const mutableExercises = (items: readonly TrainingExerciseDefinition[]): MutableTrainingExercise[] =>
 items.map((item) => item[3] ? [item[0], item[1], item[2], item[3]] : [item[0], item[1], item[2]]);
const durationLabel = (value: TrainingDuration | null): string => {
 if (!value) return "—";
 return value.minMinutes === value.maxMinutes ? `~${value.minMinutes} мин` : `~${value.minMinutes}–${value.maxMinutes} мин`;
};

export const home = mutableExercises(LEGACY_HOME_EXERCISES);
export const homeWarmup = mutableExercises(LEGACY_HOME_WARMUP);

export function currentProgramWeek(programStart?:string,trainingPlanV3StartedAt?:string|null):number{
 const now=new Date(),dateIso=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
 const activated=activatedPlanPosition(trainingPlanV3StartedAt,dateIso);
 if(activated)return activated.weekIndex;
 return programWeekForDate(programStart,dateIso);
}

function sessionToHomeDay(session:TrainingSessionDefinition,resolved:ReturnType<typeof resolveTrainingWeek>,cycleId?:number|null):HomeWeekDay{
 const {program,week}=resolved;
 const workout=session.workoutRef.kind==="catalog"
  ?getTrainingWorkout(session.workoutRef.workoutId)
  :getTrainingWorkout(session.workoutRef.programId==="endurance"?"swim-endurance":"swim-foundation");
 return {
  id:session.id,day:session.day,d:DAY_LABELS[session.day],type:workout.type,title:session.title,time:durationLabel(session.estimatedDuration),rounds:workout.rounds,image:workout.image,
  exercises:mutableExercises(workout.exercises),warmup:workout.warmup?mutableExercises(workout.warmup):undefined,
  // Гибким слот делает !required, а не дисциплина: в Плане 4.0 необязательное
  // плавание — такой же гибкий слот, каким в 3.0 было вело. Дни отдыха при
  // этом «опциональными» не считаются.
  optional:!session.required&&session.discipline!=="recovery",availability:workout.availability,
  alternatives:session.alternatives?.map(alternative=>{
   const alternativeWorkout=alternative.workoutRef.kind==="catalog"
    ?getTrainingWorkout(alternative.workoutRef.workoutId)
    :getTrainingWorkout(alternative.workoutRef.programId==="endurance"?"swim-endurance":"swim-foundation");
   return {
    id:alternative.id,discipline:alternative.discipline,role:alternative.role,title:alternative.title,
    time:durationLabel(alternative.estimatedDuration),type:alternativeWorkout.type,rounds:alternativeWorkout.rounds,
    image:alternativeWorkout.image,exercises:mutableExercises(alternativeWorkout.exercises),
    warmup:alternativeWorkout.warmup?mutableExercises(alternativeWorkout.warmup):undefined,
    workoutRef:alternative.workoutRef,
   };
  }),
  discipline:session.discipline,role:session.role,required:session.required,workoutRef:session.workoutRef,
  programIdentity:{...trainingProgramRegistry.identityFor(program,week,session),...(cycleId?{cycleId}:{})},
 };
}

export function buildProgramWeek(programWeek:number):HomeWeekDay[]{
 return buildResolvedWeek(resolveTrainingWeek(programWeek));
}

function buildResolvedWeek(resolved:ReturnType<typeof resolveTrainingWeek>,cycleId?:number|null):HomeWeekDay[]{
 const {week}=resolved;
 return Array.from({length:7},(_,offset)=>{
  const day=offset+1,sessions=week.sessions.filter(session=>session.day===day).map(session=>sessionToHomeDay(session,resolved,cycleId));
  if(!sessions.length)throw new Error(`Training program week ${week.index} has no session for day ${day}`);
  const [primary]=sessions;
  return sessions.length>1?{...primary,sessions}:primary;
 });
}

function remapDayToCalendar(day:HomeWeekDay,calendarWeekday:number):HomeWeekDay{
 const remapSession=(session:any)=>({...session,day:calendarWeekday,d:DAY_LABELS[calendarWeekday]});
 return {...day,day:calendarWeekday,d:DAY_LABELS[calendarWeekday],sessions:day.sessions?.map(remapSession)};
}

export function buildProgramDayForDate(programStart:string|undefined,trainingPlanV3StartedAt:string|null|undefined,dateIso:string,trainingPlanV3CycleId?:number|null):HomeWeekDay{
 const calendarWeekday=isoWeekdayOf(dateIso),activated=activatedPlanPosition(trainingPlanV3StartedAt,dateIso);
 if(activated){
  const resolved=resolveTrainingVersionWeek(VOLT_PROGRAM_ID,PLAN_V3_PROGRAM_VERSION,activated.definitionWeekIndex);
  return remapDayToCalendar(buildResolvedWeek(resolved,trainingPlanV3CycleId)[activated.dayIndex-1],calendarWeekday);
 }
 const legacyWeek=programWeekForDate(programStart,dateIso),version=legacyWeek<=3?LEGACY_PROGRAM_VERSION:PLAN_V2_PROGRAM_VERSION;
 const resolved=resolveTrainingVersionWeek(VOLT_PROGRAM_ID,version,legacyWeek);
 return remapDayToCalendar(buildResolvedWeek(resolved)[calendarWeekday-1],calendarWeekday);
}

export function buildPlanV2Week(programWeek=4):HomeWeekDay[]{return buildProgramWeek(Math.max(4,programWeek))}
export function buildPlanV3Week(programWeek=9):HomeWeekDay[]{return buildProgramWeek(Math.max(9,programWeek))}
export function buildHomeWeek(programStart?:string,trainingPlanV3StartedAt?:string|null,anchorDateIso?:string,trainingPlanV3CycleId?:number|null):HomeWeekDay[]{
 const now=new Date(),today=anchorDateIso??`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
 return datesOfWeek(weekRangeContaining(today).mondayIso).map(date=>buildProgramDayForDate(programStart,trainingPlanV3StartedAt,date,trainingPlanV3CycleId));
}

const flattenProgramWeek=(days:HomeWeekDay[])=>days.flatMap((day)=>(day.sessions??[day]).map((session)=>({d:day.d,t:session.type,n:session.title,time:session.time,x:session.exercises,optional:session.optional===true})));

// Week остаётся совместимым каталогом для карточек и ручного добавления:
// в нём должны жить как уже начатый Plan v2, так и новый Plan v3.
export const planV2WeekCatalog=flattenProgramWeek(buildPlanV2Week(4));
export const planV3WeekCatalog=flattenProgramWeek(buildPlanV3Week(9));
export const week=[...planV2WeekCatalog,...planV3WeekCatalog];
export const phases=[
{startWeek:1,endWeek:3,p:"Недели 1–3",n:"Дом: гантели + прогулки",g:"Привычка и подготовка к залу",x:["Пн / Ср / Пт — 10 упражнений, ~30–35 минут","Неделя 1 — 2 круга; неделя 2 — 3; неделя 3 — +вес или повторы","Вт / Чт — ходьба или велосипед в 1-ю неделю, затем бассейн ~30 минут; Сб — ходьба или велосипед 30–60 минут","Питание по плану с первого дня"]},
{startWeek:4,endWeek:8,p:"Недели 4–8",n:"План 2.0: Foundation",g:"Переход в зал и рост непрерывной дистанции в бассейне",x:["2 силовые на тренажёрах без тяжёлой работы ног","3 плавания: техника, аэробная работа и выносливость","Велотренировка в зоне 2 опционально, 25–35 минут","Неделя 8 — разгрузка и контролируемые 1000 м"]},
{startWeek:9,endWeek:16,p:"Недели 9–16",n:"План 3.0: зал + плавание + велосипед",g:"Развивать силу и выносливость без осевой и ударной нагрузки на ТБС",x:["Пн — зал на тренажёрах + техника плавания","Вт — спокойная велотренировка в зоне 2; Ср — аэробное плавание","Чт — зал на тренажёрах; Пт — плавание на выносливость","Сб / Вс — полное восстановление"]},
{startWeek:17,endWeek:36,p:"После недели 16",n:"План 3.0: устойчивый ритм",g:"Сохранять регулярность и прогрессировать без обострения ТБС",x:["2 силовые на блочных и рычажных тренажёрах","3 плавания кролем и на спине","Велотренировка в зоне 2: сначала растёт время, затем сопротивление","При боли нагрузка не увеличивается"]}];
export const meals=[
["Завтрак","Омлет из 3 яиц с овощами + хлеб. Замена: 250 г творога 5% с ягодами","~400 ккал · 25 г белка"],["Обед","Курица/индейка 180 г + гречка/рис 150 г + овощной салат","~500 ккал · 45 г белка"],["Полдник","Творог 200–250 г, или греческий йогурт + орехи, или протеин + фрукт","~300 ккал · 40 г белка"],["Ужин","Рыба/курица 200 г + овощи; крупа вечером не нужна","~400 ккал · 40 г белка"],["Буфер","Молоко в кофе, фрукт, сыр или небольшое сладкое","~100–150 ккал"]];
export const rules=["Щадящая версия — уменьшить вес, амплитуду или число подходов, а не тренироваться через боль","Сравнивай себя только с собой месяц назад","Пропуск — данные, не провал; возвращайся легко","Вес увеличивается только после уверенного верхнего диапазона повторов без боли","В велосипеде сначала растёт время, затем сопротивление","Фиксируй тренировку и самочувствие после неё"];
export const safety="Любая суставная боль в ТБС — упражнение сразу прекратить. Исключены прыжки, бег, приседания и выпады с весом, тяжёлые жимы ногами и осевая нагрузка; на велосипеде — тяжёлые передачи и педалирование стоя; в бассейне — брасс, баттерфляй и агрессивная работа ног. При повторяющейся боли — к ортопеду или спортивному врачу.";
