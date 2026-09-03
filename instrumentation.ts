const INTERVALS_SYNC_INTERVAL_MS = 3 * 60 * 60_000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { checkAndSendReminder } = await import("./lib/push");
  let running = false;
  setInterval(() => {
    if (running) return; // a previous run (e.g. a slow/hanging push send) is still in flight — skip this tick instead of piling up
    running = true;
    checkAndSendReminder().catch(() => {}).finally(() => { running = false; });
  }, 60_000);

  // Догоняющий разбор импортов, накопившихся до появления автоподтверждения
  // (docs/GARMIN_BRIDGE.md). Выполняется один раз на базу и пишет отчёт в лог:
  // владелец должен видеть, что именно приложение записало за него. Ошибка
  // разбора не должна мешать старту, поэтому она только логируется.
  try {
    const { runHistoricalBackfillOnce } = await import("./lib/import-auto-confirm");
    const report = runHistoricalBackfillOnce();
    if (report) {
      for (const item of report.confirmed) console.log(`[import-backfill] записан импорт ${item.importId}: ${item.date} — ${item.title}`);
      for (const item of report.skipped) console.log(`[import-backfill] оставлен на ручной разбор ${item.importId}: ${item.date ?? "дата неизвестна"} — ${item.reason}`);
      console.log(`[import-backfill] итог: записано ${report.confirmed.length}, осталось ${report.skipped.length}`);
    }
  } catch (error) { console.error("[import-backfill]", error); }

  // Подтягиваем тренировки из intervals.icu (docs/GARMIN_BRIDGE.md). Опрос —
  // базовый путь доставки: он не зависит от вебхуков и переживает простои.
  // Ошибки намеренно проглатываются: недоступность intervals.icu не должна
  // влиять на работу приложения, состояние видно в статусе интеграции.
  const { isIntervalsConfigured, syncIntervalsActivities, syncIntervalsWellness } = await import("./lib/intervals-service");
  if (!isIntervalsConfigured()) return;
  let syncing = false;
  const sync = () => {
    if (syncing) return;
    syncing = true;
    // Тренировки и wellness тянутся независимо: сбой одного не должен лишать
    // приложение другого. Сон и ВСР нужны ограничителю роста нагрузки (AI-13).
    Promise.allSettled([syncIntervalsActivities(), syncIntervalsWellness()]).finally(() => { syncing = false; });
  };
  setInterval(sync, INTERVALS_SYNC_INTERVAL_MS);
  sync();
}
