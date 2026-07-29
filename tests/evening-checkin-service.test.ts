import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.DATA_DIR = mkdtempSync(path.join(tmpdir(), "volt-evening-checkin-service-"));
const { db } = await import("@/lib/db.ts");
const { saveEveningCheckin } = await import("@/lib/evening-checkin-service.ts");

function activityRow(date: string) {
  return db.prepare(
    `SELECT * FROM daily_activity WHERE date=?`,
  ).get(date) as any;
}

test("аддитивная миграция v11 применена на схеме", () => {
  const row = db.prepare("SELECT 1 FROM schema_migrations WHERE version=11").get();
  assert.ok(row);
  // Старые записи (без новых полей) продолжают читаться — legacy-строка со старым
  // набором колонок всё ещё вставляется и новые колонки берут значения по умолчанию.
  db.prepare("INSERT INTO daily_activity (date,steps,beers,sleep_hours,water_liters) VALUES (?,?,?,?,?)").run("2020-01-01", 1000, 2, 7, 1.5);
  const row2 = activityRow("2020-01-01");
  assert.equal(row2.sleep_start, "");
  assert.equal(row2.water_logged, 0);
  assert.equal(row2.sleep_quality, null);
});

test("полное сохранение: сон, вода, алкоголь, настроение, ужин, самочувствие, фактор дня", () => {
  const date = "2026-07-28";
  const result = saveEveningCheckin({
    date,
    sleep: { startTime: "23:40", endTime: "07:10", quality: 4 },
    water: { liters: 1.75 },
    alcohol: { drank: true, type: "Пиво", servings: 3, servingVolumeMl: 450, firstDrinkTime: "21:35", firstDrinkUnknown: false, relativeAmount: "usual" },
    mood: { mood: "🙂", note: "Норм день" },
    dinner: { dinner: true },
    wellness: { energy: 4, pain: 1, painArea: "колено", note: "Немного побаливает" },
    dayFactor: { factor: "Работа", note: "Дедлайн" },
  });
  assert.equal(result.ok, true);
  const row = activityRow(date);
  assert.equal(row.sleep_start, "2026-07-27T23:40");
  assert.equal(row.sleep_end, "2026-07-28T07:10");
  assert.equal(row.sleep_minutes, 7 * 60 + 30);
  assert.equal(row.sleep_quality, 4);
  assert.equal(row.water_liters, 1.75);
  assert.equal(row.water_logged, 1);
  assert.equal(row.alcohol_type, "Пиво");
  assert.equal(row.alcohol_servings, 3);
  assert.equal(row.alcohol_serving_volume_ml, 450);
  assert.equal(row.first_drink_time, "21:35");
  assert.equal(row.beers, 3, "legacy beers зеркалит порции для типа Пиво");
  assert.equal(row.dinner, 1);
  assert.equal(row.day_factor, "Работа");

  const mood = db.prepare("SELECT mood,note FROM mood_logs WHERE date=?").get(date) as any;
  assert.equal(mood.mood, "🙂");
  const wellness = db.prepare("SELECT energy,pain,pain_area painArea FROM wellness_logs WHERE date=?").get(date) as any;
  assert.equal(wellness.pain, 1);
  assert.equal(wellness.painArea, "колено");
});

test("частичное сохранение: только вода — остальные поля не создают лишних записей/значений", () => {
  const date = "2026-07-29";
  const result = saveEveningCheckin({ date, water: { liters: 0.5 } });
  assert.equal(result.ok, true);
  const row = activityRow(date);
  assert.equal(row.water_liters, 0.5);
  assert.equal(row.water_logged, 1);
  assert.equal(row.sleep_start, "");
  assert.equal(row.alcohol_logged, 0);
  assert.equal(db.prepare("SELECT 1 FROM mood_logs WHERE date=?").get(date), undefined);
  assert.equal(db.prepare("SELECT 1 FROM wellness_logs WHERE date=?").get(date), undefined);
});

test("повторное сохранение той же даты не создаёт дублей и обновляет значения", () => {
  const date = "2026-07-30";
  saveEveningCheckin({ date, water: { liters: 1 }, mood: { mood: "😐", note: "" } });
  saveEveningCheckin({ date, water: { liters: 2 }, mood: { mood: "😊", note: "Стало лучше" } });
  const rows = db.prepare("SELECT COUNT(*) c FROM daily_activity WHERE date=?").get(date) as any;
  assert.equal(rows.c, 1);
  const moodRows = db.prepare("SELECT COUNT(*) c FROM mood_logs WHERE date=?").get(date) as any;
  assert.equal(moodRows.c, 1, "явное подтверждённое изменение обновляет ту же запись, не добавляет новую");
  const row = activityRow(date);
  assert.equal(row.water_liters, 2);
  const mood = db.prepare("SELECT mood,note FROM mood_logs WHERE date=?").get(date) as any;
  assert.equal(mood.mood, "😊");
});

test("повторное сохранение с теми же значениями идемпотентно (не создаёт лишних mood_logs)", () => {
  const date = "2026-07-31";
  saveEveningCheckin({ date, mood: { mood: "🙂", note: "Так себе" } });
  saveEveningCheckin({ date, mood: { mood: "🙂", note: "Так себе" } });
  const moodRows = db.prepare("SELECT COUNT(*) c FROM mood_logs WHERE date=?").get(date) as any;
  assert.equal(moodRows.c, 1);
});

test("серверный пересчёт сна: клиентское значение длительности игнорируется, пересчитывается из времён", () => {
  const date = "2026-08-01";
  // sleepMinutes в теле — не то поле, которое использует сервис (payload собирает
  // только sleep.startTime/endTime); даже если бы поле было передано отдельно,
  // источник истины — пересчёт из ISO-времён внутри сервиса.
  const result = saveEveningCheckin({ date, sleep: { startTime: "00:00", endTime: "08:00", quality: null } });
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.summary.sleepMinutes, 480);
  const row = activityRow(date);
  assert.equal(row.sleep_minutes, 480);
});

test("некорректные числа и enum отклоняются", () => {
  const badMood = saveEveningCheckin({ date: "2026-08-02", mood: { mood: "🤖", note: "" } });
  assert.equal(badMood.ok, false);

  const badWater = saveEveningCheckin({ date: "2026-08-02", water: { liters: 999 } });
  assert.equal(badWater.ok, false);

  const badAlcohol = saveEveningCheckin({ date: "2026-08-02", alcohol: { drank: true, type: "Пиво", servings: 3, servingVolumeMl: null, firstDrinkTime: "", firstDrinkUnknown: false, relativeAmount: "" } });
  assert.equal(badAlcohol.ok, false);

  const badSleep = saveEveningCheckin({ date: "2026-08-02", sleep: { startTime: "10:00", endTime: "09:00", quality: null } });
  assert.equal(badSleep.ok, false);

  const badDate = saveEveningCheckin({ date: "не дата", water: { liters: 1 } });
  assert.equal(badDate.ok, false);
});

test("существующие значения не стираются полями, которых нет в запросе", () => {
  const date = "2026-08-03";
  saveEveningCheckin({ date, water: { liters: 1.5 }, dinner: { dinner: true } });
  saveEveningCheckin({ date, mood: { mood: "😊", note: "" } });
  const row = activityRow(date);
  assert.equal(row.water_liters, 1.5, "вода не должна была стереться сохранением, где её нет в теле");
  assert.equal(row.dinner, 1);
});

test("явное подтверждённое значение обновляет существующее (в т.ч. на 0)", () => {
  const date = "2026-08-04";
  saveEveningCheckin({ date, water: { liters: 2 } });
  saveEveningCheckin({ date, water: { liters: 0 } });
  const row = activityRow(date);
  assert.equal(row.water_liters, 0);
  assert.equal(row.water_logged, 1);
});

test("самочувствие: явная очистка заметки/области боли (пустая строка) стирает старое значение, а не откатывает его", () => {
  const date = "2026-08-09";
  saveEveningCheckin({ date, wellness: { energy: 4, pain: 2, painArea: "колено", note: "Ноет после тренировки" } });
  saveEveningCheckin({ date, wellness: { energy: 5, pain: 2, painArea: "", note: "" } });
  const wellness = db.prepare("SELECT energy,pain,pain_area painArea,note FROM wellness_logs WHERE date=?").get(date) as any;
  assert.equal(wellness.energy, 5);
  assert.equal(wellness.painArea, "", "область боли должна очиститься, а не остаться 'колено'");
  assert.equal(wellness.note, "", "заметка должна очиститься, а не остаться прежней");
});

test("самочувствие: energy/pain, оставленные не отвеченными (null), не сбрасываются к дефолту, а сохраняют старое значение", () => {
  const date = "2026-08-10";
  saveEveningCheckin({ date, wellness: { energy: 4, pain: 3, painArea: "", note: "" } });
  // Явно приходит только заметка — energy/pain из тела запроса отсутствуют (null),
  // но payload.wellness всё равно формируется, потому что note.trim() непустой.
  saveEveningCheckin({ date, wellness: { energy: null, pain: null, painArea: "", note: "Добавил заметку" } });
  const wellness = db.prepare("SELECT energy,pain,note FROM wellness_logs WHERE date=?").get(date) as any;
  assert.equal(wellness.energy, 4, "energy не должна откатиться к дефолту 3 — старое значение сохранено");
  assert.equal(wellness.pain, 3, "pain не должна откатиться к дефолту 0 — старое значение сохранено");
  assert.equal(wellness.note, "Добавил заметку");
});

test("legacy-поля остаются совместимыми: sleep_hours обновляется вместе с новыми полями сна", () => {
  const date = "2026-08-05";
  saveEveningCheckin({ date, sleep: { startTime: "23:00", endTime: "07:00", quality: null } });
  const row = activityRow(date);
  assert.equal(row.sleep_hours, 8);
});

test("алкоголь: не-пивной напиток не зеркалится в legacy beers", () => {
  const date = "2026-08-06";
  saveEveningCheckin({ date, alcohol: { drank: true, type: "Вино", servings: 2, servingVolumeMl: 150, firstDrinkTime: "20:00", firstDrinkUnknown: false, relativeAmount: "" } });
  const row = activityRow(date);
  assert.equal(row.alcohol_type, "Вино");
  assert.equal(row.alcohol_servings, 2);
  assert.equal(row.beers, 0, "legacy beers не подменяется количеством вина");
});

test("алкоголь: подтверждённое 'не пил' явно сохраняет ноль и не трогает существующие ненулевые данные без нового подтверждения", () => {
  const date = "2026-08-07";
  saveEveningCheckin({ date, alcohol: { drank: true, type: "Пиво", servings: 2, servingVolumeMl: 500, firstDrinkTime: "20:00", firstDrinkUnknown: false, relativeAmount: "" } });
  saveEveningCheckin({ date, alcohol: { drank: false, type: "", servings: null, servingVolumeMl: null, firstDrinkTime: "", firstDrinkUnknown: false, relativeAmount: "" } });
  const row = activityRow(date);
  assert.equal(row.alcohol_servings, 0);
  assert.equal(row.beers, 0);
  assert.equal(row.alcohol_logged, 1);
});

test("LLM/AI Hub не вызываются сервисом чек-ина", () => {
  const source = readFileSync(path.resolve("lib/evening-checkin-service.ts"), "utf8");
  assert.equal(/ai-hub|ai-coach|anthropic|mws/i.test(source), false);
});

test("мульти-табличная транзакция откатывается целиком при ошибке в одной из таблиц", () => {
  const date = "2026-08-08";
  const realPrepare = db.prepare.bind(db);
  mock.method(db, "prepare", (sql: string) => {
    if (sql.trim().startsWith("INSERT INTO mood_logs")) return { run: () => { throw new Error("forced failure for atomicity test"); } } as any;
    return realPrepare(sql);
  });
  try {
    assert.throws(() => saveEveningCheckin({ date, water: { liters: 1.5 }, mood: { mood: "🙂", note: "" } }));
  } finally {
    mock.restoreAll();
  }
  assert.equal(activityRow(date), undefined, "daily_activity не должен был сохраниться — вся транзакция откатилась вместе с mood_logs");
});
