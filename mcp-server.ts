import Database from "better-sqlite3";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildAiCoachContext, renderAiCoachContextText } from "./lib/ai-context.ts";
import { loadAiCoachContextData } from "./lib/ai-context-data.ts";
import { dateInTimeZone } from "./lib/coach-chat-quota.ts";

const dataDir = path.resolve(process.env.DATA_DIR || "data");
const dbPath = path.join(dataDir, "volt.sqlite");
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
db.pragma("busy_timeout = 10000");

function snapshotText(): string {
  const date = dateInTimeZone(new Date());
  const contextData = loadAiCoachContextData(db, { date, plan: null });
  const context = buildAiCoachContext(contextData);
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
