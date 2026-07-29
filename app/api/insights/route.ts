// AI-5 — Coach Memory: единая точка показа инсайтов для трёх поверхностей
// (card/evening/mood). GET сам является "фактическим показом" — вызывается
// клиентом ровно при монтировании реального экрана (не на каждый пересчёт),
// поэтому здесь же (после фильтрации по Memory) отмечается show.
//
// Отказоустойчивость (docs/MEMORY_ENGINE.md): если Memory-слой упал (ошибка
// БД), отдаём НЕОТФИЛЬТРОВАННЫЙ список кандидатов, а не пустой — страница не
// ломается и safety-советы (через будущий SAFETY_INSIGHT_IDS) не прячутся.
import { db } from "@/lib/db";
import { requireAuth, sameOrigin } from "@/lib/auth";
import { buildCardInsights, buildEveningInsights, buildMoodInsights } from "@/lib/insights/registry";
import { filterVisibleInsights, markInsightsShown, dismissInsightRecord } from "@/lib/insight-memory-store";
import { buildHomeWeek } from "../../personal-data";
import { COACH_TARGETS } from "@/lib/coach";
import type { Insight } from "@/lib/insights/types";

export const runtime = "nodejs";

const dateOk = (x: any) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const SURFACES = ["card", "evening", "mood"] as const;
type Surface = (typeof SURFACES)[number];

function buildCandidates(surface: Surface, date: string): Insight[] {
  if (surface === "card") {
    const profile = db.prepare("SELECT program_start programStart, target_weight targetWeight FROM profile WHERE id=1").get() as any;
    const measurements = db.prepare("SELECT date,weight FROM measurements WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
    const foodLogs = db.prepare("SELECT date,calories,protein FROM food_logs WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
    const workouts = db.prepare("SELECT date,type,title FROM workout_logs WHERE date<=? ORDER BY date DESC,id DESC LIMIT 200").all(date) as any[];
    const strengthLogs = db.prepare("SELECT exercise,weight,date FROM strength_logs WHERE date<=? ORDER BY date DESC LIMIT 300").all(date) as any[];
    const scheduleOverrides = db.prepare(
      "SELECT original_date originalDate,scheduled_date scheduledDate,plan_title planTitle,replacement_title replacementTitle FROM schedule_overrides WHERE original_date<=? OR scheduled_date<=? ORDER BY scheduled_date,id",
    ).all(date, date) as any[];
    const moodLogs = db.prepare("SELECT id,date,mood,note FROM mood_logs WHERE date<=? ORDER BY date DESC LIMIT 200").all(date) as any[];
    const activity = db.prepare("SELECT date,sleep_hours sleepHours FROM daily_activity WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
    const planDays = buildHomeWeek(profile?.programStart).map((d: any) => ({ day: d.day, type: d.type }));
    return buildCardInsights({
      date, measurements, workouts, foodLogs, strengthLogs, planDays, scheduleOverrides,
      targets: { calories: COACH_TARGETS.calories, protein: COACH_TARGETS.protein },
      targetWeight: profile?.targetWeight != null ? Number(profile.targetWeight) : null,
      moodLogs, activity,
    });
  }
  if (surface === "evening") {
    const activity = db.prepare(
      "SELECT date,first_drink_time firstDrinkTime,beers,dinner,sleep_hours sleepHours,active_minutes activeMinutes FROM daily_activity WHERE date<=? ORDER BY date DESC LIMIT 60",
    ).all(date) as any[];
    const workouts = db.prepare("SELECT date FROM workout_logs WHERE date<=? ORDER BY date DESC LIMIT 200").all(date) as any[];
    return buildEveningInsights(activity, workouts);
  }
  const moodLogs = db.prepare("SELECT id,date,mood,note FROM mood_logs WHERE date<=? ORDER BY date DESC LIMIT 200").all(date) as any[];
  const workouts = db.prepare("SELECT date FROM workout_logs WHERE date<=? ORDER BY date DESC LIMIT 200").all(date) as any[];
  const activity = db.prepare("SELECT date,sleep_hours sleepHours FROM daily_activity WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
  return buildMoodInsights(moodLogs, workouts, activity);
}

export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;

  const url = new URL(req.url);
  const surfaceParam = url.searchParams.get("surface");
  if (!SURFACES.includes(surfaceParam as Surface)) return Response.json({ error: "Некорректный surface" }, { status: 400 });
  const surface = surfaceParam as Surface;
  const date = dateOk(url.searchParams.get("date")) ? (url.searchParams.get("date") as string) : new Date().toISOString().slice(0, 10);

  const candidates = buildCandidates(surface, date);

  let insights = candidates;
  try {
    const now = new Date();
    const visible = filterVisibleInsights(db, candidates, now);
    markInsightsShown(db, visible, now);
    insights = visible;
  } catch (error) {
    // Ошибка Memory не должна ломать страницу или прятать инсайты — честный
    // fallback на нефильтрованный список (может показать что-то ещё раз, но
    // никогда не приведёт к пустому экрану из-за бага в journal-слое).
    console.error("insight-memory: filter/mark failed, falling back to unfiltered insights", error);
    insights = candidates;
  }

  return Response.json({ insights }, { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!sameOrigin(req)) return new Response(null, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body || body.action !== "dismiss" || typeof body.insightId !== "string" || typeof body.evidenceHash !== "string" || typeof body.sourceRevision !== "string") {
    return Response.json({ error: "Некорректный запрос" }, { status: 400 });
  }
  try {
    dismissInsightRecord(db, body.insightId, body.evidenceHash, body.sourceRevision, new Date());
  } catch (error) {
    console.error("insight-memory: dismiss failed", error);
    return Response.json({ error: "Не удалось сохранить" }, { status: 500 });
  }
  return Response.json({ ok: true });
}
