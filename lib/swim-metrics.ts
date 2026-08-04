// Чистые функции форматирования и расчёта метрик VOLT Swim. Никогда не
// подставляют 0/NaN/Infinity вместо отсутствующих данных — вызывающий код
// показывает «Нет данных», получив null.

export function formatMeters(meters: number): string | null {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return `${Math.round(meters)} м`;
}

export function formatKm(meters: number): string | null {
  if (!Number.isFinite(meters) || meters <= 0) return null;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} км`;
}

export function formatDuration(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${mm}:${ss}`;
}

// Темп на 100 м считается только при валидной дистанции и длительности —
// иначе легко получить Infinity (дистанция 0) или мнимую точность.
export function formatPace100m(distanceMeters: number, durationSeconds: number): string | null {
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) return null;
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const secondsPer100 = durationSeconds / (distanceMeters / 100);
  if (!Number.isFinite(secondsPer100) || secondsPer100 <= 0) return null;
  const total = Math.round(secondsPer100);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function weeklyVolumeMeters(logs: readonly { distanceMeters: number }[]): number {
  return logs.reduce((sum, log) => sum + (Number.isFinite(log.distanceMeters) && log.distanceMeters > 0 ? log.distanceMeters : 0), 0);
}
