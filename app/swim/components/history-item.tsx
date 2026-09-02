import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { formatDuration, formatMeters } from "@/lib/swim-metrics";
import type { SwimHistoryItem as SwimHistoryItemType } from "@/app/swim/types";

const sourceLabel=(item:SwimHistoryItemType)=>item.source==="manual"?"Вручную":item.provider==="strava"?"Strava":item.provider==="garmin_fit"?"Гармин":"Импорт";

function dayNumber(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? iso : String(date.getDate());
}
function weekday(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  return Number.isNaN(date.getTime()) ? "" : new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date);
}

// Метрика журнала: значение + единица + подпись (docs/design/COMPONENTS.md —
// иконка не заменяет label, отсутствующие данные показываются честно).
function Metric({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  return (
    <div className="swim-history-metric">
      <b>
        {value ?? "—"}
        {value && unit ? <i>{unit}</i> : null}
      </b>
      <small>{label}</small>
    </div>
  );
}

// HistoryItem (docs/design/COMPONENTS.md) — запись журнала заплывов.
// Два визуальных веса вместо одинаковых строк таблицы: `featured` получает
// главный заплыв месяца (см. lib/swim/history-view.ts), остальные — компактную
// подачу. Дистанция в обоих случаях главная метрика записи.
// Интерактивна (Link + .swim-glass.interactive) только когда лог удалось
// связать с тренировкой программы — иначе информационная карточка без
// перехода в никуда (VOLT_SWIM.md: интерактивная ≠ информационная).
export function HistoryItem({ item, featured = false }: { item: SwimHistoryItemType; featured?: boolean }) {
  // Единица выносится в отдельную подпись под значением, поэтому из
  // форматтера берётся только число (formatMeters вернёт null, если данных нет).
  const distance = formatMeters(item.distanceMeters ?? 0);
  const distanceValue = distance ? distance.replace(" м", "") : null;

  const content = (
    <>
      <div className="swim-history-entry-day">
        <b>{dayNumber(item.date)}</b>
        <small>{weekday(item.date)}</small>
      </div>

      <div className="swim-history-entry-body">
        <div className="swim-history-entry-head">
          <strong>{item.title}</strong>
          <span className={`swim-badge ${item.source === "imported_metric" ? "synced" : ""}`}>{sourceLabel(item)}</span>
          {featured && <span className="swim-history-entry-flag">Лучший объём месяца</span>}
        </div>
        {featured && (
          <div className="swim-history-entry-metrics">
            <Metric label="Время" value={formatDuration(item.durationSeconds ?? 0)} />
            <Metric label="Темп" value={item.paceLabel} unit="/100м" />
            <Metric label="Пульс" value={item.avgHeartRate ? String(item.avgHeartRate) : null} unit="уд/мин" />
            {/* SWOLF — индикатор техники: время длины плюс гребки. Меньше лучше. */}
            <Metric label="SWOLF" value={item.avgSwolf ? String(item.avgSwolf) : null} />
            {item.effort && <Metric label="Нагрузка" value={item.effort} />}
          </div>
        )}
        {!featured && (
          <p className="swim-history-entry-line">
            <span>{formatDuration(item.durationSeconds ?? 0) ?? "—"}</span>
            <span>{item.paceLabel ? `${item.paceLabel}/100м` : "—"}</span>
            <span>{item.avgHeartRate ? `${item.avgHeartRate} уд/мин` : "—"}</span>
            {item.avgSwolf ? <span>SWOLF {item.avgSwolf}</span> : null}
          </p>
        )}
      </div>

      <div className="swim-history-entry-distance">
        <strong>{distanceValue ?? "—"}</strong>
        {distanceValue && <small>метров</small>}
      </div>

      {item.route && <ChevronRight size={17} className="swim-history-entry-chevron" aria-hidden="true" />}
    </>
  );

  const className = `swim-glass swim-history-entry${featured ? " featured" : ""}${item.route ? " interactive" : " no-route"}`;
  if (item.route) {
    return (
      <Link href={`/swim/workouts/${item.route.programId}/${item.route.workoutId}`} className={className}>
        {content}
      </Link>
    );
  }
  return <div className={className}>{content}</div>;
}
