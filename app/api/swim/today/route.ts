import { requireAuth } from "@/lib/auth";
import { localIso } from "@/app/week-schedule-model";
import { resolveScheduledSwimWorkout } from "@/lib/swim/services";
export const runtime = "nodejs";

// Единая точка входа для "какая тренировка Swim назначена сегодняшней дате" —
// используется глобальной Главной VOLT, чтобы «Начать тренировку» открывала
// ровно ту же тренировку, что и /swim и /swim/workouts (см.
// lib/swim/services.ts:resolveScheduledSwimWorkout).
export async function GET(req: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  const url = new URL(req.url);
  const date = url.searchParams.get("date") || localIso(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Некорректная дата" }, { status: 400 });
  const slot = resolveScheduledSwimWorkout(date);
  return Response.json({ slot }, { headers: { "cache-control": "no-store" } });
}
