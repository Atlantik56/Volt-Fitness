import { readHealthWellness,mergeHealthMeasurements } from "@/lib/health-connect-wellness";
import { db } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { buildCardInsights } from "@/lib/insights/registry";
import { buildHomeWeek } from "../../../personal-data";
import { COACH_TARGETS } from "@/lib/coach";
import { getTrainingPlanCycles } from "@/lib/training-plan-activation";
import { listWeekScheduleChanges } from "@/lib/week-schedule-service";
import { buildWeekSchedule, sessionsForDay, weekRangeContaining } from "@/app/week-schedule-model";

export const runtime = "nodejs";

const dateOk = (x: any) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

// Только чтение уже посчитанных фактов — никакого ИИ и никаких побочных эффектов.
export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const url = new URL(req.url);
  const date = dateOk(url.searchParams.get("date")) ? (url.searchParams.get("date") as string) : new Date().toISOString().slice(0, 10);

  const profile = db.prepare("SELECT program_start programStart,target_weight targetWeight FROM profile WHERE id=1").get() as any;
  const trainingPlanCycles=getTrainingPlanCycles();
  const healthDays=readHealthWellness(db,"2000-01-01",date);
    const measurements = mergeHealthMeasurements(db.prepare("SELECT date,weight FROM measurements WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[],healthDays).slice(0,60);
  const foodLogs = db.prepare("SELECT date,calories,protein FROM food_logs WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
  const workouts = db
    .prepare(
      "SELECT date,type,title,rounds,duration_seconds durationSeconds,rest_seconds restSeconds,min_heart_rate minHeartRate,avg_heart_rate avgHeartRate,max_heart_rate maxHeartRate,calories,distance_meters distanceMeters,avg_speed avgSpeed,effort,pain_after painAfter FROM workout_logs WHERE date<=? AND COALESCE(external_activity_source,'')!='strava' ORDER BY date DESC,id DESC LIMIT 200",
    )
    .all(date) as any[];
  const strengthLogs = db.prepare("SELECT exercise,weight,date FROM strength_logs WHERE date<=? ORDER BY date DESC LIMIT 300").all(date) as any[];
  const scheduleOverrides = db.prepare(
    "SELECT original_date originalDate,scheduled_date scheduledDate,plan_title planTitle,replacement_title replacementTitle FROM schedule_overrides WHERE original_date<=? OR scheduled_date<=? ORDER BY scheduled_date,id",
  ).all(date, date) as any[];

  const {mondayIso,sundayIso}=weekRangeContaining(date);
  const planDays = buildWeekSchedule(
    buildHomeWeek(profile?.programStart,trainingPlanCycles,date),
    listWeekScheduleChanges(mondayIso,sundayIso),mondayIso,
  ).flatMap((day)=>sessionsForDay(day.scheduled).map((session)=>({day:day.weekday,type:session.type})));

  // AI-4: этот route не имеет ни одного потребителя в коде (проверено grep по
  // всему репозиторию) — задокументированное решение (docs/INSIGHT_ENGINE.md)
  // было удалить его как мёртвый, но удаление файла заблокировано инструментами
  // сессии, поэтому вместо этого он переведён на общий registry, чтобы не
  // оставаться отдельным путём расчёта того же контракта.
  const insights = buildCardInsights({
    date,
    measurements,
    workouts,
    foodLogs,
    strengthLogs,
    planDays,
    scheduleOverrides,
    targets: { calories: COACH_TARGETS.calories, protein: COACH_TARGETS.protein },
    targetWeight: profile?.targetWeight != null ? Number(profile.targetWeight) : null,
  });

  return Response.json({ insights }, { headers: { "cache-control": "no-store" } });
}
