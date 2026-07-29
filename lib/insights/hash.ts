// AI-4 — стабильность id/evidence (docs/INSIGHT_ENGINE.md "Стабильность id и evidence").
// Никакого ИИ и внешних вызовов — простой детерминированный хэш строк.

// djb2: не криптографический хэш, а стабильный "отпечаток" evidence-набора —
// нужен только чтобы обнаружить, что доказательная база существенно изменилась,
// а не как защита от подделки. Порядок элементов evidence не должен влиять на
// результат, поэтому массив всегда сортируется перед свёрткой.
export function hashEvidence(evidence: readonly string[], revision: string): string {
  const normalized = [...evidence].map(String).sort().join("|") + "::" + revision;
  let h = 5381;
  for (let i = 0; i < normalized.length; i++) {
    h = ((h << 5) + h + normalized.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

// Простая документированная шкала (docs/INSIGHT_ENGINE.md "Confidence"): растёт с
// размером выборки относительно домена минимально необходимого числа наблюдений,
// но никогда не достигает ложной уверенности 1.0 раньше, чем выборка многократно
// превысит порог. Не статистическая точность — только воспроизводимое число.
export function confidenceFromCount(count: number, minRequired: number): number {
  if (count <= 0 || minRequired <= 0) return 0;
  const raw = count / (count + minRequired);
  return Math.round(raw * 100) / 100;
}
