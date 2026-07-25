import { db } from "@/lib/db";
import { requireAuth, sameOrigin } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { buildAiCoachContext } from "@/lib/ai-context";
import { askAiCoach, AiCoachError, type AiChatMessage } from "@/lib/ai-coach";

export const runtime = "nodejs";

const dateOk = (x: any) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

export async function POST(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!sameOrigin(req)) return new Response(null, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const date = dateOk(body.date) ? body.date : null;
  const question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
  if (!date || !question) return Response.json({ error: "Укажите дату и вопрос" }, { status: 400 });

  const plan =
    body.plan && typeof body.plan.title === "string" && typeof body.plan.type === "string"
      ? { title: body.plan.title.slice(0, 120), type: body.plan.type.slice(0, 40) }
      : null;

  const history: AiChatMessage[] = Array.isArray(body.history)
    ? body.history
        .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.text === "string")
        .slice(-10)
        .map((m: any) => ({ role: m.role, text: String(m.text).slice(0, 2000) }))
    : [];

  const key = getSetting("anthropic_api_key") || process.env.ANTHROPIC_API_KEY;
  if (!key) return Response.json({ error: "ИИ-тренер не настроен на сервере" }, { status: 503 });

  // Данные принадлежат единственному профилю приложения (id=1); requireAuth уже
  // защищает эндпоинт от неавторизованных запросов — доступа к «чужим» данным нет.
  const profile = db.prepare("SELECT name,height,start_weight startWeight,target_weight targetWeight FROM profile WHERE id=1").get() as any;
  const measurements = db.prepare("SELECT date,weight FROM measurements WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
  const foodLogs = db.prepare("SELECT date,calories,protein FROM food_logs WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
  const workouts = db
    .prepare("SELECT date,type,title,effort,pain_after painAfter FROM workout_logs WHERE date<=? ORDER BY date DESC,id DESC LIMIT 20")
    .all(date) as any[];
  const wellness = db.prepare("SELECT energy,pain,pain_area painArea FROM wellness_logs WHERE date=?").get(date) as any;
  const activity = db.prepare("SELECT steps,active_minutes activeMinutes,sleep_hours sleepHours FROM daily_activity WHERE date=?").get(date) as any;

  const context = buildAiCoachContext({
    date,
    ready: true,
    plan,
    profile,
    measurements,
    foodLogs,
    workouts,
    wellnessLogs: wellness ? [{ date, ...wellness }] : [],
    activity: activity ? [{ date, ...activity }] : [],
  });

  try {
    const reply = await askAiCoach(key, context, history, question);
    return Response.json({ ok: true, ...reply });
  } catch (err) {
    if (err instanceof AiCoachError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: "Не удалось получить ответ ИИ-тренера" }, { status: 500 });
  }
}
