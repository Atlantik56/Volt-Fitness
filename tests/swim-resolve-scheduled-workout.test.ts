import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-swim-resolve-"));
const { db } = await import("@/lib/db.ts");
const { resolveScheduledSwimWorkout, getProgramProgress } = await import("@/lib/swim/services.ts");
const { getSwimHomeData } = await import("@/lib/swim-data.ts");
const { applyReplace, applyRest, applySwap } = await import("@/lib/week-schedule-service.ts");
const { weekRangeContaining, isoWeekdayOf, localIso } = await import("@/app/week-schedule-model.ts");
const { startWorkoutDraft, finishWorkoutDraft, confirmWorkoutDraft } = await import("@/lib/active-workout-service.ts");
const { swimWorkoutPlanKey } = await import("@/lib/swim/workout-plan-key.ts");
const { getProgram } = await import("@/lib/swim/program-engine.ts");
const { buildSwimSnapshot, buildConfirmationExercises, totalDistanceMeters } = await import("@/lib/swim/workout-engine.ts");

// Достаточно давний старт программы, чтобы фаза бассейна (Вт/Чт) точно
// действовала независимо от того, когда реально запускаются тесты.
db.prepare("UPDATE profile SET program_start=? WHERE id=1").run("2020-01-06");

const todayIso = localIso(new Date());
db.prepare("UPDATE profile SET swim_plan_started_at=? WHERE id=1").run(todayIso);
function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localIso(d);
}
// week_schedule_changes редактируется только в пределах текущей календарной
// недели (см. lib/week-schedule-service.ts:editabilityError) — все даты для
// переноса/замены/обмена/отдыха ниже намеренно "сегодня или позже" внутри
// текущей недели, иначе проекция (assignSwimCalendar идёт только вперёд от
// сегодня) честно не назначит тренировку на уже прошедшую дату.
function dateForWeekday(weekday: number): string {
  const { mondayIso } = weekRangeContaining(todayIso);
  const d = new Date(`${mondayIso}T00:00:00`);
  d.setDate(d.getDate() + (weekday - 1));
  return localIso(d);
}
function nextForwardWeekday(weekday: number): string {
  const candidate = dateForWeekday(weekday);
  return candidate >= todayIso ? candidate : addDays(candidate, 7);
}

const today = todayIso;
const thisWeekThursday = nextForwardWeekday(4);
const thisWeekFriday = nextForwardWeekday(5);
const nextWeekThursday = addDays(dateForWeekday(4), 7);

// Тест обмена (ниже) не может просто использовать `today`/`thisWeekThursday`
// напрямую: `today` иногда сам оказывается реальным Swim-слотом (Вт/Чт
// основного плана — см. комментарий в первом тесте), и тогда "обмен сегодня с
// ближайшим Вт/Чт" либо меняет местами два одинаковых дня (today===Чт),
// либо не демонстрирует переход не-Swim -> Swim вовсе (today уже был Swim).
// Поэтому явно ищем гарантированно НЕ-Swim день текущей недели, начиная от
// today и не раньше него (чтобы assignSwimCalendar честно спроецировал на
// него тренировку после обмена — проекция идёт только вперёд от сегодня, см.
// комментарий выше), и дополнительно пропускаем пятницу (5) — она отдельно
// зарезервирована ниже как thisWeekFriday в независимом сценарии "перенос",
// сценарии обмена и переноса не должны пересекаться по датам.
function firstIndependentNonSwimDate(fromIso: string): string {
  const SWIM_WEEKDAYS = new Set([2, 4]);
  const RESERVED_WEEKDAYS = new Set([...SWIM_WEEKDAYS, 5]);
  const { sundayIso } = weekRangeContaining(fromIso);
  for (let d = fromIso; d <= sundayIso; d = addDays(d, 1)) {
    if (!RESERVED_WEEKDAYS.has(isoWeekdayOf(d))) return d;
  }
  throw new Error("В текущей неделе не нашлось независимого не-Swim дня для теста обмена — не должно происходить");
}
const swapDayA = firstIndependentNonSwimDate(today);
// Четверг текущей (не обязательно будущей) недели — сознательно НЕ через
// nextForwardWeekday: обмену не нужна проекция вперёд для partner-дня
// (после обмена он честно перестаёт быть Swim-слотом — resolveScheduledSwimWorkout
// возвращает null уже на проверке isSwimSlot, до всякой проекции), а
// nextForwardWeekday в конце недели увёл бы дату в следующую неделю и сломал
// editabilityError ("редактировать можно только текущую неделю").
const swapDayB = dateForWeekday(4);

test("базовый Swim-слот открывает правильную тренировку Foundation (реальный Вт/Чт основного плана)", () => {
  const swim = resolveScheduledSwimWorkout(thisWeekThursday);
  assert.equal(swim?.kind, "workout");
  const rest = resolveScheduledSwimWorkout(today);
  // "Сегодня" в этом сценарии — не Вт/Чт (обычный день по умолчанию не Swim).
  if (isoWeekdayOf(today) !== 2 && isoWeekdayOf(today) !== 4) assert.equal(rest, null);
});

test("Главная VOLT и План Swim определяют одну тренировку для одной даты", () => {
  const slot = resolveScheduledSwimWorkout(thisWeekThursday);
  assert.equal(slot?.kind, "workout");
  const progress = getProgramProgress("foundation");
  const match = progress?.workouts.find((w) => w.calendar?.date === thisWeekThursday);
  assert.equal(match?.workout.id, (slot as any).workoutId);
  const home = getSwimHomeData();
  assert.equal(home.nextWorkout?.workoutId, progress?.nextWorkout?.workout.id);
  assert.equal(home.nextWorkout?.calendarDate, progress?.nextWorkout?.calendar?.date ?? null);
});

test("resolveScheduledSwimWorkout ведёт на /swim/workouts/[programId]/[workoutId], а не на старый универсальный интерфейс", () => {
  const slot = resolveScheduledSwimWorkout(thisWeekThursday);
  assert.equal(slot?.kind, "workout");
  assert.match((slot as any).route, /^\/swim\/workouts\/foundation\/w\d/);
});

test("обмен двух дней учитывается резолвером", () => {
  const result = applySwap({ dateA: swapDayA, dateB: swapDayB, todayIso: today });
  assert.equal(result.ok, true);
  assert.equal(resolveScheduledSwimWorkout(swapDayA)?.kind, "workout");
  assert.equal(resolveScheduledSwimWorkout(swapDayB), null);
});

test("перенос (замена дня шаблоном бассейна) создаёт новый Swim-слот", () => {
  const result = applyReplace({ date: thisWeekFriday, assignedSourceDay: 4, todayIso: today }); // шаблон четверга = бассейн
  assert.equal(result.ok, true);
  assert.equal(resolveScheduledSwimWorkout(thisWeekFriday)?.kind, "workout");
});

test("замена Swim другой активностью убирает тренировку с даты", () => {
  // swapDayA сейчас Swim (после обмена выше) — заменяем его на шаблон силовой.
  const result = applyReplace({ date: swapDayA, assignedSourceDay: 1, todayIso: today });
  assert.equal(result.ok, true);
  assert.equal(resolveScheduledSwimWorkout(swapDayA), null);
});

test("отдых вместо Swim не запускает плавание", () => {
  // thisWeekFriday сейчас Swim (после переноса выше) — заменяем на отдых.
  const result = applyRest({ date: thisWeekFriday, todayIso: today });
  assert.equal(result.ok, true);
  assert.equal(resolveScheduledSwimWorkout(thisWeekFriday), null);
});

let activeDraftId: number;
let activeWorkoutId: string;
test("active draft восстанавливается тем же резолвером", () => {
  const program = getProgram("foundation")!;
  // Все Swim-слоты текущей недели уже разобраны предыдущими тестами —
  // берём канонический (нетронутый) четверг следующей недели.
  const slotBefore = resolveScheduledSwimWorkout(nextWeekThursday);
  assert.equal(slotBefore?.kind, "workout");
  activeWorkoutId = (slotBefore as any).workoutId;
  const workout = program.weeks.flatMap((w) => w.days).find((d) => d.workout?.id === activeWorkoutId)!.workout!;
  const snapshot = buildSwimSnapshot(program, workout)!;
  const started = startWorkoutDraft({ date: nextWeekThursday, snapshot });
  assert.equal(started.ok, true);
  activeDraftId = started.draft!.id;

  const slotAfter = resolveScheduledSwimWorkout(nextWeekThursday);
  assert.equal(slotAfter?.kind, "workout");
  assert.equal((slotAfter as any).status, "in_progress");
  assert.equal((slotAfter as any).draftId, activeDraftId);
  assert.equal((slotAfter as any).workoutId, activeWorkoutId);
});

test("повторный запуск того же слота не создаёт дублирующий draft", () => {
  const program = getProgram("foundation")!;
  const workout = program.weeks.flatMap((w) => w.days).find((d) => d.workout?.id === activeWorkoutId)!.workout!;
  const snapshot = buildSwimSnapshot(program, workout)!;
  const again = startWorkoutDraft({ date: nextWeekThursday, snapshot });
  assert.equal(again.ok, true);
  assert.equal(again.draft!.id, activeDraftId);
  const count = (db.prepare("SELECT COUNT(*) n FROM workout_drafts WHERE date=? AND plan_key=?").get(nextWeekThursday, again.draft!.planKey) as any).n;
  assert.equal(count, 1);
});

test("awaiting_confirmation открывается корректно", () => {
  const finished = finishWorkoutDraft({ id: activeDraftId, expectedStatus: "active" });
  assert.equal(finished.ok, true);
  const slot = resolveScheduledSwimWorkout(nextWeekThursday);
  assert.equal(slot?.kind, "workout");
  assert.equal((slot as any).status, "awaiting_confirmation");
  assert.equal((slot as any).draftId, activeDraftId);
});

test("completed не запускается повторно и не переназначается", () => {
  const program = getProgram("foundation")!;
  const workout = program.weeks.flatMap((w) => w.days).find((d) => d.workout?.id === activeWorkoutId)!.workout!;
  const confirmed = confirmWorkoutDraft({
    id: activeDraftId, expectedStatus: "awaiting_confirmation", durationSeconds: 1500,
    distanceMeters: totalDistanceMeters(workout), effort: "Нормально", painAfter: 0,
    exercises: buildConfirmationExercises(workout),
  });
  assert.equal(confirmed.ok, true);

  const slot = resolveScheduledSwimWorkout(nextWeekThursday);
  assert.equal(slot?.kind, "workout");
  assert.equal((slot as any).status, "completed");
  assert.equal((slot as any).origin, "completed");
  assert.equal((slot as any).workoutId, activeWorkoutId);

  // Повторный вызов резолвера для той же даты не переоткрывает и не
  // переназначает другую тренировку — дата остаётся закреплена за фактом.
  // draftId у завершённой тренировки честно null (черновик уже не "открыт",
  // см. openDraftsByPlanKey в lib/swim/services.ts) — это не регрессия.
  const again = resolveScheduledSwimWorkout(nextWeekThursday);
  assert.equal((again as any).workoutId, activeWorkoutId);
  assert.equal((again as any).status, "completed");
});

test("Swim-слот существует, но тренировка Foundation не определена — честный unresolved, а не первая тренировка", () => {
  const program = getProgram("foundation")!;
  const all = program.weeks.flatMap((w) => w.days.filter((d) => d.workout).map((d) => d.workout!));
  for (let i = 0; i < all.length; i++) {
    const key = swimWorkoutPlanKey(program, all[i])!;
    const date = `2019-01-${String(i + 1).padStart(2, "0")}`;
    const logId = db.prepare("INSERT INTO workout_logs(date,type,title,distance_meters,duration_seconds,calories) VALUES (?,?,?,?,?,?)").run(date, "Плавание", all[i].title, 1000, 1200, 300).lastInsertRowid;
    db.prepare("INSERT INTO workout_drafts(date,plan_key,status,snapshot,workout_id) VALUES (?,?,'completed','{}',?)").run(date, key, logId);
  }
  // Все 12 тренировок Foundation уже выполнены — дальше проецировать нечего,
  // даже на честный будущий Swim-слот по канону основного плана.
  const farFuture = addDays(nextWeekThursday, 70);
  const slot = resolveScheduledSwimWorkout(farFuture);
  assert.equal(slot?.kind, "unresolved");
});
