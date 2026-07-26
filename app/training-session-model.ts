export const DEFAULT_EXERCISE_REST_SECONDS=45;
export const WORKOUT_DRAFT_STORAGE_KEY="volt-active-workout";
export const WORKOUT_DRAFT_VERSION=5;
export const WORKOUT_DRAFT_TTL_MS=12*60*60*1000;

export type ExerciseTuple=readonly [name:string,note:string,target:string,image?:string];
export type ActivityKind="strength"|"swim"|"bike"|"recovery";
export type WorkoutPlan={
  type:string;
  title:string;
  rounds?:number;
  warmup?:readonly ExerciseTuple[];
  exercises:readonly ExerciseTuple[];
};
export type ExerciseStep={
  kind:"exercise";
  key:string;
  exercise:ExerciseTuple;
  phase:"warmup"|"work";
  roundIndex:number;
  exerciseIndex:number;
};
export type RestStep={
  kind:"rest";
  key:string;
  durationSeconds:number;
  nextExerciseName:string;
};
export type SessionStep=ExerciseStep|RestStep;
export type WorkoutDraft={
  version:typeof WORKOUT_DRAFT_VERSION;
  title:string;
  cursor:number;
  values:Record<string,string>;
  weights:Record<string,string>;
  difficulties:Record<string,string>;
  substitutions:Record<string,boolean>;
  metrics:Record<string,string>;
  effort:string;
  painAfter:string;
  activeSeconds:number;
  restSecondsSpent:number;
  savedAt:number;
};

export function activityKindOf(plan:Pick<WorkoutPlan,"type"|"title">):ActivityKind {
  if(/отдых|восстановлен/i.test(plan.type))return "recovery";
  if(/плав|бассейн/i.test(plan.title))return "swim";
  if(/велосип/i.test(plan.title))return "bike";
  return "strength";
}

export function exerciseUnit(name:string,target?:string){if(name.toLowerCase().includes("планка"))return "сек";if(target&&/мин/i.test(target))return "мин";return "повт."}
// «По самочувствию» и подобные качественные цели без числа — вводить фактический
// результат нечем и незачем, шаг просто отмечается выполненным.
export function hasNumericTarget(target:string){return /\d/.test(target)}
export function sessionClock(seconds:number){return `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(seconds%60).padStart(2,"0")}`}

export function buildSessionSteps(plan:WorkoutPlan,restSeconds=DEFAULT_EXERCISE_REST_SECONDS):SessionStep[] {
  const rounds=Math.max(1,plan.rounds??1);
  const exercises:ExerciseStep[]=[];
  (plan.warmup??[]).forEach((exercise,exerciseIndex)=>exercises.push({kind:"exercise",key:`warmup-${exerciseIndex}`,exercise,phase:"warmup",roundIndex:-1,exerciseIndex}));
  for(let roundIndex=0;roundIndex<rounds;roundIndex++){
    plan.exercises.forEach((exercise,exerciseIndex)=>exercises.push({kind:"exercise",key:`${roundIndex}-${exerciseIndex}`,exercise,phase:"work",roundIndex,exerciseIndex}));
  }
  if(activityKindOf(plan)!=="strength")return exercises;
  return exercises.flatMap((step,index)=>{
    const next=exercises[index+1];
    if(step.phase==="warmup"||!next)return [step];
    return [step,{kind:"rest",key:`rest-${step.key}`,durationSeconds:restSeconds,nextExerciseName:next.exercise[0]} satisfies RestStep];
  });
}

function recordOfStrings(value:unknown):Record<string,string>{
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter((entry):entry is [string,string]=>typeof entry[1]==="string"));
}
function recordOfBooleans(value:unknown):Record<string,boolean>{
  if(!value||typeof value!=="object"||Array.isArray(value))return {};
  return Object.fromEntries(Object.entries(value).filter((entry):entry is [string,boolean]=>typeof entry[1]==="boolean"));
}
function finiteNumber(value:unknown){const number=Number(value);return Number.isFinite(number)&&number>=0?number:0}

export function parseWorkoutDraft(raw:string|null,title:string,now=Date.now()):WorkoutDraft|null {
  if(!raw)return null;
  try{
    const input=JSON.parse(raw) as Record<string,unknown>;
    if(input.title!==title||now-finiteNumber(input.savedAt)>=WORKOUT_DRAFT_TTL_MS)return null;
    if(input.version!==4&&input.version!==WORKOUT_DRAFT_VERSION)return null;
    return {
      version:WORKOUT_DRAFT_VERSION,title,cursor:finiteNumber(input.cursor),
      values:recordOfStrings(input.values),weights:recordOfStrings(input.weights),
      difficulties:recordOfStrings(input.difficulties),substitutions:recordOfBooleans(input.substitutions),
      metrics:recordOfStrings(input.metrics),effort:typeof input.effort==="string"?input.effort:"Нормально",
      painAfter:typeof input.painAfter==="string"?input.painAfter:"0",
      activeSeconds:finiteNumber(input.activeSeconds),restSecondsSpent:finiteNumber(input.restSecondsSpent),
      savedAt:finiteNumber(input.savedAt),
    };
  }catch{return null}
}

export function readWorkoutDraft(title:string):WorkoutDraft|null {
  if(typeof window==="undefined")return null;
  const raw=localStorage.getItem(WORKOUT_DRAFT_STORAGE_KEY);
  const draft=parseWorkoutDraft(raw,title);
  if(raw&&!draft)localStorage.removeItem(WORKOUT_DRAFT_STORAGE_KEY);
  return draft;
}
