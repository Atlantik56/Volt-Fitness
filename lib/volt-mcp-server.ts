import type Database from "better-sqlite3";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { dateInTimeZone } from "./coach-chat-quota.ts";
import {
  getProgressSummary, getRecentWorkouts, getRecords, getTodaySummary, getTrainingLoad, getWeekPlan,
} from "./volt-mcp-data.ts";
import { VOLT_SCOPES, type VoltScope } from "./volt-oauth.ts";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Дата YYYY-MM-DD; по умолчанию сегодня");
const readOnlyAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const;

function toolResult(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  };
}

export function createVoltMcpServer(db: Database.Database, availableScopes: readonly string[] = VOLT_SCOPES) {
  const server = new McpServer({ name: "volt", version: "0.1.0" });
  const requireScopes = (required: readonly VoltScope[]) => {
    if (required.some((scope) => !availableScopes.includes(scope))) throw new Error("Недостаточно прав для этого инструмента");
  };
  const today = (date?: string) => date ?? dateInTimeZone(new Date());

  server.registerTool("get_today_summary", {
    title: "Сводка VOLT за день",
    description: "План, самочувствие, активность, питание, вес и последние подтверждённые тренировки за выбранный день.",
    inputSchema: { date: dateSchema },
    annotations: readOnlyAnnotations,
  }, async ({ date }) => {
    requireScopes(["volt.profile.read", "volt.training.read"]);
    return toolResult(getTodaySummary(db, today(date)));
  });

  server.registerTool("get_week_plan", {
    title: "План тренировок на неделю",
    description: "Единый активный план VOLT с пользовательскими переносами и выбранными альтернативами.",
    inputSchema: { date: dateSchema },
    annotations: readOnlyAnnotations,
  }, async ({ date }) => {
    requireScopes(["volt.training.read"]);
    return toolResult(getWeekPlan(db, today(date)));
  });

  server.registerTool("get_recent_workouts", {
    title: "Последние тренировки",
    description: "Последние подтверждённые тренировки VOLT. Записи происхождения Strava исключены.",
    inputSchema: { date: dateSchema, limit: z.number().int().min(1).max(30).optional().default(10) },
    annotations: readOnlyAnnotations,
  }, async ({ date, limit }) => {
    requireScopes(["volt.training.read"]);
    return toolResult(getRecentWorkouts(db, today(date), limit));
  });

  server.registerTool("get_training_load", {
    title: "Тренировочная нагрузка",
    description: "Агрегаты нагрузки, регулярности и выполнения плана без Strava-данных.",
    inputSchema: {
      date: dateSchema,
      range: z.enum(["current_week", "4_weeks", "8_weeks", "12_weeks"]).optional().default("4_weeks"),
    },
    annotations: readOnlyAnnotations,
  }, async ({ date, range }) => {
    requireScopes(["volt.analytics.read"]);
    return toolResult(getTrainingLoad(db, today(date), range));
  });

  server.registerTool("get_progress_summary", {
    title: "Прогресс VOLT",
    description: "Изменение веса, тренировки, силовая прогрессия и достижения за последние 12 недель.",
    inputSchema: { date: dateSchema },
    annotations: readOnlyAnnotations,
  }, async ({ date }) => {
    requireScopes(["volt.profile.read", "volt.analytics.read"]);
    return toolResult(getProgressSummary(db, today(date)));
  });

  server.registerTool("get_records", {
    title: "Личные рекорды",
    description: "Лучшие рабочие веса и достижения VOLT на выбранную дату.",
    inputSchema: { date: dateSchema, limit: z.number().int().min(1).max(50).optional().default(20) },
    annotations: readOnlyAnnotations,
  }, async ({ date, limit }) => {
    requireScopes(["volt.analytics.read"]);
    return toolResult(getRecords(db, today(date), limit));
  });

  return server;
}
