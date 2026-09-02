// AI-15 — сборка истории по дисциплинам для правил прогрессии.
//
// Правила (lib/progression-swim-bike.ts) чистые и о базе не знают. Здесь
// собирается их вход: подтверждённые тренировки плюс метрики из связанного
// импорта, где живут SWOLF и мощность.
import { db } from "@/lib/db";
import { applyRecoveryLimiter, type DisciplineProposal } from "@/lib/progression-contract";
import { buildBikeProgression, buildSwimProgression, type BikeSession, type SwimSession } from "@/lib/progression-swim-bike";
import { recoveryLimiterForDate } from "@/lib/intervals-service";
import { draftFamily } from "@/lib/fit-import-service";

const HISTORY_LIMIT = 12;

type LogRow = { id: number; date: string; type: string; title: string; durationSeconds: number; distanceMeters: number; importType: string | null; metadata: string | null };

/**
 * Подтверждённые тренировки дисциплины с метриками связанного импорта.
 *
 * LEFT JOIN нужен, чтобы запись, заведённая вручную, тоже участвовала в
 * истории — просто без SWOLF и мощности. Но фильтровать по дисциплине только
 * импорт нельзя: тогда в вело попадали бы все тренировки подряд, у которых
 * импорта нет. Поэтому дисциплина определяется по импорту, а при его
 * отсутствии — по типу и названию самой тренировки, тем же правилом, что и
 * при разборе FIT.
 */
function logsOfDiscipline(activityType: string): LogRow[] {
  const rows = db.prepare(`SELECT w.id,w.date,w.type,w.title,w.duration_seconds durationSeconds,w.distance_meters distanceMeters,
      i.activity_type importType,i.metadata
    FROM workout_logs w
    LEFT JOIN workout_drafts d ON d.workout_id=w.id
    LEFT JOIN workout_imports i ON i.draft_id=d.id
    WHERE w.duration_seconds>0
    ORDER BY w.date DESC,w.id DESC LIMIT 60`).all() as LogRow[];
  return rows
    .filter((row) => (row.importType ?? draftFamily(row.type ?? "", row.title ?? "")) === activityType)
    .slice(0, HISTORY_LIMIT);
}

const parse = (value: string | null): Record<string, any> => {
  try { const p = JSON.parse(value ?? "{}"); return p && typeof p === "object" ? p : {}; } catch { return {}; }
};
const finite = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
};

export function buildDisciplineProgression(todayIso: string): { swim: DisciplineProposal; bike: DisciplineProposal } {
  const limiter = recoveryLimiterForDate(todayIso);

  const swimHistory: SwimSession[] = logsOfDiscipline("swim")
    .filter((row) => row.distanceMeters > 0)
    .map((row) => {
      const swim = parse(row.metadata).swim ?? {};
      return {
        date: row.date,
        distanceMeters: row.distanceMeters,
        // Темп считаем сами, если импорт его не принёс: дистанция и время есть
        // и у ручной записи.
        paceSecondsPer100m: finite(swim.paceSecondsPer100m) ?? Math.round(row.durationSeconds / row.distanceMeters * 100),
        avgSwolf: finite(swim.avgSwolf),
      };
    });

  const bikeHistory: BikeSession[] = logsOfDiscipline("bike").map((row) => {
    const power = parse(row.metadata).power ?? {};
    return {
      date: row.date,
      durationSeconds: row.durationSeconds,
      avgWatts: finite(power.avgWatts),
      normalizedWatts: finite(power.normalizedWatts),
    };
  });

  return {
    swim: applyRecoveryLimiter(buildSwimProgression(swimHistory), limiter),
    bike: applyRecoveryLimiter(buildBikeProgression(bikeHistory), limiter),
  };
}
