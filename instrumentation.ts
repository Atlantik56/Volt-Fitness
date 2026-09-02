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
