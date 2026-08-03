import { db } from "@/lib/db";
import { requireAuth, sameOrigin } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { buildAiCoachContext } from "@/lib/ai-context";
import { loadAiCoachContextData } from "@/lib/ai-context-data";
import { AiCoachError, type AiChatMessage } from "@/lib/ai-coach";
import { askAiHub } from "@/lib/ai-hub";
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
  const provider=body.provider==="anthropic"||body.provider==="mws"||body.provider==="consensus"?body.provider:"auto";
  if (!date || !question) return Response.json({ error: "Укажите дату и вопрос" }, { status: 400 });

  const plan =
    body.plan && typeof body.plan.title === "string" && typeof body.plan.type === "string"
      ? { title: body.plan.title.slice(0, 120), type: body.plan.type.slice(0, 40) }
      : null;
  // AI-11 — исходный план и факт изменения приходят от клиента (уже посчитаны
  // детерминированно в app/week-schedule-model.ts), Coach их не пересчитывает.
  const originalPlan =
    body.originalPlan && typeof body.originalPlan.title === "string" && typeof body.originalPlan.type === "string"
      ? { title: body.originalPlan.title.slice(0, 120), type: body.originalPlan.type.slice(0, 40) }
      : null;
  const planChanged = body.planChanged === true;
  const REASON_CODES = ["mood", "fatigue", "pain", "no_equipment", "weather", "schedule", "other", ""];
  const changeReasonCode = REASON_CODES.includes(body.changeReasonCode) ? body.changeReasonCode : "";

  const history = loadConversation(6);

  const hubConfig={
    anthropicKey:getSetting("anthropic_api_key")||process.env.ANTHROPIC_API_KEY,
    mwsKey:getSetting("mws_api_key")||process.env.MWS_API_KEY,
    mwsProject:getSetting("mws_project")||process.env.MWS_PROJECT,
    mwsModel:getSetting("mws_model")||process.env.MWS_MODEL,
  };
  if(!hubConfig.anthropicKey&&!(hubConfig.mwsKey&&hubConfig.mwsProject&&hubConfig.mwsModel))
    return Response.json({error:"AI Hub не настроен на сервере"},{status:503});

  // Данные принадлежат единственному профилю приложения (id=1); requireAuth уже
  // защищает эндпоинт от неавторизованных запросов — доступа к «чужим» данным нет.
  const contextData = loadAiCoachContextData(db, { date, plan, originalPlan, planChanged, changeReasonCode });
  const context = buildAiCoachContext(contextData);

  // Ключ лимита вычисляется на сервере в часовом поясе владельца. Клиентская
  // дата нужна для контекста дня, но не может обойти лимит подстановкой другой даты.
  const quotaDate = dateInTimeZone(new Date());
  if (!reserveQuota(quotaDate))
    return Response.json({ error: `Дневной лимит сообщений тренеру исчерпан (${COACH_CHAT_DAILY_LIMIT}). Продолжите завтра.` }, { status: 429 });

  try {
    const reply=await askAiHub(hubConfig,context,history,question,provider);
    appendMessages(question, reply.answer);
    return Response.json({ ok: true, ...reply });
  } catch (err) {
    // Неудачный запрос не должен съедать пользовательский дневной лимит.
    releaseQuota(quotaDate);
    if (err instanceof AiCoachError) return Response.json({ error: err.message }, { status: err.status });
    return Response.json({ error: "Не удалось получить ответ ИИ-тренера" }, { status: 500 });
  }
}
