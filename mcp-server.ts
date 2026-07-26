import Database from "better-sqlite3";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildAiCoachContext, renderAiCoachContextText } from "./lib/ai-context.ts";
import { dateInTimeZone } from "./lib/coach-chat-quota.ts";

const dataDir = path.resolve(process.env.DATA_DIR || "data");
const dbPath = path.join(dataDir, "volt.sqlite");
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
db.pragma("busy_timeout = 10000");

function snapshotText(): string {
  const date = dateInTimeZone(new Date());
  const profile = db.prepare("SELECT name,height,start_weight startWeight,target_weight targetWeight,program_start programStart FROM profile WHERE id=1").get() as any;
  const measurements = db.prepare("SELECT date,weight FROM measurements WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
  const foodLogs = db.prepare("SELECT date,calories,protein FROM food_logs WHERE date<=? ORDER BY date DESC LIMIT 60").all(date) as any[];
  const workouts = db.prepare("SELECT date,type,title,effort,pain_after painAfter FROM workout_logs WHERE date<=? ORDER BY date DESC,id DESC LIMIT 20").all(date) as any[];
  const wellness = db.prepare("SELECT energy,pain,pain_area painArea FROM wellness_logs WHERE date=?").get(date) as any;
  const activity = db.prepare("SELECT steps,active_minutes activeMinutes,sleep_hours sleepHours FROM daily_activity WHERE date=?").get(date) as any;

  const context = buildAiCoachContext({
    date,
    ready: true,
    plan: null,
    profile,
    measurements,
    foodLogs,
    workouts,
    wellnessLogs: wellness ? [{ date, ...wellness }] : [],
    activity: activity ? [{ date, ...activity }] : [],
  });
  return renderAiCoachContextText(context);
}

const server = new McpServer({ name: "volt-fitness", version: "1.0.0" });

server.registerResource(
  "volt-snapshot",
  "volt://snapshot",
  { title: "VOLT — снимок данных", description: "Профиль, дорожная карта, вес, питание, самочувствие и последние тренировки Ильи", mimeType: "text/plain" },
  async (uri) => ({ contents: [{ uri: uri.href, text: snapshotText() }] }),
);

server.registerTool(
  "get_volt_context",
  {
    title: "Данные VOLT",
    description: "Возвращает текущий профиль, дорожную карту, вес, питание, самочувствие и последние тренировки Ильи из приложения VOLT",
    inputSchema: {},
  },
  async () => ({ content: [{ type: "text", text: snapshotText() }] }),
);

await server.connect(new StdioServerTransport());
