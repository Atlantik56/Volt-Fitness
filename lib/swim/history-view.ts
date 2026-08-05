// Презентационная модель Истории: группировка по месяцам, итоги журнала и
// выбор «главного заплыва месяца». Чистые функции без БД и без React —
// журнал остаётся детерминированным и тестируемым.
//
// Это НЕ аналитика Sprint 3 (тренды, рекорды, heatmap, сравнения периодов):
// здесь только суммы того, что пользователь уже видит на экране, без дельт,
// прогнозов и оценок. Отсутствующие метрики не заменяются нулём — они просто
// не участвуют в сумме (см. lib/swim-metrics.ts).
import type { SwimHistoryItem } from "@/app/swim/types";

export type SwimHistoryTotals = {
  count: number;
  distanceMeters: number;
  durationSeconds: number;
};

export type SwimHistoryChapter = {
  key: string;
  month: string;
  totals: SwimHistoryTotals;
  // id самого длинного заплыва месяца — единственная запись, получающая
  // укрупнённую подачу. Факт из данных, а не выдуманный инсайт; null, когда
  // ни у одной записи месяца нет дистанции.
  featuredId: number | null;
  items: SwimHistoryItem[];
};

export function summarizeHistory(items: readonly SwimHistoryItem[]): SwimHistoryTotals {
  return items.reduce<SwimHistoryTotals>(
    (totals, item) => ({
      count: totals.count + 1,
      distanceMeters: totals.distanceMeters + (item.distanceMeters ?? 0),
      durationSeconds: totals.durationSeconds + (item.durationSeconds ?? 0),
    }),
    { count: 0, distanceMeters: 0, durationSeconds: 0 },
  );
}

function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

function monthLabel(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const label = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Порядок записей сохраняется как пришёл с сервера (дата по убыванию,
// см. lib/swim-data.ts) — группировка не пересортировывает журнал.
export function groupHistoryByMonth(items: readonly SwimHistoryItem[]): SwimHistoryChapter[] {
  const chapters: SwimHistoryChapter[] = [];
  for (const item of items) {
    const key = monthKey(item.date);
    const current = chapters.at(-1);
    if (current && current.key === key) current.items.push(item);
    else chapters.push({ key, month: monthLabel(item.date), totals: { count: 0, distanceMeters: 0, durationSeconds: 0 }, featuredId: null, items: [item] });
  }
  return chapters.map((chapter) => {
    const withDistance = chapter.items.filter((item) => (item.distanceMeters ?? 0) > 0);
    const best = withDistance.reduce<SwimHistoryItem | null>(
      (leader, item) => (!leader || (item.distanceMeters ?? 0) > (leader.distanceMeters ?? 0) ? item : leader),
      null,
    );
    return { ...chapter, totals: summarizeHistory(chapter.items), featuredId: best?.id ?? null };
  });
}
