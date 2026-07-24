const guides: Record<string, string> = {
  "Жим гантелей лёжа на горизонтальной скамье": "https://www.puregym.com/exercises/chest/bench-press/dumbbell-bench-press/",
  "Тяга одной гантели в наклоне с опорой на скамью": "https://www.puregym.com/exercises/back/rows/single-arm-dumbbell-row/",
  "Жим гантелей сидя над головой с опорой спины": "https://www.puregym.com/exercises/arms-and-shoulders/shoulder-press/dumbbell-shoulder-press/",
  "Попеременное сгибание рук с гантелями стоя": "https://www.puregym.com/exercises/arms-and-shoulders/bicep-curl/dumbbell-bicep-curls/",
  "Разгибание рук с гантелями лёжа — французский жим": "https://www.puregym.com/exercises/arms-and-shoulders/tricep-extension/skull-crushers/",
  "Разведение рук с гантелями лёжа на горизонтальной скамье": "https://www.puregym.com/exercises/chest/chest-fly/dumbbell-chest-fly/",
  "Планка на предплечьях": "https://www.puregym.com/exercises/abs/planks/",
  "Жим от груди в тренажёре сидя": "https://www.puregym.com/exercises/chest/bench-press/seated-chest-press/",
  "Сведение рук в тренажёре «бабочка»": "https://www.puregym.com/exercises/chest/chest-fly/machine-fly/",
  "Жим вверх в плечевом тренажёре сидя": "https://www.puregym.com/exercises/arms-and-shoulders/shoulder-press/shoulder-press-machine/",
  "Скручивания корпуса лёжа на полу": "https://www.puregym.com/exercises/abs/crunches/",
  "Тяга верхнего блока к груди широким хватом": "https://www.puregym.com/exercises/back/lat-exercises/lat-pulldown/",
  "Тяга канатной рукояти к лицу — face pull": "https://www.puregym.com/exercises/arms-and-shoulders/rear-delt-exercises/face-pulls/",
  "Разгибание ног в тренажёре сидя": "https://www.puregym.com/exercises/legs/quad-exercises/leg-extensions/",
  "Сгибание ног в тренажёре сидя": "https://www.puregym.com/exercises/legs/hamstring-exercises/hamstring-curls/seated-leg-curl/",
  "Подъём на носки стоя с опорой": "https://www.puregym.com/exercises/legs/calf-exercises/calf-raises/",
};

const searches: Record<string, string> = {
  "Отведение прямой ноги назад стоя (kick-back) с опорой на стул или стену": "standing leg kickback bodyweight correct form physical therapy",
  "Отведение согнутой ноги назад из упора на ладонях и коленях («донки-кик»)": "quadruped donkey kick correct form physical therapy",
  "Ходьба на месте с невысоким подъёмом коленей": "march in place low impact warm up correct form",
  "Круговые движения плечами стоя": "standing shoulder circles warm up correct form",
  "Сведение лопаток стоя без веса": "standing scapular retraction exercise correct form",
  "Попеременное вытяжение рук вверх": "alternating overhead reach warm up correct form",
  "Ровная аэробная поездка на шоссейном велосипеде": "road cycling endurance zone 2 correct riding technique",
  "Интервальное плавание кролем или на спине": "freestyle swimming technique beginner intervals correct form",
  "Отведение плеч в тренажёре сидя": "seated lateral raise machine correct form",
  "Разгибание рук в тренажёре сидя": "seated triceps extension machine correct form",
  "Горизонтальная тяга в тренажёре с независимыми рычагами": "chest supported selectorized row machine correct form",
  "Сгибание рук в тренажёре сидя": "selectorized biceps curl machine correct form",
  "Сгибание рук в тренажёре нейтральным хватом": "neutral grip biceps curl machine correct form",
  "Жим на верх груди в наклонном тренажёре сидя": "selectorized incline chest press machine correct form",
  "Разведение рук назад в тренажёре «обратная бабочка»": "reverse pec deck machine correct form",
  "Подъём согнутых ног лёжа на полу": "lying bent knee raise exercise correct form",
};

export function exerciseVideoUrl(name: string): string | null {
  if (guides[name]) return guides[name];
  const query = searches[name];
  return query ? `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` : null;
}
