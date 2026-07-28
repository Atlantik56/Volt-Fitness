// Общие чистые статистические примитивы. Единственное место, где определены
// avg/round1/daysBetween — остальные модули переиспользуют их отсюда.
//
// Контракт:
// - avg([]) === null, а не NaN. Отсутствие результата всегда null.
// - round1 округляет до одного знака и нормализует -0 в 0 (иначе отрицательные
//   дельты около нуля могут отрисоваться как "-0").
// - daysBetween(from, to) считает целые сутки между датами вида "YYYY-MM-DD",
//   всегда через UTC-полночь — не зависит от Date.now(), локали браузера или
//   текущей временной зоны. Некорректная дата даёт null, а не NaN.

export function avg(values: number[]): number | null {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
}

export function round1(n: number): number {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

export function daysBetween(from: string, to: string): number | null {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}
