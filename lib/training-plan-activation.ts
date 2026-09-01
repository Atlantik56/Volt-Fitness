import { db } from "@/lib/db";

export type TrainingPlanActivation = {
  startedAt: string;
  alreadyStarted: boolean;
  cycleId: number;
};

export type TrainingPlanRestart = {
  ok: true;
  startedAt: string;
  cycleId: number;
  clearedWeekChanges: number;
  clearedScheduleOverrides: number;
  cancelledPlannedDrafts: number;
} | {
  ok: false;
  status: 404 | 409;
  error: string;
};

type PlanCycleRow = { id: number; startedAt: string; restartedFromCycleId: number | null };
const PROGRAM_ID = "volt-training";
const PROGRAM_VERSION = 3;

export function moscowIsoDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function getTrainingPlanV3StartedAt(): string | null {
  const row = db.prepare("SELECT training_plan_v3_started_at startedAt FROM profile WHERE id=1").get() as { startedAt?: string | null } | undefined;
  return row?.startedAt ?? null;
}

export function getActiveTrainingPlanV3Cycle(): PlanCycleRow | null {
  return (db.prepare(`SELECT id,started_at startedAt,restarted_from_cycle_id restartedFromCycleId
    FROM training_plan_cycles WHERE program_id=? AND program_version=? AND ended_at IS NULL
    ORDER BY id DESC LIMIT 1`).get(PROGRAM_ID,PROGRAM_VERSION) as PlanCycleRow|undefined) ?? null;
}

const previousIsoDate=(iso:string)=>{
  const date=new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate()-1);
  return date.toISOString().slice(0,10);
};

export function startTrainingPlanV3(now = new Date()): TrainingPlanActivation | null {
  const startedAt = moscowIsoDate(now);
  return db.transaction(()=>{
    const existing=getTrainingPlanV3StartedAt();
    if(existing){
      const cycle=getActiveTrainingPlanV3Cycle();
      return cycle?{startedAt:existing,alreadyStarted:true,cycleId:cycle.id}:null;
    }
    const changed=db.prepare("UPDATE profile SET training_plan_v3_started_at=? WHERE id=1 AND training_plan_v3_started_at IS NULL").run(startedAt).changes;
    if(changed!==1)return null;
    const cycleId=Number(db.prepare(`INSERT INTO training_plan_cycles(program_id,program_version,started_at)
      VALUES(?,?,?)`).run(PROGRAM_ID,PROGRAM_VERSION,startedAt).lastInsertRowid);
    return {startedAt,alreadyStarted:false,cycleId};
  })();
}

export function restartTrainingPlanV3(expectedStartedAt:string,now=new Date()):TrainingPlanRestart{
  const startedAt=moscowIsoDate(now);
  const restart=db.transaction(():TrainingPlanRestart=>{
    const active=getActiveTrainingPlanV3Cycle();
    const current=getTrainingPlanV3StartedAt();
    if(!active||!current)return {ok:false,status:404,error:"Активный план не найден"};
    if(current!==expectedStartedAt)return {ok:false,status:409,error:"План уже изменён. Обновите страницу и повторите."};
    if(current===startedAt)return {ok:false,status:409,error:"Этот цикл уже начинается сегодня"};
    const open=db.prepare("SELECT status FROM workout_drafts WHERE status IN ('active','awaiting_confirmation') ORDER BY id DESC LIMIT 1").get() as {status:string}|undefined;
    if(open)return {ok:false,status:409,error:open.status==="awaiting_confirmation"?"Сначала подтвердите или отмените завершённую тренировку":"Сначала завершите или отмените активную тренировку"};

    const ended=db.prepare(`UPDATE training_plan_cycles SET ended_at=? WHERE id=? AND ended_at IS NULL`).run(previousIsoDate(startedAt),active.id).changes;
    if(ended!==1)return {ok:false,status:409,error:"План уже изменён. Обновите страницу и повторите."};
    const cycleId=Number(db.prepare(`INSERT INTO training_plan_cycles(program_id,program_version,started_at,restarted_from_cycle_id)
      VALUES(?,?,?,?)`).run(PROGRAM_ID,PROGRAM_VERSION,startedAt,active.id).lastInsertRowid);
    db.prepare("UPDATE profile SET training_plan_v3_started_at=? WHERE id=1").run(startedAt);
    const clearedWeekChanges=db.prepare("DELETE FROM week_schedule_changes WHERE date>=?").run(startedAt).changes;
    const clearedScheduleOverrides=db.prepare("DELETE FROM schedule_overrides WHERE original_date>=? OR scheduled_date>=?").run(startedAt,startedAt).changes;
    const cancelledPlannedDrafts=db.prepare(`UPDATE workout_drafts SET status='cancelled',cancelled_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
      WHERE status='planned' AND date>=?
        AND json_extract(snapshot,'$.programIdentity.programId')=?
        AND json_extract(snapshot,'$.programIdentity.programVersion')=?`).run(startedAt,PROGRAM_ID,PROGRAM_VERSION).changes;
    return {ok:true,startedAt,cycleId,clearedWeekChanges,clearedScheduleOverrides,cancelledPlannedDrafts};
  });
  return restart();
}
