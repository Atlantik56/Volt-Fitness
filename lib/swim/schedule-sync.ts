// Единая синхронизация календаря VOLT Swim с основным расписанием VOLT.
// Чистая функция (без обращения к БД): работает с уже разрешёнными
// HomeWeekDay/WeekScheduleChange из app/week-schedule-model.ts — тем же
// доменным builder'ом, которым пользуется главный план VOLT (app/page.tsx).
// Не создаёт отдельный алгоритм расписания и не хранит собственных дат:
// "слот плавания" — это любая дата, для которой resolvePlanForDate вернул
// активность {type:"Кардио", title:"Бассейн"} (см. app/personal-data.ts).
import { resolvePlanForDate, sessionsForDay, type HomeWeekDay, type WeekScheduleChange } from "@/app/week-schedule-model";
import type { SwimCalendarOrigin, SwimCalendarSlot } from "@/lib/swim/types";

export function isSwimSlot(day: Pick<HomeWeekDay, "type" | "title"> & Partial<Pick<HomeWeekDay, "sessions">>): boolean {
  return sessionsForDay(day as HomeWeekDay).some((session) =>
    session.type === "Кардио" && (session.title === "Бассейн" || session.id?.startsWith("swim-") === true),
  );
}

export type SwimScheduleWorkoutInput = {
  workoutId: string;
  status: "not_started" | "in_progress" | "awaiting_confirmation" | "completed";
  // Уже известная реальная дата (завершённый workout_log или открытый
  // черновик) — такие тренировки не проецируются заново, их дата закреплена.
  pinnedDate: string | null;
};

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Проецирует ещё не начатые тренировки Foundation на реальные Swim-слоты
// основного расписания VOLT, идя вперёд от сегодняшнего дня по порядку
// программы. Завершённые и активные тренировки не пересчитываются — их дата
// уже известна (pinnedDate), и они резервируют свою дату, чтобы её не занял
// спроецированный слот.
export function assignSwimCalendar(params: {
  workouts: readonly SwimScheduleWorkoutInput[];
  homeWeek: readonly HomeWeekDay[];
  changesByDate: ReadonlyMap<string, WeekScheduleChange>;
  todayIso: string;
  // Точка старта проекции отделена от todayIso: расписание Foundation должно
  // оставаться стабильным при смене календарного дня, а isToday — обновляться.
  scheduleStartIso?: string;
  horizonDays?: number;
}): Map<string, SwimCalendarSlot> {
  const { workouts, homeWeek, changesByDate, todayIso, scheduleStartIso = todayIso, horizonDays = 220 } = params;
  const result = new Map<string, SwimCalendarSlot>();
  const usedDates = new Set<string>();

  for (const w of workouts) {
    if (!w.pinnedDate) continue;
    const resolved = resolvePlanForDate(w.pinnedDate, homeWeek as HomeWeekDay[], changesByDate as Map<string, WeekScheduleChange>);
    const origin: SwimCalendarOrigin = w.status === "completed" ? "completed" : "active";
    result.set(w.workoutId, {
      date: w.pinnedDate,
      weekday: resolved.weekday,
      isToday: w.pinnedDate === todayIso,
      origin,
      scheduleChangeId: resolved.changeId,
    });
    usedDates.add(w.pinnedDate);
  }

  const pending = workouts.filter((w) => !w.pinnedDate && w.status === "not_started");
  if (!pending.length) return result;

  let pendingIndex = 0;
  for (let offset = 0; offset < horizonDays && pendingIndex < pending.length; offset++) {
    const dateIso = addDaysIso(scheduleStartIso, offset);
    // После перехода с 2 на 3 Swim-слота не заполняем задним числом свободный
    // слот прошлой недели. Завершённые/активные тренировки уже закреплены выше,
    // а новый pending может назначаться только на сегодня или будущее.
    if (dateIso < todayIso) continue;
    if (usedDates.has(dateIso)) continue;
    const resolved = resolvePlanForDate(dateIso, homeWeek as HomeWeekDay[], changesByDate as Map<string, WeekScheduleChange>);
    if (!isSwimSlot(resolved.scheduled)) continue;
    const workout = pending[pendingIndex];
    result.set(workout.workoutId, {
      date: dateIso,
      weekday: resolved.weekday,
      isToday: dateIso === todayIso,
      origin: "projected",
      scheduleChangeId: resolved.changeId,
    });
    usedDates.add(dateIso);
    pendingIndex++;
  }
  return result;
}
