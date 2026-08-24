import type { HomeWeekDay } from "./week-schedule-model";
import { resolveTrainingWeek, programWeekForDate, trainingProgramRegistry } from "@/lib/training-program/registry";
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

export function currentProgramWeek(programStart?:string):number{
 const now=new Date(),dateIso=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
 return programWeekForDate(programStart,dateIso);
}

function sessionToHomeDay(session:TrainingSessionDefinition,programWeek:number):HomeWeekDay{
 const {program,week}=resolveTrainingWeek(programWeek);
 const workout=session.workoutRef.kind==="catalog"?getTrainingWorkout(session.workoutRef.workoutId):getTrainingWorkout("swim-foundation");
 return {
  id:session.id,day:session.day,d:DAY_LABELS[session.day],type:workout.type,title:session.title,time:durationLabel(session.estimatedDuration),rounds:workout.rounds,image:workout.image,
  exercises:mutableExercises(workout.exercises),warmup:workout.warmup?mutableExercises(workout.warmup):undefined,
  optional:!session.required&&session.discipline==="bike",availability:workout.availability,
  discipline:session.discipline,role:session.role,required:session.required,workoutRef:session.workoutRef,
  programIdentity:trainingProgramRegistry.identityFor(program,week,session),
 };
}

export function buildProgramWeek(programWeek:number):HomeWeekDay[]{
 const {week}=resolveTrainingWeek(programWeek);
 return Array.from({length:7},(_,offset)=>{
  const day=offset+1,sessions=week.sessions.filter(session=>session.day===day).map(session=>sessionToHomeDay(session,programWeek));
  if(!sessions.length)throw new Error(`Training program week ${programWeek} has no session for day ${day}`);
  const [primary]=sessions;
  return sessions.length>1?{...primary,sessions}:primary;
 });
}

export function buildPlanV2Week(programWeek=4):HomeWeekDay[]{return buildProgramWeek(Math.max(4,programWeek))}
export function buildHomeWeek(programStart?:string):HomeWeekDay[]{return buildProgramWeek(currentProgramWeek(programStart))}

// Совместимый плоский каталог для старых импортёров строится из canonical
// registry. UI больше не содержит собственной копии недельного расписания.
export const week=buildPlanV2Week(4).flatMap((day)=>(day.sessions??[day]).map((session)=>({d:day.d,t:session.type,n:session.title,time:session.time,x:session.exercises,optional:session.optional===true})));
export const phases=[
{startWeek:1,endWeek:3,p:"Недели 1–3",n:"Дом: гантели + прогулки",g:"Привычка и подготовка к залу",x:["Пн / Ср / Пт — 10 упражнений, ~30–35 минут","Неделя 1 — 2 круга; неделя 2 — 3; неделя 3 — +вес или повторы","Вт / Чт — ходьба или велосипед в 1-ю неделю, затем бассейн ~30 минут; Сб — ходьба или велосипед 30–60 минут","Питание по плану с первого дня"]},
{startWeek:4,endWeek:14,p:"Недели 4–14",n:"План 2.0: зал + плавание + велосипед",g:"Сила верха и плавный рост аэробной выносливости",x:["Пн — силовая тренировка А + техника плавания","Ср / Пт — аэробное плавание / выносливость; Чт — силовая тренировка Б","Вт — велотренировка в зоне 2 опционально, 25–35 минут","Сб / Вс — восстановление"]},
{startWeek:15,endWeek:36,p:"Месяц 4+",n:"План 2.0: устойчивый ритм",g:"Дойти до цели и закрепить образ жизни",x:["2 силовых без тяжёлой нагрузки на ноги","3 плавательных тренировки в неделю","Велотренировка в зоне 2 с постепенным ростом длительности","После 75 кг: темп 0,5–0,7 кг/нед и +200 ккал"]}];
export const meals=[
["Завтрак","Омлет из 3 яиц с овощами + хлеб. Замена: 250 г творога 5% с ягодами","~400 ккал · 25 г белка"],["Обед","Курица/индейка 180 г + гречка/рис 150 г + овощной салат","~500 ккал · 45 г белка"],["Полдник","Творог 200–250 г, или греческий йогурт + орехи, или протеин + фрукт","~300 ккал · 40 г белка"],["Ужин","Рыба/курица 200 г + овощи; крупа вечером не нужна","~400 ккал · 40 г белка"],["Буфер","Молоко в кофе, фрукт, сыр или небольшое сладкое","~100–150 ккал"]];
export const rules=["Минимальная версия: 1 круг дома или 10 минут прогулки","Сравнивай себя только с собой месяц назад","Пропуск — данные, не провал; возвращайся легко","Отмечай силу, выносливость, одежду и настроение","Зал, бассейн и велосипед — ещё и люди","Фиксируй тренировки и проговаривай процесс"];
export const safety="Любая боль в тазобедренном суставе — упражнение сразу убрать. Исключены прыжки, бег, приседания и выпады с весом; в бассейне — брасс. При повторяющейся боли — к ортопеду или спортивному врачу.";
