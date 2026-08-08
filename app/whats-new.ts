export interface WhatsNewHighlight {
  title: string;
  text: string;
  target: string;
  activate?: string[];
}

export interface WhatsNewRelease {
  version: number;
  label: string;
  date: string;
  summary: string[];
  highlights: WhatsNewHighlight[];
}

export const WHATS_NEW_RELEASES: WhatsNewRelease[] = [
  {
    version: 1,
    label: "Спринты 5–6",
    date: "2026-07-25",
    summary: [
      "«Прогресс» переработан: сводка, графики по периодам 1М/3М/6М/1Г/Всё, карточки показателей, история замеров и приватное сравнение фото.",
      "«Аналитика» тренировок: выполнение плана, регулярность, объём по неделям и месяцам, самочувствие после нагрузки, личные рекорды и календарь нагрузки.",
      "Историю тренировок теперь можно выгрузить в CSV или JSON.",
    ],
    highlights: [
      { title: "Раздел «Прогресс»", text: "Здесь теперь сводка, графики по периодам и история замеров вместо одной большой формы.", target: ".journey-page", activate: ['[data-tour-id="nav-progress"]'] },
      { title: "Новый замер", text: "Форма компактная и открывается по кнопке — не занимает экран постоянно.", target: ".add-measurement-btn", activate: ['[data-tour-id="progress-body-tab"]'] },
      { title: "Раздел «Аналитика»", text: "Выполнение плана, регулярность, объём тренировок и самочувствие после нагрузки.", target: ".analytics-mode-tabs", activate: ['[data-tour-id="nav-analytics"], [data-tour-id="nav-analytics-mobile"]'] },
      { title: "Экспорт данных", text: "Выгрузи историю тренировок за период в CSV или JSON.", target: ".analytics-export-menu" },
      { title: "Динамика тренировок", text: "Здесь виден фактический тренировочный ритм за выбранный период.", target: ".analytics-trends-panel" },
    ],
  },
];

export const LATEST_WHATS_NEW_VERSION = WHATS_NEW_RELEASES.reduce((max, r) => Math.max(max, r.version), 0);

export function pendingReleases(seenVersion: number): WhatsNewRelease[] {
  return WHATS_NEW_RELEASES.filter((r) => r.version > seenVersion).sort((a, b) => a.version - b.version);
}
