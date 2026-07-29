// Sprint AI-3 — адаптивный вечерний чек-ин. Чистые функции: без React, без
// обращения к БД/API. Мастер завершает день, а не выставляет ему оценку —
// здесь нет общего балла, штрафов и "серий трезвых дней" (см. lib/evening.ts).

import { minutesToLabel } from "./evening.ts";

// ---------------------------------------------------------------------------
// Сон

export type SleepWindow = { startIso: string; endIso: string; minutes: number };
export type CheckinError = { error: string };

// Дольше — это не "долго поспал", а почти наверняка перепутанные времена;
// честнее отклонить и попросить проверить, чем сохранить выдуманную длительность.
const MAX_SLEEP_MINUTES = 14 * 60;

function timeToMinutesOfDay(t: string): number | null {
  if (!t || !/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isoDateTimeAt(midnightMs: number, minutesOfDay: number): string {
  const dateStr = new Date(midnightMs).toISOString().slice(0, 10);
  const h = String(Math.floor(minutesOfDay / 60)).padStart(2, "0");
  const m = String(minutesOfDay % 60).padStart(2, "0");
  return `${dateStr}T${h}:${m}`;
}

// `date` — дата вечернего чек-ина (обычно совпадает с датой пробуждения: чек-ин
// закрывает уже прошедшую ночь). Если время отхода ко сну по часам суток раньше
// или равно времени подъёма (например 00:20 и 07:10), оба момента считаются
// одним и тем же календарным днём `date` — обычная полночь только что миновала.
// Если время отхода ко сну позже времени подъёма (например 23:40 и 07:10) — сон
// начался вечером ПРЕДЫДУЩЕГО дня. Известное ограничение: чек-ин собирает только
// часы суток, без отдельного выбора даты, поэтому сон, целиком уместившийся в
// границы одного дня (например 20:00–23:00 позавчера), однозначно не различить
// от той же пары времён сегодня — для типичного 30–60-секундного мастера это
// приемлемый компромисс, длительность в сводке остаётся видимой проверкой.
export function computeSleepWindow(date: string, startTime: string, endTime: string): SleepWindow | CheckinError {
  const startMins = timeToMinutesOfDay(startTime);
  const endMins = timeToMinutesOfDay(endTime);
  if (startMins == null || endMins == null) return { error: "Укажите время отхода ко сну и подъёма в формате ЧЧ:ММ" };
  const anchorMs = Date.parse(`${date}T00:00:00Z`);
  if (!Number.isFinite(anchorMs)) return { error: "Некорректная дата" };
  const startDayOffset = startMins <= endMins ? 0 : -1;
  const startAbsMs = anchorMs + startDayOffset * 86400000 + startMins * 60000;
  const endAbsMs = anchorMs + endMins * 60000;
  const minutes = Math.round((endAbsMs - startAbsMs) / 60000);
  if (minutes <= 0) return { error: "Время подъёма должно быть позже времени отхода ко сну" };
  if (minutes > MAX_SLEEP_MINUTES) return { error: "Слишком большой интервал сна — проверьте времена" };
  return {
    startIso: isoDateTimeAt(anchorMs + startDayOffset * 86400000, startMins),
    endIso: isoDateTimeAt(anchorMs, endMins),
    minutes,
  };
}

export function formatSleepRange(startIso: string, endIso: string, minutes: number): string {
  return `${startIso.slice(11)}–${endIso.slice(11)} · ${minutesToLabel(minutes)}`;
}

// ---------------------------------------------------------------------------
// Вода

export const WATER_QUICK_OPTIONS = [0.5, 1, 1.5, 2, 2.5, 3] as const;
const WATER_STEP = 0.25;
const WATER_MAX_LITERS = 10;

// Пустой ввод (null/NaN) — это "не отвечено", отдельная ситуация от настоящего
// нуля; вызывающий код не должен путать их до вызова этой функции.
export function normalizeWaterLiters(raw: number): number | null {
  if (!Number.isFinite(raw) || raw < 0 || raw > WATER_MAX_LITERS) return null;
  const stepped = Math.round(raw / WATER_STEP) * WATER_STEP;
  // Убираем плавающие хвосты вроде 1.7500000000000002 от деления/округления.
  return Math.round(stepped * 100) / 100;
}

export function formatLiters(liters: number): string {
  const rounded = Math.round(liters * 100) / 100;
  return `${String(rounded).replace(".", ",")} л`;
}

// ---------------------------------------------------------------------------
// Алкоголь

export const ALCOHOL_RELATIVE_OPTIONS = ["less", "usual", "more"] as const;
export type AlcoholRelativeAmount = (typeof ALCOHOL_RELATIVE_OPTIONS)[number] | "";

export const ALCOHOL_TYPE_PRESETS = [
  { type: "Пиво", defaultVolumeMl: 450 },
  { type: "Вино", defaultVolumeMl: 150 },
  { type: "Крепкое", defaultVolumeMl: 50 },
  { type: "Другое", defaultVolumeMl: 0 },
] as const;

const MAX_ALCOHOL_SERVINGS = 60;
const MAX_ALCOHOL_VOLUME_ML = 5000;

export type AlcoholDraft = {
  drank: boolean | null; // null — вопрос "не пил / пил" ещё не отвечен
  type: string;
  servings: number | null;
  servingVolumeMl: number | null;
  firstDrinkTime: string; // "" вместе с firstDrinkUnknown=false — время не введено
  firstDrinkUnknown: boolean; // честное "не помню" вместо выдуманного времени
  relativeAmount: AlcoholRelativeAmount;
};

export type NormalizedAlcohol =
  | { drank: false }
  | {
      drank: true;
      type: string;
      servings: number;
      servingVolumeMl: number;
      firstDrinkTime: string | null;
      relativeAmount: AlcoholRelativeAmount;
    };

export function normalizeAlcohol(draft: AlcoholDraft): NormalizedAlcohol | CheckinError {
  if (draft.drank == null) return { error: "Укажите, был ли алкоголь сегодня" };
  if (!draft.drank) return { drank: false };
  const servings = draft.servings;
  const volume = draft.servingVolumeMl;
  if (servings == null || !Number.isFinite(servings) || servings < 1) return { error: "Количество без объёма недостаточно — укажите число порций" };
  if (volume == null || !Number.isFinite(volume) || volume < 1) return { error: "Укажите объём одной порции в мл" };
  let firstDrinkTime: string | null = null;
  if (!draft.firstDrinkUnknown) {
    if (!draft.firstDrinkTime) return { error: "Укажите время первого напитка или отметьте «не помню»" };
    if (timeToMinutesOfDay(draft.firstDrinkTime) == null) return { error: "Некорректное время первого напитка" };
    firstDrinkTime = draft.firstDrinkTime;
  }
  return {
    drank: true,
    type: (draft.type || "Другое").trim().slice(0, 40),
    servings: Math.min(Math.round(servings), MAX_ALCOHOL_SERVINGS),
    servingVolumeMl: Math.min(Math.round(volume), MAX_ALCOHOL_VOLUME_ML),
    firstDrinkTime,
    relativeAmount: draft.relativeAmount,
  };
}

// ---------------------------------------------------------------------------
// Главный фактор дня

export const DAY_FACTOR_OPTIONS = ["Работа", "Стресс", "Семья", "Отдых", "Тренировка", "Болезнь", "Поездка", "Другое"] as const;
export type DayFactor = (typeof DAY_FACTOR_OPTIONS)[number] | "";

// ---------------------------------------------------------------------------
// Адаптивные шаги

export type CheckinStepId = "sleep" | "water" | "alcohol" | "mood" | "dinner" | "wellness" | "dayFactor";
export type CheckinStepStatus = "known" | "partial" | "missing";
export type CheckinStep = { id: CheckinStepId; status: CheckinStepStatus };

export type CheckinKnownState = {
  sleepKnown: boolean; // сохранены и начало, и конец сна
  sleepPartial: boolean; // известна только длительность (legacy sleep_hours), без времён
  waterKnown: boolean;
  alcoholKnown: boolean;
  moodKnown: boolean;
  dinnerKnown: boolean; // ужин уже подтверждён daily_activity.dinner или food_logs
  wellnessKnown: boolean;
  dayFactorKnown: boolean;
};

// Порядок детерминирован и не зависит от того, какие поля известны — меняется
// только состав (dinner может отсутствовать целиком), не порядок оставшихся.
const STEP_ORDER: CheckinStepId[] = ["sleep", "water", "alcohol", "mood", "dinner", "wellness", "dayFactor"];

// Единственный шаг, который может исчезнуть из списка целиком — ужин: если он
// уже подтверждён, дальше нечего спрашивать (в отличие от сна/воды/настроения/
// самочувствия, которые остаются как подтверждаемые, даже если уже известны).
export function buildCheckinSteps(known: CheckinKnownState): CheckinStep[] {
  const steps: CheckinStep[] = [];
  for (const id of STEP_ORDER) {
    if (id === "dinner") {
      if (known.dinnerKnown) continue;
      steps.push({ id, status: "missing" });
      continue;
    }
    const status: CheckinStepStatus =
      id === "sleep" ? (known.sleepKnown ? "known" : known.sleepPartial ? "partial" : "missing")
      : id === "water" ? (known.waterKnown ? "known" : "missing")
      : id === "alcohol" ? (known.alcoholKnown ? "known" : "missing")
      : id === "mood" ? (known.moodKnown ? "known" : "missing")
      : id === "wellness" ? (known.wellnessKnown ? "known" : "missing")
      : (known.dayFactorKnown ? "known" : "missing"); // dayFactor — необязателен, но тоже подтверждаем, если уже отвечен
    steps.push({ id, status });
  }
  return steps;
}

// Сырые данные из существующих таблиц (daily_activity/mood_logs/food_logs/
// wellness_logs) — вызывающий код (UI или тесты) решает, как их собрать; эта
// функция только определяет, что считается "уже известным".
export type CheckinRawKnownInputs = {
  activityRow: {
    sleepStart?: string;
    sleepEnd?: string;
    sleepHours?: number;
    waterLogged?: boolean;
    alcoholLogged?: boolean;
    dinner?: boolean;
    dayFactor?: string;
  } | null;
  latestMoodToday: { mood: string } | null;
  dinnerLoggedInFoodLogs: boolean;
  wellnessToday: { energy?: number | null; pain?: number | null; painArea?: string; note?: string } | null;
};

export function deriveKnownState(raw: CheckinRawKnownInputs): CheckinKnownState {
  const a = raw.activityRow;
  const sleepKnown = !!(a?.sleepStart && a?.sleepEnd);
  return {
    sleepKnown,
    sleepPartial: !sleepKnown && !!a?.sleepHours,
    waterKnown: !!a?.waterLogged,
    alcoholKnown: !!a?.alcoholLogged,
    moodKnown: !!raw.latestMoodToday,
    dinnerKnown: !!(a?.dinner || raw.dinnerLoggedInFoodLogs),
    wellnessKnown: !!raw.wellnessToday,
    dayFactorKnown: !!a?.dayFactor,
  };
}

// ---------------------------------------------------------------------------
// Состояние формы и восстановление при повторном открытии

export type CheckinFormState = {
  date: string;
  sleep: { startTime: string; endTime: string; quality: number | null };
  water: { liters: number | null };
  alcohol: AlcoholDraft;
  mood: { mood: string | null; note: string };
  dinner: { dinner: boolean | null };
  wellness: { energy: number | null; pain: number | null; painArea: string; note: string };
  dayFactor: { factor: DayFactor; note: string };
};

export type CheckinExistingData = {
  date: string;
  activityRow: {
    sleepStart?: string;
    sleepEnd?: string;
    sleepQuality?: number | null;
    waterLiters?: number;
    waterLogged?: boolean;
    alcoholLogged?: boolean;
    alcoholType?: string;
    alcoholServings?: number;
    alcoholServingVolumeMl?: number;
    firstDrinkTime?: string;
    alcoholRelativeAmount?: AlcoholRelativeAmount;
    dinner?: boolean;
    dayFactor?: DayFactor;
    dayFactorNote?: string;
  } | null;
  latestMoodToday: { mood: string; note?: string } | null;
  wellnessToday: { energy?: number | null; pain?: number | null; painArea?: string; note?: string } | null;
};

// Инициализирует форму сохранённым состоянием даты — то же самое "восстановление
// при повторном открытии", а не отдельный черновик: чек-ин редактирует запись
// дня, а не собирает новый черновик поверх старого.
export function buildInitialCheckinState(existing: CheckinExistingData): CheckinFormState {
  const a = existing.activityRow;
  return {
    date: existing.date,
    sleep: { startTime: a?.sleepStart?.slice(11) || "", endTime: a?.sleepEnd?.slice(11) || "", quality: a?.sleepQuality ?? null },
    water: { liters: a?.waterLogged ? a?.waterLiters ?? null : null },
    alcohol: a?.alcoholLogged
      ? {
          drank: (a.alcoholServings ?? 0) > 0,
          type: a.alcoholType || "",
          servings: a.alcoholServings || null,
          servingVolumeMl: a.alcoholServingVolumeMl || null,
          firstDrinkTime: a.firstDrinkTime || "",
          firstDrinkUnknown: (a.alcoholServings ?? 0) > 0 && !a.firstDrinkTime,
          relativeAmount: a.alcoholRelativeAmount || "",
        }
      : { drank: null, type: "", servings: null, servingVolumeMl: null, firstDrinkTime: "", firstDrinkUnknown: false, relativeAmount: "" },
    mood: existing.latestMoodToday ? { mood: existing.latestMoodToday.mood, note: existing.latestMoodToday.note || "" } : { mood: null, note: "" },
    // Легаси-колонка dinner не различает "явно не было" от "ещё не отвечено" (в
    // отличие от water/alcohol, у которых есть свой *_logged флаг) — предзаполняем
    // только подтверждённое "true", а не ложно-достоверный "false", иначе шаг мог
    // бы молча сохранить неподтверждённый факт при простом проходе вперёд без
    // осознанного выбора пользователя.
    dinner: { dinner: a?.dinner ? true : null },
    wellness: existing.wellnessToday
      ? {
          energy: existing.wellnessToday.energy ?? null,
          pain: existing.wellnessToday.pain ?? null,
          painArea: existing.wellnessToday.painArea || "",
          note: existing.wellnessToday.note || "",
        }
      : { energy: null, pain: null, painArea: "", note: "" },
    dayFactor: { factor: a?.dayFactor || "", note: a?.dayFactorNote || "" },
  };
}

// ---------------------------------------------------------------------------
// Валидация и серверный payload

export type CheckinValidationError = { step: CheckinStepId; message: string };

export type CheckinSavePayload = {
  date: string;
  sleepStart?: string;
  sleepEnd?: string;
  sleepMinutes?: number;
  sleepQuality?: number | null;
  waterLiters?: number;
  alcohol?: NormalizedAlcohol;
  mood?: { mood: string; note: string };
  dinner?: boolean;
  wellness?: { energy: number | null; pain: number | null; painArea: string; note: string };
  dayFactor?: { factor: string; note: string };
};

// Поле включается в payload, только если пользователь на что-то ответил
// (значение отличимо от "не отвечено") — этим и достигается контракт
// "null не превращается в 0" без служебных флагов "touched" в состоянии формы:
// сервер трогает только те колонки, для которых есть значение.
export function validateCheckinState(state: CheckinFormState): { ok: true; payload: CheckinSavePayload } | { ok: false; errors: CheckinValidationError[] } {
  const errors: CheckinValidationError[] = [];
  const payload: CheckinSavePayload = { date: state.date };

  if (state.sleep.startTime || state.sleep.endTime) {
    if (!state.sleep.startTime || !state.sleep.endTime) {
      errors.push({ step: "sleep", message: "Укажите оба времени: отход ко сну и подъём" });
    } else {
      const window = computeSleepWindow(state.date, state.sleep.startTime, state.sleep.endTime);
      if ("error" in window) errors.push({ step: "sleep", message: window.error });
      else {
        payload.sleepStart = window.startIso;
        payload.sleepEnd = window.endIso;
        payload.sleepMinutes = window.minutes;
        payload.sleepQuality = state.sleep.quality;
      }
    }
  }

  if (state.water.liters != null) {
    const liters = normalizeWaterLiters(state.water.liters);
    if (liters == null) errors.push({ step: "water", message: `Вода: укажите значение от 0 до ${WATER_MAX_LITERS} л` });
    else payload.waterLiters = liters;
  }

  if (state.alcohol.drank != null) {
    const normalized = normalizeAlcohol(state.alcohol);
    if ("error" in normalized) errors.push({ step: "alcohol", message: normalized.error });
    else payload.alcohol = normalized;
  }

  if (state.mood.mood) payload.mood = { mood: state.mood.mood, note: state.mood.note.trim().slice(0, 300) };

  if (state.dinner.dinner != null) payload.dinner = state.dinner.dinner;

  if (state.wellness.energy != null || state.wellness.pain != null || state.wellness.painArea.trim() || state.wellness.note.trim()) {
    payload.wellness = {
      energy: state.wellness.energy,
      pain: state.wellness.pain,
      painArea: state.wellness.painArea.trim().slice(0, 80),
      note: state.wellness.note.trim().slice(0, 300),
    };
  }

  if (state.dayFactor.factor) payload.dayFactor = { factor: state.dayFactor.factor, note: state.dayFactor.note.trim().slice(0, 200) };

  if (errors.length) return { ok: false, errors };
  return { ok: true, payload };
}

// ---------------------------------------------------------------------------
// Итоговая сводка — только подтверждаемые факты, без общей оценки

export type CheckinSummaryLine = { step: CheckinStepId | "workout"; label: string; value: string; editable: boolean };

export function buildCheckinSummary(payload: CheckinSavePayload, workoutDone: boolean): CheckinSummaryLine[] {
  const lines: CheckinSummaryLine[] = [
    { step: "workout", label: "Тренировка", value: workoutDone ? "выполнена" : "не отмечена", editable: false },
  ];

  if (payload.sleepStart && payload.sleepEnd && payload.sleepMinutes != null) {
    lines.push({ step: "sleep", label: "Сон", value: formatSleepRange(payload.sleepStart, payload.sleepEnd, payload.sleepMinutes), editable: true });
  }

  if (payload.waterLiters != null) {
    lines.push({ step: "water", label: "Вода", value: formatLiters(payload.waterLiters), editable: true });
  }

  if (payload.alcohol) {
    if (!payload.alcohol.drank) {
      lines.push({ step: "alcohol", label: "Алкоголь", value: "не пил(а)", editable: true });
    } else {
      const time = payload.alcohol.firstDrinkTime ? `первый напиток в ${payload.alcohol.firstDrinkTime}` : "время не помню";
      lines.push({ step: "alcohol", label: payload.alcohol.type, value: `${payload.alcohol.servings} × ${payload.alcohol.servingVolumeMl} мл · ${time}`, editable: true });
    }
  }

  if (payload.mood) lines.push({ step: "mood", label: "Настроение", value: payload.mood.mood, editable: true });

  if (payload.dinner != null) lines.push({ step: "dinner", label: "Ужин", value: payload.dinner ? "отмечен" : "не было", editable: true });

  if (payload.wellness) {
    const parts: string[] = [];
    if (payload.wellness.energy != null) parts.push(`энергия ${payload.wellness.energy}/5`);
    if (payload.wellness.pain != null) parts.push(`боль ${payload.wellness.pain}/10`);
    if (payload.wellness.painArea) parts.push(payload.wellness.painArea);
    if (parts.length) lines.push({ step: "wellness", label: "Самочувствие", value: parts.join(", "), editable: true });
  }

  if (payload.dayFactor) lines.push({ step: "dayFactor", label: "Главный фактор дня", value: payload.dayFactor.factor, editable: true });

  return lines;
}
