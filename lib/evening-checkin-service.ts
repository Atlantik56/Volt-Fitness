// Sprint AI-3 — серверное сохранение вечернего чек-ина.
// Принимает тот же сырой "черновик" (CheckinFormState-подобная форма), что и
// клиент, и заново прогоняет его через ту же чистую валидацию
// (lib/evening-checkin.ts validateCheckinState) — длительность сна и все прочие
// значения пересчитываются здесь, а не берутся из тела запроса как готовые числа.
// Одна db.transaction на весь чек-ин: daily_activity/mood_logs/wellness_logs
// либо сохраняются вместе, либо не сохраняется ничего.
import { db } from "./db.ts";
import { MOOD_OPTIONS } from "./mood.ts";
import {
  validateCheckinState,
  DAY_FACTOR_OPTIONS,
  type CheckinFormState,
  type CheckinSavePayload,
} from "./evening-checkin.ts";

export type ActionResult = { ok: true; summary: CheckinSavePayload } | { ok: false; error: string; status: number };

const dateOk = (x: any) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const timeOk = (x: any) => x === "" || x == null || (typeof x === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(x));
const clampInt = (n: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(n)));
const numOrNull = (x: any) => (x != null && Number.isFinite(Number(x)) ? Number(x) : null);

// Тело запроса — недоверенный внешний вход. Собираем из него CheckinFormState,
// отбрасывая всё, что не проходит базовую форму (тип/enum/формат времени) —
// содержательная проверка (даты, длительность сна, объёмы) происходит дальше в
// validateCheckinState, общей с клиентом чистой функции.
function sanitizeState(b: any): CheckinFormState | null {
  if (!b || typeof b !== "object" || !dateOk(b.date)) return null;
  const sleep = b.sleep || {};
  const water = b.water || {};
  const alcohol = b.alcohol || {};
  const mood = b.mood || {};
  const dinner = b.dinner || {};
  const wellness = b.wellness || {};
  const dayFactor = b.dayFactor || {};
  if (!timeOk(sleep.startTime) || !timeOk(sleep.endTime) || !timeOk(alcohol.firstDrinkTime)) return null;
  if (mood.mood != null && !MOOD_OPTIONS.includes(mood.mood)) return null;
  if (alcohol.relativeAmount != null && !["less", "usual", "more", ""].includes(alcohol.relativeAmount)) return null;
  if (dayFactor.factor && !(DAY_FACTOR_OPTIONS as readonly string[]).includes(dayFactor.factor)) return null;

  return {
    date: b.date,
    sleep: {
      startTime: typeof sleep.startTime === "string" ? sleep.startTime : "",
      endTime: typeof sleep.endTime === "string" ? sleep.endTime : "",
      quality: sleep.quality != null && numOrNull(sleep.quality) != null ? clampInt(Number(sleep.quality), 1, 5) : null,
    },
    water: { liters: numOrNull(water.liters) },
    alcohol: {
      drank: alcohol.drank === true ? true : alcohol.drank === false ? false : null,
      type: typeof alcohol.type === "string" ? alcohol.type : "",
      servings: numOrNull(alcohol.servings),
      servingVolumeMl: numOrNull(alcohol.servingVolumeMl),
      firstDrinkTime: typeof alcohol.firstDrinkTime === "string" ? alcohol.firstDrinkTime : "",
      firstDrinkUnknown: !!alcohol.firstDrinkUnknown,
      relativeAmount: alcohol.relativeAmount === "less" || alcohol.relativeAmount === "usual" || alcohol.relativeAmount === "more" ? alcohol.relativeAmount : "",
    },
    mood: { mood: typeof mood.mood === "string" && MOOD_OPTIONS.includes(mood.mood) ? mood.mood : null, note: typeof mood.note === "string" ? mood.note : "" },
    dinner: { dinner: dinner.dinner === true ? true : dinner.dinner === false ? false : null },
    wellness: {
      energy: numOrNull(wellness.energy) != null ? clampInt(Number(wellness.energy), 1, 5) : null,
      pain: numOrNull(wellness.pain) != null ? clampInt(Number(wellness.pain), 0, 10) : null,
      painArea: typeof wellness.painArea === "string" ? wellness.painArea : "",
      note: typeof wellness.note === "string" ? wellness.note : "",
    },
    dayFactor: {
      factor: (DAY_FACTOR_OPTIONS as readonly string[]).includes(dayFactor.factor) ? dayFactor.factor : "",
      note: typeof dayFactor.note === "string" ? dayFactor.note : "",
    },
  };
}

type ExistingActivityRow = {
  steps?: number; activeMinutes?: number; calories?: number; beers?: number; sleepHours?: number;
  workEndTime?: string; firstDrinkTime?: string; dinner?: number; walk?: number; waterLiters?: number;
  sleepStart?: string; sleepEnd?: string; sleepMinutes?: number; sleepQuality?: number | null;
  waterLogged?: number; alcoholType?: string; alcoholServings?: number; alcoholServingVolumeMl?: number;
  alcoholRelativeAmount?: string; alcoholLogged?: number; dayFactor?: string; dayFactorNote?: string;
};

export function saveEveningCheckin(body: any): ActionResult {
  const state = sanitizeState(body);
  if (!state) return { ok: false, error: "Некорректные данные чек-ина", status: 400 };

  // Единственный источник истины по вычислениям (длительность сна, нормализация
  // воды/алкоголя) — та же функция, что использует клиент для предпросмотра
  // сводки, но здесь её результат единственный, которому доверяет запись в БД.
  const validated = validateCheckinState(state);
  if (!validated.ok) return { ok: false, error: validated.errors[0]?.message || "Проверьте введённые данные", status: 400 };
  const payload = validated.payload;

  db.transaction(() => {
    const existing = (db.prepare(
      `SELECT steps,active_minutes activeMinutes,calories,beers,sleep_hours sleepHours,work_end_time workEndTime,
        first_drink_time firstDrinkTime,dinner,walk,water_liters waterLiters,
        sleep_start sleepStart,sleep_end sleepEnd,sleep_minutes sleepMinutes,sleep_quality sleepQuality,
        water_logged waterLogged,alcohol_type alcoholType,alcohol_servings alcoholServings,
        alcohol_serving_volume_ml alcoholServingVolumeMl,alcohol_relative_amount alcoholRelativeAmount,
        alcohol_logged alcoholLogged,day_factor dayFactor,day_factor_note dayFactorNote
       FROM daily_activity WHERE date=?`,
    ).get(payload.date) || {}) as ExistingActivityRow;

    // Длительность сна — заново из ISO-времён, присланных как результат общей
    // валидации (не то число минут, что могло бы прийти отдельным полем в теле
    // запроса): сервер не доверяет клиентскому расчёту длительности.
    const hasSleep = !!(payload.sleepStart && payload.sleepEnd);
    const sleepMinutes = hasSleep ? Math.round((Date.parse(payload.sleepEnd!) - Date.parse(payload.sleepStart!)) / 60000) : (existing.sleepMinutes || 0);
    const sleepStart = hasSleep ? payload.sleepStart! : (existing.sleepStart || "");
    const sleepEnd = hasSleep ? payload.sleepEnd! : (existing.sleepEnd || "");
    // Legacy-совместимость: sleep_hours как и раньше — часы, теперь производные от минут.
    const sleepHours = hasSleep ? Math.round((sleepMinutes / 60) * 100) / 100 : (existing.sleepHours || 0);
    const sleepQuality = hasSleep ? (payload.sleepQuality ?? null) : (existing.sleepQuality ?? null);

    const hasWater = payload.waterLiters != null;
    const waterLiters = hasWater ? payload.waterLiters! : (existing.waterLiters || 0);
    const waterLogged = hasWater ? 1 : (existing.waterLogged || 0);

    const hasAlcohol = !!payload.alcohol;
    const drank = hasAlcohol && payload.alcohol!.drank;
    const alcoholType = drank ? (payload.alcohol as any).type : hasAlcohol ? "" : (existing.alcoholType || "");
    const alcoholServings = drank ? (payload.alcohol as any).servings : hasAlcohol ? 0 : (existing.alcoholServings || 0);
    const alcoholServingVolumeMl = drank ? (payload.alcohol as any).servingVolumeMl : hasAlcohol ? 0 : (existing.alcoholServingVolumeMl || 0);
    const alcoholRelativeAmount = drank ? ((payload.alcohol as any).relativeAmount || "") : hasAlcohol ? "" : (existing.alcoholRelativeAmount || "");
    const firstDrinkTime = drank ? ((payload.alcohol as any).firstDrinkTime || "") : hasAlcohol ? "" : (existing.firstDrinkTime || "");
    const alcoholLogged = hasAlcohol ? 1 : (existing.alcoholLogged || 0);
    // Legacy `beers`: зеркалим только для пива — старая аналитика (lib/evening.ts)
    // никогда не понимала другие напитки, переводить их в "банки" не нужно и не точно.
    const beers = drank ? (alcoholType === "Пиво" ? alcoholServings : (existing.beers || 0)) : hasAlcohol ? 0 : (existing.beers || 0);

    const dinner = payload.dinner != null ? (payload.dinner ? 1 : 0) : (existing.dinner || 0);
    const dayFactor = payload.dayFactor ? payload.dayFactor.factor : (existing.dayFactor || "");
    const dayFactorNote = payload.dayFactor ? payload.dayFactor.note : (existing.dayFactorNote || "");

    db.prepare(`
      INSERT INTO daily_activity (
        date,steps,active_minutes,calories,beers,sleep_hours,work_end_time,first_drink_time,dinner,walk,water_liters,
        sleep_start,sleep_end,sleep_minutes,sleep_quality,water_logged,
        alcohol_type,alcohol_servings,alcohol_serving_volume_ml,alcohol_relative_amount,alcohol_logged,
        day_factor,day_factor_note
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(date) DO UPDATE SET
        beers=excluded.beers, sleep_hours=excluded.sleep_hours, first_drink_time=excluded.first_drink_time,
        dinner=excluded.dinner, water_liters=excluded.water_liters,
        sleep_start=excluded.sleep_start, sleep_end=excluded.sleep_end, sleep_minutes=excluded.sleep_minutes, sleep_quality=excluded.sleep_quality,
        water_logged=excluded.water_logged, alcohol_type=excluded.alcohol_type, alcohol_servings=excluded.alcohol_servings,
        alcohol_serving_volume_ml=excluded.alcohol_serving_volume_ml, alcohol_relative_amount=excluded.alcohol_relative_amount,
        alcohol_logged=excluded.alcohol_logged, day_factor=excluded.day_factor, day_factor_note=excluded.day_factor_note
    `).run(
      payload.date, existing.steps || 0, existing.activeMinutes || 0, existing.calories || 0, beers, sleepHours,
      existing.workEndTime || "", firstDrinkTime, dinner, existing.walk || 0, waterLiters,
      sleepStart, sleepEnd, sleepMinutes, sleepQuality, waterLogged,
      alcoholType, alcoholServings, alcoholServingVolumeMl, alcoholRelativeAmount, alcoholLogged,
      dayFactor, dayFactorNote,
    );

    // mood_logs: чек-ин владеет максимум одной строкой на дату — если для даты уже
    // есть запись, обновляем её при изменении значения; идентичный повтор не
    // создаёт дубль. Другие пути записи настроения (app/mood-section.tsx) по-прежнему
    // могут добавлять отдельные записи в течение дня — это не меняется.
    if (payload.mood) {
      const existingMood = db.prepare("SELECT id,mood,note FROM mood_logs WHERE date=? ORDER BY id DESC LIMIT 1").get(payload.date) as { id: number; mood: string; note: string } | undefined;
      if (!existingMood) {
        db.prepare("INSERT INTO mood_logs (date,mood,note) VALUES (?,?,?)").run(payload.date, payload.mood.mood, payload.mood.note);
      } else if (existingMood.mood !== payload.mood.mood || existingMood.note !== payload.mood.note) {
        db.prepare("UPDATE mood_logs SET mood=?,note=? WHERE id=?").run(payload.mood.mood, payload.mood.note, existingMood.id);
      }
    }

    // wellness_logs: тот же контракт ON CONFLICT(date), что и существующий action="wellness".
    if (payload.wellness) {
      const existingWellness = db.prepare("SELECT energy,pain,pain_area painArea,note FROM wellness_logs WHERE date=?").get(payload.date) as { energy: number; pain: number; painArea: string; note: string } | undefined;
      // energy/pain: колонки NOT NULL, а payload.wellness.energy/pain могут быть null
      // (пользователь сбросил выбор на "Пропустить") — тогда откатываемся к уже
      // сохранённому значению, а не выдумываем число. painArea/note такого требования
      // не имеют (колонки NOT NULL DEFAULT '' и пустая строка — валидное явное
      // значение), поэтому берём их из payload напрямую: иначе явная очистка
      // пользователем поля (пустая строка) молча откатывалась бы на старое значение
      // через "||" вместо того, чтобы его стереть.
      const energy = payload.wellness.energy ?? existingWellness?.energy ?? 3;
      const pain = payload.wellness.pain ?? existingWellness?.pain ?? 0;
      const painArea = payload.wellness.painArea;
      const note = payload.wellness.note;
      db.prepare(
        "INSERT INTO wellness_logs(date,energy,pain,pain_area,note) VALUES(?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET energy=excluded.energy,pain=excluded.pain,pain_area=excluded.pain_area,note=excluded.note",
      ).run(payload.date, energy, pain, painArea, note);
    }
  })();

  return { ok: true, summary: payload };
}
