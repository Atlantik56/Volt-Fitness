import { SearchX } from "lucide-react";
import { HistoryItem } from "./history-item";
import { groupHistoryByMonth } from "@/lib/swim/history-view";
import { formatKm } from "@/lib/swim-metrics";
import type { SwimHistoryItem } from "@/app/swim/types";

function sessionsLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} заплыв`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} заплыва`;
  return `${count} заплывов`;
}

// HistoryList (docs/design/COMPONENTS.md) — журнал разбит на месяцы-главы.
// Месяц несёт собственный итог (сколько проплыто), а внутри главы записи идут
// по «дорожке» с делениями — мотив дорожки бассейна из дизайн-контракта
// (VOLT_SWIM.md §Hero и мотив дорожки бассейна), а не строки таблицы.
// Пустой результат фильтра/поиска — честное отдельное состояние (отличается от
// «истории вообще нет», это решает экран, см. swim-history-screen.tsx).
export function HistoryList({ items, hasActiveFilter, onResetFilters }: { items: SwimHistoryItem[]; hasActiveFilter: boolean; onResetFilters: () => void }) {
  if (!items.length) {
    return (
      <div className="swim-glass swim-history-empty">
        <SearchX size={28} />
        <b>Ничего не найдено</b>
        <p>Под текущий фильтр или поиск ни одна тренировка не подходит.</p>
        {hasActiveFilter && (
          <button type="button" className="swim-btn secondary" onClick={onResetFilters}>
            Сбросить фильтры
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="swim-history-chapters">
      {groupHistoryByMonth(items).map((chapter) => (
        <section key={chapter.key} className="swim-history-chapter" aria-label={chapter.month}>
          <header className="swim-history-chapter-head">
            <h3>{chapter.month}</h3>
            <span>
              {sessionsLabel(chapter.totals.count)}
              {formatKm(chapter.totals.distanceMeters) ? ` · ${formatKm(chapter.totals.distanceMeters)}` : ""}
            </span>
          </header>
          <div className="swim-history-lane">
            {chapter.items.map((item) => (
              <HistoryItem key={item.id} item={item} featured={item.id === chapter.featuredId} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
