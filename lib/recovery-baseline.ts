// AI-13 — ограничитель роста нагрузки по измеренным сигналам восстановления.
//
// Главное правило: пороги ОТНОСИТЕЛЬНЫЕ, от личной базовой линии, а не
// абсолютные. У владельца сон стабильно 3.3–5.5 ч; абсолютный порог «спал
// меньше семи часов» срабатывал бы каждый день и прогрессия не сдвинулась бы
// никогда. Значимо не «мало», а «заметно меньше, чем обычно у тебя».
//
// Ограничитель НИКОГДА не снижает план — он только запрещает рост. Снижение
// остаётся за готовностью (lib/readiness.ts), где субъективная энергия весит
// столько же, сколько сон, и цифры не перебивают самочувствие.
//
// Медицинских выводов здесь нет и быть не должно (docs/AI_PRINCIPLES.md):
// ВСР и пульс покоя — контекст нагрузки, не диагноз.

export type RecoverySample={date:string;sleepSeconds:number|null;hrvRmssd:number|null;restingHr:number|null};

export type RecoveryBaseline={
 sleepHours:number|null;hrvRmssd:number|null;restingHr:number|null;
 days:number;sufficient:boolean;
};

export type RecoveryLimiter={
 allowGrowth:boolean;reasonCode:string;reason:string;usedSignals:string[];limitedData:boolean;
};

/** Минимум дней с данными, до которого базовая линия не считается осмысленной. */
export const MIN_BASELINE_DAYS=10;
/** Окно, по которому строится базовая линия. */
export const BASELINE_WINDOW_DAYS=28;

// Пороги отклонения вниз/вверх от личной базовой линии. Подобраны с запасом:
// задача — ловить выраженный провал, а не обычный разброс день ото дня.
export const SLEEP_DROP_RATIO=0.75;      // сон ниже 75% от обычного
export const HRV_DROP_RATIO=0.8;         // ВСР ниже 80% от обычной
export const RESTING_HR_RISE_RATIO=1.15; // пульс покоя выше обычного на 15%

const median=(values:number[]):number|null=>{
 if(!values.length)return null;
 const sorted=[...values].sort((a,b)=>a-b),middle=sorted.length>>1;
 return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;
};

const positives=(samples:RecoverySample[],pick:(s:RecoverySample)=>number|null)=>
 samples.map(pick).filter((value):value is number=>typeof value==="number"&&Number.isFinite(value)&&value>0);

/**
 * Базовая линия — медиана по окну, а не среднее: одна бессонная ночь или
 * разовый сбой датчика не должны сдвигать норму.
 *
 * `samples` — записи за окно, включая дни без данных: они нужны, чтобы
 * честно посчитать, на скольких днях базовая линия вообще стоит.
 */
export function buildRecoveryBaseline(samples:RecoverySample[]):RecoveryBaseline{
 const sleep=positives(samples,s=>s.sleepSeconds);
 const hrv=positives(samples,s=>s.hrvRmssd);
 const restingHr=positives(samples,s=>s.restingHr);
 const sleepMedian=median(sleep);
 // Достаточность считается по сну: это самый полный сигнал у Garmin, и без
 // него остальные сами по себе решение не принимают.
 const days=sleep.length;
 return {
  sleepHours:sleepMedian===null?null:sleepMedian/3600,
  hrvRmssd:median(hrv),
  restingHr:median(restingHr),
  days,
  sufficient:days>=MIN_BASELINE_DAYS,
 };
}

const allow=(reasonCode:string,reason:string,usedSignals:string[]=[],limitedData=false):RecoveryLimiter=>
 ({allowGrowth:true,reasonCode,reason,usedSignals,limitedData});

/**
 * Решение по сегодняшнему дню. Недостаток данных НЕ блокирует рост: незнание
 * не повод останавливать прогресс, оно лишь помечается `limitedData`.
 */
export function evaluateRecoveryLimiter(today:RecoverySample|null|undefined,baseline:RecoveryBaseline):RecoveryLimiter{
 if(!baseline.sufficient)
  return allow("baseline-insufficient",`Базовая линия строится: данных за ${baseline.days} дн. из ${MIN_BASELINE_DAYS} нужных.`,[],true);
 if(!today)
  return allow("no-data-today","За сегодня нет данных с часов — ограничение не применяется.",[],true);

 const signals:string[]=[];
 const sleepHours=typeof today.sleepSeconds==="number"&&today.sleepSeconds>0?today.sleepSeconds/3600:null;

 if(sleepHours!==null&&baseline.sleepHours!==null&&sleepHours<baseline.sleepHours*SLEEP_DROP_RATIO)
  signals.push(`сон ${sleepHours.toFixed(1)} ч против обычных ${baseline.sleepHours.toFixed(1)} ч`);
 if(today.hrvRmssd!==null&&today.hrvRmssd>0&&baseline.hrvRmssd!==null&&today.hrvRmssd<baseline.hrvRmssd*HRV_DROP_RATIO)
  signals.push(`ВСР ${today.hrvRmssd} против обычных ${baseline.hrvRmssd}`);
 if(today.restingHr!==null&&today.restingHr>0&&baseline.restingHr!==null&&today.restingHr>baseline.restingHr*RESTING_HR_RISE_RATIO)
  signals.push(`пульс покоя ${today.restingHr} против обычных ${baseline.restingHr}`);

 if(!signals.length)
  return allow("recovery-normal","Восстановление в пределах обычного — рост нагрузки допустим.");

 return {
  allowGrowth:false,
  reasonCode:"recovery-below-baseline",
  reason:`Показатели заметно ниже обычных (${signals.join("; ")}). Нагрузку не увеличиваем, текущую оставляем.`,
  usedSignals:signals,
  limitedData:false,
 };
}
