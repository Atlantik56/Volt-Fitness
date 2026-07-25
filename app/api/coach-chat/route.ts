import { db } from "@/lib/db";
import { requireAuth, sameOrigin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { buildAiCoachContext } from "@/lib/ai-context";
import { askAiCoach, AiCoachError, type AiChatMessage } from "@/lib/ai-coach";
import {
  COACH_CHAT_DAILY_LIMIT,
  dateInTimeZone,
  releaseDailyQuota,
  reserveDailyQuota,
} from "@/lib/coach-chat-quota";

export const runtime = "nodejs";

const dateOk = (x: any) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);

// Скользящее окно хранимой истории разговора — не бесконечный журнал,
// только последние сообщения для контекста и отображения при перезагрузке.
const STORED_MESSAGES_LIMIT = 40;

const quotaStore = { get: getSetting, set: setSetting };
const reserveQuota = db.transaction((date: string) => reserveDailyQuota(quotaStore, date));
const releaseQuota = db.transaction((date: string) => releaseDailyQuota(quotaStore, date));

function loadConversation(limit: number): AiChatMessage[] {
  const rows = db.prepare("SELECT role,text FROM coach_conversation ORDER BY id DESC LIMIT ?").all(limit) as AiChatMessage[];
  return rows.reverse();
}

function appendMessages(question: string, answer: string) {
  const insert = db.prepare("INSERT INTO coach_conversation (role,text) VALUES (?,?)");
  const prune = db.prepare("DELETE FROM coach_conversation WHERE id NOT IN (SELECT id FROM coach_conversation ORDER BY id DESC LIMIT ?)");
  db.transaction(() => {
    insert.run("user", question);
    insert.run("assistant", answer);
    prune.run(STORED_MESSAGES_LIMIT);
  })();
}

export async function GET() {
  const denied = await requireAuth();
  if (denied) return denied;
  return Response.json({ messages: loadConversation(STORED_MESSAGES_LIMIT) }, { headers: { "cache-control": "no-store" } });
}

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

  const history = loadConversation(6);

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

  // Ключ лимита вычисляется на сервере в часовом поясе владельца. Клиентская
  // дата нужна для контекста дня, но не может обойти лимит подстановкой другой даты.
  const quotaDate = dateInTimeZone(new Date());
  if (!reserveQuota(quotaDate))
    return Response.json({ error: `Дневной лимит сообщений тренеру исчерпан (${COACH_CHAT_DAILY_LIMIT}). Продолжите завтра.` }, { status: 429 });

  try {
    const reply = await askAiCoach(key, context, history, question);
    appendMessages(question, reply.answer);
    return Response.json({ ok: true, ...reply });
  } catch (err) {
    // Неудачный запрос не должен съедать пользовательский дневной лимит.
    releaseQuota(quotaDate);
    if (err instanceof AiCoachError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: "Не удалось получить ответ ИИ-тренера" }, { status: 500 });
  }
}
