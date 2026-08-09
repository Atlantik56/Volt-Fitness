import type { TrainingExerciseDefinition, TrainingWorkoutDefinition } from "@/lib/training-program/types";

export const LEGACY_HOME_EXERCISES: readonly TrainingExerciseDefinition[] = [
  ["Тяга одной гантели в наклоне с опорой на скамью", "Ладонь и колено на опоре, спина ровная. Веди локоть к тазу и медленно опускай гантель.", "10–12 / рука", "/exercises/one-arm-dumbbell-row.webp"],
  ["Попеременное сгибание рук с гантелями стоя", "Локти прижаты к корпусу. Поднимай гантель силой бицепса, не раскачивай тело.", "12–15", "/exercises/dumbbell-biceps-curl.webp"],
  ["Отведение прямой ноги назад стоя (kick-back) с опорой на стул или стену", "Держись за устойчивую опору, корпус и таз сохраняй неподвижными. Плавно отведи прямую ногу назад и немного вверх, сожми ягодицу и медленно верни. Не прогибай поясницу; амплитуда только комфортная.", "12 / нога", "/exercises/standing-leg-kickback.webp"],
  ["Жим гантелей сидя над головой с опорой спины", "Прижми спину к опоре, держи гантели у плеч. Выжми вверх без прогиба в пояснице.", "10–12", "/exercises/seated-dumbbell-press.webp"],
  ["Жим гантелей лёжа на горизонтальной скамье", "Лопатки сведены, стопы в пол. Опусти гантели к бокам груди и выжми вверх без удара локтями.", "10–12", "/exercises/dumbbell-bench-press.webp"],
  ["Отжимания от пола", "Ладони чуть шире плеч, пальцы направлены вперёд. Держи тело прямой линией, опускай грудь между ладонями и выжимай себя вверх без провала в пояснице.", "8–12", "/exercises/push-up.webp"],
  ["Разгибание рук с гантелями лёжа — французский жим", "Плечи вертикальны и неподвижны. Согни локти, опусти гантели к вискам и разогни руки.", "12–15", "/exercises/lying-triceps-extension.webp"],
  ["Разведение рук с гантелями лёжа на горизонтальной скамье", "Сохраняй мягкий сгиб локтей. Разведи руки дугой до уровня груди и сведи над грудью.", "10–12", "/exercises/dumbbell-chest-fly.webp"],
  ["Отведение согнутой ноги назад из упора на ладонях и коленях («донки-кик»)", "Ладони под плечами, колени под тазом, спина нейтральна. Сохраняя колено согнутым, плавно подними бедро назад-вверх до комфортной высоты и медленно опусти. Не разворачивай таз и не прогибай поясницу.", "12 / нога", "/exercises/quadruped-donkey-kick.webp"],
  ["Планка на предплечьях", "Локти под плечами, живот напряжён. Держи прямую линию от головы до пяток, не проваливай таз. Если тяжело — опусти колени на коврик и удерживай прямую линию от головы до колен.", "20–30 сек", "/exercises/forearm-plank.webp"],
];

export const LEGACY_HOME_WARMUP: readonly TrainingExerciseDefinition[] = [
  ["Ходьба на месте с невысоким подъёмом коленей", "Шагай мягко, держи корпус ровно и поднимай колени только до комфортной высоты. Без прыжков и боли в тазобедренном суставе.", "60 сек", "/warmup/march-in-place.webp"],
  ["Круговые движения плечами стоя", "Стой ровно, руки расслаблены. Медленно сделай круги плечами назад, затем вперёд; не запрокидывай голову.", "10 назад + 10 вперёд", "/warmup/shoulder-circles.webp"],
  ["Сведение лопаток стоя без веса", "Согни локти, мягко отведи их назад и сведи лопатки. Не прогибай поясницу и не поднимай плечи к ушам.", "12 повторений", "/warmup/scapular-retraction.webp"],
  ["Попеременное вытяжение рук вверх", "Поочерёдно тянись рукой вверх, сохраняя таз неподвижным. Не уходи в глубокий наклон и двигайся без рывков.", "8 раз каждой рукой", "/warmup/overhead-reach.webp"],
];

const WORKOUTS: readonly TrainingWorkoutDefinition[] = [
  {
    id: "legacy-home-strength", type: "Силовая", title: "Гантели по кругу", rounds: 2,
    image: "/exercises/dumbbell-bench-press.webp", exercises: LEGACY_HOME_EXERCISES, warmup: LEGACY_HOME_WARMUP,
  },
  {
    id: "legacy-walk-bike", type: "Кардио", title: "Ходьба или велосипед", rounds: 1,
    image: "/workouts/road-cycling.webp", exercises: [
      ["Разминка", "Лёгкий темп", "5 мин"],
      ["Основная часть", "Разговорный темп, без тяжёлых горок", "20–50 мин"],
      ["Заминка", "Постепенно снизить темп", "5 мин"],
    ],
  },
  {
    id: "legacy-pool", type: "Кардио", title: "Бассейн", rounds: 1,
    image: "/workouts/swimming-crawl.webp", exercises: [
      ["Разминка в воде", "100–150 м вольным стилем в лёгком темпе, без ускорений", "5 мин"],
      ["Основная часть", "Кроль или на спине, комфортный темп, свободное дыхание. Без брасса.", "20 мин"],
      ["Заминка", "Медленно, спокойное дыхание", "5 мин"],
    ],
  },
  {
    id: "legacy-recovery", type: "Восстановление", title: "Прогулка и мобильность", rounds: 1,
    image: "/workouts/recovery-walk.webp", exercises: [
      ["Спокойная прогулка", "Темп без одышки", "20–30 мин"],
      ["Лёгкая растяжка", "Без боли и резких движений", "5 мин"],
    ],
  },
  {
    id: "strength-a", type: "Силовая", title: "Strength A", rounds: 1,
    image: "/exercises/chest-press-machine.webp", exercises: [
      ["Machine Chest Press", "Спина прижата к спинке, рукояти на уровне середины груди. Выжми вперёд без блокировки локтей и подконтрольно верни.", "3 × 10–12", "/exercises/chest-press-machine.webp"],
      ["Lat Pulldown", "Грудь слегка вверх, корпус почти вертикален. Тяни перекладину к верхней части груди локтями вниз.", "3 × 10–12", "/exercises/lat-pulldown.webp"],
      ["Seated Row", "Сохраняй нейтральную спину. Веди локти назад к тазу, своди лопатки и плавно выпрямляй руки.", "3 × 10–12", "/exercises/seated-row-machine-v2.webp"],
      ["Machine Shoulder Press", "Прижми спину к опоре, поставь стопы устойчиво. Выжми рукояти вверх без прогиба в пояснице.", "2 × 10–12", "/exercises/shoulder-press-machine-v2.webp"],
      ["Cable Triceps Extension", "Локти прижаты к корпусу. Разогни руки без раскачивания плеч и медленно верни рукоять.", "2 × 12–15", "/exercises/triceps-extension-machine-v2.webp"],
      ["Biceps Curl", "Держи локти неподвижно, не раскачивай корпус. Согни руки и плавно опусти вес.", "2 × 12–15", "/exercises/biceps-curl-machine-v2.webp"],
      ["Pallof Press / safe core", "Стой устойчиво боком к блоку. Выжми рукоять перед собой, не позволяя корпусу разворачиваться; амплитуда только комфортная.", "3 подхода"],
    ],
  },
  {
    id: "strength-b", type: "Силовая", title: "Strength B", rounds: 1,
    image: "/exercises/incline-chest-press-machine-v2.webp", exercises: [
      ["Incline / Machine Chest Press", "Прижми спину к опоре. Выжми рукояти вперёд-вверх без блокировки локтей и плавно верни.", "3 × 10–12", "/exercises/incline-chest-press-machine-v2.webp"],
      ["Alternate Lat Pulldown", "Используй комфортный нейтральный или средний хват. Тяни локти вниз без раскачивания корпуса.", "3 × 10–12", "/exercises/lat-pulldown.webp"],
      ["Seated / Cable Row", "Сохраняй нейтральную спину и неподвижный корпус. Веди локти назад и плавно возвращай вес.", "3 × 10–12", "/exercises/seated-row-machine-v2.webp"],
      ["Reverse Fly", "Грудь остаётся у опоры. Разведи руки назад с мягкими локтями, сведи лопатки и медленно верни.", "2 × 12–15", "/exercises/reverse-pec-deck-machine-v2.webp"],
      ["Lateral Raise", "Подними руки в стороны до комфортного уровня без рывка и раскачивания корпуса.", "2 × 12–15", "/exercises/cable-lateral-raise.webp"],
      ["Biceps Curl", "Держи локти неподвижно, не раскачивай корпус. Согни руки и плавно опусти вес.", "2 × 12–15", "/exercises/biceps-curl-machine-v2.webp"],
      ["Triceps Extension", "Локти прижаты к корпусу. Разогни руки без движения плеч и плавно верни вес.", "2 × 12–15", "/exercises/triceps-extension-machine-v2.webp"],
      ["Pallof Press / safe core", "Стой устойчиво боком к блоку. Выжми рукоять перед собой, не позволяя корпусу разворачиваться; амплитуда только комфортная.", "3 подхода"],
    ],
  },
  {
    id: "bike-zone-2", type: "Кардио", title: "Bike / Indoor Cycling", rounds: 1,
    image: "/workouts/road-cycling.webp", availability: "planned", exercises: [
      ["Лёгкая разминка", "Начни с очень лёгкого сопротивления и спокойного каденса.", "5 мин"],
      ["Easy Zone 2", "Разговорный темп без интервалов и тяжёлого сопротивления. Пока велостанок недоступен, сессию можно оставить запланированной.", "15–25 мин"],
      ["Заминка", "Постепенно снизь сопротивление и темп.", "5 мин"],
    ],
  },
  {
    id: "swim-foundation", type: "Кардио", title: "VOLT Swim", rounds: 1,
    image: "/workouts/swimming-crawl.webp", exercises: [
      ["VOLT Swim Foundation", "Детальный состав, интервалы и фактический прогресс открываются из единого canonical program session.", "По плану Foundation"],
    ],
  },
  {
    id: "recovery", type: "Отдых", title: "Полный отдых", rounds: 0, image: "", exercises: [
      ["Восстановление", "Сон и спокойное восстановление без обязательной нагрузки.", "По самочувствию"],
    ],
  },
];

const WORKOUT_BY_ID = new Map(WORKOUTS.map((workout) => [workout.id, workout]));

export function getTrainingWorkout(workoutId: string): TrainingWorkoutDefinition {
  const workout = WORKOUT_BY_ID.get(workoutId);
  if (!workout) throw new Error(`Unknown training workout: ${workoutId}`);
  return workout;
}

export function listTrainingWorkouts(): readonly TrainingWorkoutDefinition[] {
  return WORKOUTS;
}
