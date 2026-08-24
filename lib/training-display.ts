const TRAINING_LABELS_RU: Readonly<Record<string, string>> = Object.freeze({
  "Strength A": "Силовая тренировка А",
  "Strength B": "Силовая тренировка Б",
  "Swim — Technique": "Плавание — техника",
  "Swim — Main aerobic session": "Плавание — аэробная тренировка",
  "Swim — Endurance": "Плавание — выносливость",
  "Bike / Indoor Cycling": "Велотренировка в зоне 2",
  "Machine Chest Press": "Жим от груди в тренажёре",
  "Lat Pulldown": "Тяга верхнего блока",
  "Seated Row": "Горизонтальная тяга сидя",
  "Machine Shoulder Press": "Жим над головой в тренажёре",
  "Cable Triceps Extension": "Разгибание рук на верхнем блоке",
  "Biceps Curl": "Сгибание рук на бицепс",
  "Pallof Press / safe core": "Жим Паллофа для корпуса",
  "Incline / Machine Chest Press": "Наклонный жим от груди в тренажёре",
  "Alternate Lat Pulldown": "Тяга верхнего блока другим хватом",
  "Seated / Cable Row": "Горизонтальная тяга на блоке сидя",
  "Reverse Fly": "Обратная бабочка",
  "Lateral Raise": "Отведение рук в стороны",
  "Triceps Extension": "Разгибание рук на трицепс",
  "Easy Zone 2": "Лёгкая работа в зоне 2",
  "VOLT Swim Foundation": "Базовый план VOLT Swim",
});

// Канонические названия остаются в плане, snapshot и истории. Перевод применяется
// только в UI, чтобы не разрывать сопоставление черновиков и прогрессии по имени.
export function trainingLabelRu(value: string): string {
  return TRAINING_LABELS_RU[value] ?? value;
}
