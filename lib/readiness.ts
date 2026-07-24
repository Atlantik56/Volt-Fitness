export type ReadinessInputs={
  sleepHours:number;
  energy:number;
  pain:number;
  lastWorkoutPain:number;
};

export type ReadinessDecision={
  tone:"good"|"low"|"stop";
  title:string;
  text:string;
};

export type ReadinessResult={
  score:number;
  decision:ReadinessDecision;
};

const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,value));

export function calculateReadiness(raw:ReadinessInputs):ReadinessResult {
  const sleepHours=clamp(Number(raw.sleepHours)||0,0,24);
  const energy=clamp(Number(raw.energy)||3,1,5);
  const pain=clamp(Number(raw.pain)||0,0,10);
  const lastWorkoutPain=clamp(Number(raw.lastWorkoutPain)||0,0,10);
  const score=Math.round(Math.min(100,(sleepHours?Math.min(1,sleepHours/8)*40:20)+energy/5*40+(10-pain)/10*20));
  const decision:ReadinessDecision=pain>=5
    ?{tone:"stop",title:"Восстановление вместо нагрузки",text:"Суставам нужен щадящий день: прогулка без одышки и только безболезненная мобильность."}
    :score<55
      ?{tone:"low",title:"Сократи тренировку на один круг",text:"Работай с прежним весом, увеличь отдых и остановись при дискомфорте."}
      :lastWorkoutPain>=3
        ?{tone:"low",title:"Не увеличивай рабочие веса",text:"После прошлой тренировки отмечена боль. Сохрани нагрузку или выбери безопасную замену."}
        :{tone:"good",title:"План можно выполнять полностью",text:"Готовность достаточная. Добавляй нагрузку только при стабильной технике и отсутствии боли."};
  return {score,decision};
}
