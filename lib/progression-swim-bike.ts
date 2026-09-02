// AI-15 — прогрессия для бассейна и вело в контракте AI-14.
//
// Чистые функции: без БД и без ИИ, как и движок зала.
import type { DisciplineProposal } from "./progression-contract.ts";

// ---------- Бассейн ----------

export type SwimSession = {
  date: string;
  distanceMeters: number;
  /** Секунды на 100 м: меньше — быстрее. */
  paceSecondsPer100m: number | null;
  /** SWOLF: время длины плюс гребки. Меньше — экономичнее техника. */
  avgSwolf: number | null;
};

/** Прирост объёма за цикл — один «сотенный» отрезок. */
export const SWIM_DISTANCE_STEP_METERS = 100;
/** Насколько SWOLF должен ухудшиться, чтобы считаться распадом техники. */
export const SWOLF_WORSENING_RATIO = 1.05;
/** Минимум заплывов, до которого тренд не строится. */
export const SWIM_MIN_HISTORY = 3;

const swim = (over: Partial<DisciplineProposal> & Pick<DisciplineProposal, "subject" | "action" | "reasonCode" | "reason" | "from" | "to">): DisciplineProposal =>
  ({ discipline: "swim", usedSignals: [], limitedData: false, ...over });

const meters = (value: number) => `${Math.round(value)} м`;
const pace = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}/100м`;

/**
 * Правило бассейна, которого нет в зале: **техника важнее дистанции**.
 * Если темп вырос, а SWOLF при этом ухудшился, гребок разваливается — объём не
 * наращиваем, пока техника не устоится.
 *
 * `history` — от новой записи к старой; history[0] это последний заплыв.
 */
export function buildSwimProgression(history: readonly SwimSession[]): DisciplineProposal {
  const last = history[0];
  if (!last) return swim({ subject: "Плавание", action: "no-change", reasonCode: "no-history", reason: "Нет ни одного заплыва — предложение не строится.", limitedData: true, from: "—", to: "—" });

  const from = meters(last.distanceMeters);
  if (history.length < SWIM_MIN_HISTORY)
    return swim({ subject: "Плавание", action: "maintain", reasonCode: "swim-limited-history", reason: `Заплывов пока ${history.length} из ${SWIM_MIN_HISTORY} — тренд не построить, объём сохраняем.`, limitedData: true, from, to: from });

  const previous = history[1];
  const fasterPace = last.paceSecondsPer100m !== null && previous.paceSecondsPer100m !== null && last.paceSecondsPer100m < previous.paceSecondsPer100m;
  const worseSwolf = last.avgSwolf !== null && previous.avgSwolf !== null && last.avgSwolf > previous.avgSwolf * SWOLF_WORSENING_RATIO;

  if (fasterPace && worseSwolf)
    return swim({
      subject: "Плавание", action: "maintain", reasonCode: "swim-technique-decay",
      reason: `Темп вырос (${pace(previous.paceSecondsPer100m!)} → ${pace(last.paceSecondsPer100m!)}), но SWOLF ухудшился (${previous.avgSwolf} → ${last.avgSwolf}). Это распад техники: объём не наращиваем.`,
      usedSignals: [`темп ${pace(last.paceSecondsPer100m!)}`, `SWOLF ${last.avgSwolf}`],
      from, to: from,
    });

  if (worseSwolf)
    return swim({
      subject: "Плавание", action: "maintain", reasonCode: "swim-swolf-worse",
      reason: `SWOLF ухудшился (${previous.avgSwolf} → ${last.avgSwolf}) — сохраняем объём и работаем над техникой.`,
      usedSignals: [`SWOLF ${last.avgSwolf}`], from, to: from,
    });

  const to = meters(last.distanceMeters + SWIM_DISTANCE_STEP_METERS);
  return swim({
    subject: "Плавание", action: "increase", reasonCode: "swim-distance-step",
    reason: `Техника держится (SWOLF ${last.avgSwolf ?? "—"}), объём можно добавить на ${SWIM_DISTANCE_STEP_METERS} м.`,
    usedSignals: last.avgSwolf !== null ? [`SWOLF ${last.avgSwolf}`] : [], from, to,
  });
}

// ---------- Вело ----------

export type BikeSession = {
  date: string;
  durationSeconds: number;
  avgWatts: number | null;
  normalizedWatts: number | null;
};

/** Прирост длительности длинного заезда за шаг. */
export const BIKE_DURATION_STEP_MINUTES = 5;
/** Потолок длинного заезда в текущем цикле. */
export const BIKE_MAX_DURATION_MINUTES = 60;
export const BIKE_MIN_HISTORY = 3;

const bike = (over: Partial<DisciplineProposal> & Pick<DisciplineProposal, "subject" | "action" | "reasonCode" | "reason" | "from" | "to">): DisciplineProposal =>
  ({ discipline: "bike", usedSignals: [], limitedData: false, ...over });

const minutes = (seconds: number) => `${Math.round(seconds / 60)} мин`;

/**
 * Вело: сначала растёт время, интенсивность — отдельным решением владельца
 * (docs/PLAN_V4.md). Поэтому шаг прогрессии здесь по длительности, а мощность
 * используется как признак того, что нагрузка вообще измеряется.
 *
 * FTP не оценивается по обычным заездам: для этого есть протокол теста на 20
 * минут в конце цикла. Выводить FTP из произвольной работы значило бы выдавать
 * догадку за измерение.
 */
export function buildBikeProgression(history: readonly BikeSession[]): DisciplineProposal {
  const last = history[0];
  if (!last) return bike({ subject: "Велотренировка", action: "no-change", reasonCode: "no-history", reason: "Нет ни одного заезда — предложение не строится.", limitedData: true, from: "—", to: "—" });

  const from = minutes(last.durationSeconds);
  if (history.length < BIKE_MIN_HISTORY)
    return bike({ subject: "Велотренировка", action: "maintain", reasonCode: "bike-limited-history", reason: `Заездов пока ${history.length} из ${BIKE_MIN_HISTORY} — тренд не построить, длительность сохраняем.`, limitedData: true, from, to: from });

  const currentMinutes = last.durationSeconds / 60;
  if (currentMinutes >= BIKE_MAX_DURATION_MINUTES)
    return bike({
      subject: "Велотренировка", action: "maintain", reasonCode: "bike-duration-cap",
      reason: `Длительность достигла ${BIKE_MAX_DURATION_MINUTES} мин — потолка цикла. Дальше растёт интенсивность, а это отдельное решение.`,
      from, to: from,
    });

  const power = last.normalizedWatts ?? last.avgWatts;
  const to = minutes((currentMinutes + BIKE_DURATION_STEP_MINUTES) * 60);
  return bike({
    subject: "Велотренировка", action: "increase", reasonCode: "bike-duration-step",
    reason: power !== null
      ? `Заезд прошёл ровно (${Math.round(power)} Вт), можно добавить ${BIKE_DURATION_STEP_MINUTES} мин.`
      : `Можно добавить ${BIKE_DURATION_STEP_MINUTES} мин. Мощность не пишется — прогрессия идёт по времени.`,
    usedSignals: power !== null ? [`${Math.round(power)} Вт`] : [],
    limitedData: power === null,
    from, to,
  });
}
