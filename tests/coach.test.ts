import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCoachResult,
  buildCoachSummary,
  COACH_MAX_ADVICE,
  type CoachInput,
} from "../lib/coach.ts";

const DATE="2026-07-25";
const ids=(input:CoachInput)=>buildCoachResult(input).advice.map(x=>x.id);
const strengthPlan={title:"Гантели по кругу",type:"Силовая"};

// Обычный день: данные заполнены, всё в норме.
const normalDay=():CoachInput=>({
  date:DATE,
  plan:strengthPlan,
  wellnessLogs:[{date:DATE,energy:4,pain:0,painArea:""}],
  activity:[{date:DATE,sleepHours:7.5,steps:8000,activeMinutes:60}],
  foodLogs:[{date:DATE,calories:1500,protein:140,fat:50,carbs:150}],
  workouts:[],
  measurements:[{date:DATE,weight:83}],
  profile:{targetWeight:67},
});

test("нормальный день: предлагает тренировку и не паникует", ()=>{
  const result=buildCoachResult(normalDay());
  assert.deepEqual(result.advice.map(x=>x.id),["workout-todo"]);
  assert.equal(result.summary.pain,0);
  assert.equal(result.summary.nutrition.logged,true);
});

test("отсутствие данных: Coach остаётся полезным и ничего не выдумывает", ()=>{
  const result=buildCoachResult({date:DATE});
  const summary=result.summary;
  assert.equal(summary.sleepHours,null);
  assert.equal(summary.energy,null);
  assert.equal(summary.pain,null);
  assert.equal(summary.steps,null);
  assert.equal(summary.nutrition.calories,null);
  assert.equal(summary.hasWellness,false);
  assert.deepEqual(result.advice.map(x=>x.id),["food-unlogged","wellness-missing"]);
  // Ни один совет не ссылается на несуществующие показатели.
  assert.equal(result.advice.some(x=>/NaN|null|undefined/.test(x.reason)),false);
});

test("отсутствие Gemini API не влияет на Coach: результат детерминирован", ()=>{
  // Coach не обращается к Gemini вовсе, поэтому его отсутствие не меняет вывод.
  const input=normalDay();
  assert.deepEqual(buildCoachResult(input),buildCoachResult(input));
  assert.deepEqual(ids(input),["workout-todo"]);
});

test("ошибка распознавания еды: ничего не сохранено — это «нет данных», а не ноль", ()=>{
  // Распознавание упало, пользователь ничего не сохранил.
  const result=buildCoachResult({...normalDay(),foodLogs:[]});
  assert.equal(result.summary.nutrition.logged,false);
  assert.equal(result.summary.nutrition.calories,null);
  assert.ok(result.advice.some(x=>x.id==="food-unlogged"));
  // Пустой дневник не должен трактоваться как экстремально низкая калорийность.
  assert.equal(result.advice.some(x=>x.id==="calories-too-low"),false);
});

test("неподтверждённый результат сканирования не попадает в Coach", ()=>{
  // Распознанное, но не сохранённое питание живёт только в форме и в БД не появляется.
  // Запись за другую дату так же не должна засчитываться за сегодня.
  const result=buildCoachResult({...normalDay(),foodLogs:[{date:"2026-07-24",calories:1800,protein:150}]});
  assert.equal(result.summary.nutrition.logged,false);
  assert.equal(result.summary.nutrition.meals,0);
  assert.ok(result.advice.some(x=>x.id==="food-unlogged"));
});

test("подтверждённое питание учитывается", ()=>{
  const result=buildCoachResult({...normalDay(),foodLogs:[
    {date:DATE,calories:600,protein:60,fat:20,carbs:50},
    {date:DATE,calories:700,protein:70,fat:20,carbs:60},
  ]});
  assert.equal(result.summary.nutrition.logged,true);
  assert.equal(result.summary.nutrition.meals,2);
  assert.equal(result.summary.nutrition.calories,1300);
  assert.equal(result.summary.nutrition.protein,130);
  assert.equal(result.advice.some(x=>x.id==="food-unlogged"),false);
});

test("низкий белок", ()=>{
  const advice=ids({...normalDay(),foodLogs:[{date:DATE,calories:1500,protein:60,fat:50,carbs:150}]});
  assert.ok(advice.includes("protein-low"));
});

test("слишком низкая калорийность", ()=>{
  const result=buildCoachResult({...normalDay(),foodLogs:[{date:DATE,calories:900,protein:120,fat:30,carbs:60}]});
  const advice=result.advice.map(x=>x.id);
  assert.ok(advice.includes("calories-too-low"));
  // Из категории «питание» остаётся один совет, а не два подряд.
  assert.equal(result.advice.filter(x=>x.category==="nutrition").length,1);
});

test("сон менее 6 часов", ()=>{
  const advice=ids({...normalDay(),activity:[{date:DATE,sleepHours:4.5,steps:8000,activeMinutes:60}]});
  assert.ok(advice.includes("sleep-short"));
});

test("низкая энергия", ()=>{
  const advice=ids({...normalDay(),wellnessLogs:[{date:DATE,energy:2,pain:0,painArea:""}]});
  assert.ok(advice.includes("energy-low"));
});

test("боль 5 и выше исключает тяжёлую тренировку и рост нагрузки", ()=>{
  const result=buildCoachResult({...normalDay(),wellnessLogs:[{date:DATE,energy:4,pain:6,painArea:"Тазобедренные"}],activity:[{date:DATE,sleepHours:7.5,steps:1000,activeMinutes:10}]});
  const advice=result.advice.map(x=>x.id);
  assert.equal(advice[0],"pain-high");
  assert.equal(advice.includes("workout-todo"),false);
  assert.equal(advice.includes("steps-low"),false);
  assert.equal(result.advice[0].tone,"stop");
});

test("выполненная тренировка не предлагается повторно", ()=>{
  const result=buildCoachResult({...normalDay(),workouts:[{date:DATE,type:"Силовая",title:"Гантели по кругу",painAfter:0}]});
  const advice=result.advice.map(x=>x.id);
  assert.equal(result.summary.workoutDone,true);
  assert.equal(advice.includes("workout-todo"),false);
  assert.ok(advice.includes("keep-going"));
});

test("несколько конфликтующих условий: не более трёх согласованных советов", ()=>{
  const result=buildCoachResult({
    date:DATE,
    plan:strengthPlan,
    wellnessLogs:[{date:DATE,energy:1,pain:7,painArea:"Колени"}],
    activity:[{date:DATE,sleepHours:4,steps:900,activeMinutes:5}],
    foodLogs:[],
    workouts:[{date:"2026-07-23",painAfter:4}],
    measurements:[],
    profile:{targetWeight:67},
  });
  const advice=result.advice.map(x=>x.id);
  assert.ok(result.advice.length<=COACH_MAX_ADVICE);
  assert.equal(advice[0],"pain-high");
  // Нагрузочные советы подавлены болью, противоречий нет.
  assert.equal(advice.includes("workout-todo"),false);
  assert.equal(advice.includes("steps-low"),false);
  // Каждая категория представлена не более одного раза.
  assert.equal(new Set(result.advice.map(x=>x.category)).size,result.advice.length);
});

test("временное увеличение веса подаётся как колебание, а не откат", ()=>{
  const advice=ids({...normalDay(),measurements:[
    {date:DATE,weight:83.5},
    {date:"2026-07-23",weight:83},
    {date:"2026-07-05",weight:85},
  ],workouts:[{date:DATE,painAfter:0}]});
  assert.ok(advice.includes("weight-fluctuation"));
});

test("ноль отличается от отсутствия данных", ()=>{
  // Строка активности есть, шаги действительно равны нулю.
  const withZero=buildCoachSummary({date:DATE,activity:[{date:DATE,steps:0,activeMinutes:0,sleepHours:7}]});
  assert.equal(withZero.steps,0);
  assert.equal(withZero.activeMinutes,0);
  assert.ok(ids({date:DATE,activity:[{date:DATE,steps:0,activeMinutes:0,sleepHours:7}]}).includes("steps-low"));

  // Строки активности нет — данных нет, правило по шагам не срабатывает.
  const withoutRow=buildCoachSummary({date:DATE});
  assert.equal(withoutRow.steps,null);
  assert.equal(ids({date:DATE}).includes("steps-low"),false);

  // Сон, сохранённый нулём формой активности, считается незаполненным.
  assert.equal(buildCoachSummary({date:DATE,activity:[{date:DATE,steps:5000,sleepHours:0}]}).sleepHours,null);
});

test("каждый совет содержит причину, лимит соблюдён", ()=>{
  const inputs:CoachInput[]=[
    normalDay(),
    {date:DATE},
    {...normalDay(),wellnessLogs:[{date:DATE,energy:1,pain:9,painArea:"Спина"}],foodLogs:[]},
    {...normalDay(),workouts:[{date:DATE,painAfter:0}]},
  ];
  for(const input of inputs){
    const result=buildCoachResult(input);
    assert.ok(result.advice.length<=COACH_MAX_ADVICE);
    for(const item of result.advice){
      assert.ok(item.reason.trim().length>0,`совет ${item.id} без причины`);
      assert.ok(item.title.trim().length>0,`совет ${item.id} без действия`);
    }
  }
});

test("P1: pain-persistent достижим при сильной боли и не дублирует pain-high", ()=>{
  const result=buildCoachResult({...normalDay(),wellnessLogs:[{date:DATE,energy:3,pain:9,painArea:"Спина"}]});
  const advice=result.advice.map(x=>x.id);
  assert.ok(advice.includes("pain-high"),"основной защитный совет должен остаться");
  assert.ok(advice.includes("pain-persistent"),"эскалация к врачу больше не должна теряться");
  // Это разные действия, а не два почти одинаковых дубля.
  assert.equal(advice.indexOf("pain-high")<advice.indexOf("pain-persistent"),true);
  const titles=new Set(result.advice.map(x=>x.title));
  assert.equal(titles.size,result.advice.length,"советы не должны повторять друг друга");
});

test("P1: устойчивая боль поднимает эскалацию даже без пиковой боли сегодня", ()=>{
  const result=buildCoachResult({...normalDay(),wellnessLogs:[
    {date:DATE,energy:3,pain:5,painArea:"Колени"},
    {date:"2026-07-24",energy:3,pain:6,painArea:"Колени"},
    {date:"2026-07-23",energy:3,pain:5,painArea:"Колени"},
  ]});
  const advice=result.advice.map(x=>x.id);
  assert.equal(result.summary.recentPainDays,3);
  assert.ok(advice.includes("pain-persistent"));
  assert.match(result.advice.find(x=>x.id==="pain-persistent")!.reason,/держится 3 дн/);
});

test("P1: старая боль вне недельного окна не считается устойчивой", ()=>{
  const result=buildCoachResult({...normalDay(),wellnessLogs:[
    {date:DATE,energy:3,pain:2,painArea:""},
    {date:"2026-07-10",energy:3,pain:8,painArea:""},
    {date:"2026-07-09",energy:3,pain:8,painArea:""},
    {date:"2026-07-08",energy:3,pain:8,painArea:""},
  ]});
  assert.equal(result.summary.recentPainDays,0);
  assert.equal(result.advice.map(x=>x.id).includes("pain-persistent"),false);
});

test("P1: workout-no-progression не теряется рядом с workout-todo", ()=>{
  const result=buildCoachResult({...normalDay(),workouts:[{date:"2026-07-23",painAfter:6}]});
  const advice=result.advice.map(x=>x.id);
  assert.ok(advice.includes("workout-todo"),"общий совет тренироваться может остаться");
  assert.ok(advice.includes("workout-no-progression"),"предупреждение по нагрузке не должно теряться");
  // Сначала «выполни тренировку», затем «не повышай веса» — согласованная пара.
  assert.ok(advice.indexOf("workout-todo")<advice.indexOf("workout-no-progression"));
});

test("P1: при боли ≥5 предупреждение по весам не противоречит отказу от нагрузки", ()=>{
  const advice=ids({...normalDay(),
    wellnessLogs:[{date:DATE,energy:3,pain:6,painArea:""}],
    workouts:[{date:"2026-07-23",painAfter:6}],
  });
  assert.ok(advice.includes("pain-high"));
  assert.equal(advice.includes("workout-no-progression"),false,"тренировки нет — совет про веса был бы противоречив");
  assert.equal(advice.includes("workout-todo"),false);
});

test("P1: до загрузки данных Coach не делает утверждений", ()=>{
  const notReady=buildCoachResult({...normalDay(),ready:false,wellnessLogs:[],foodLogs:[],workouts:[],activity:[]});
  assert.deepEqual(notReady.advice,[],"на пустом состоянии не должно быть ни одного совета");
});

test("P1: ошибка загрузки не превращается в советы по пустым данным", ()=>{
  // Начальное состояние экрана: пустые массивы, ответ API не получен.
  const failed=buildCoachResult({
    date:DATE,ready:false,plan:strengthPlan,
    workouts:[],measurements:[],activity:[],
    profile:{name:"Илья",targetWeight:67},
  });
  assert.deepEqual(failed.advice,[]);
  // Те же данные после успешной загрузки уже дают советы.
  const loaded=buildCoachResult({
    date:DATE,ready:true,plan:strengthPlan,
    workouts:[],measurements:[],activity:[],
    profile:{name:"Илья",targetWeight:67},
  });
  assert.ok(loaded.advice.length>0);
});

test("P1: приоритеты уникальны — порядок не зависит от порядка объявления", ()=>{
  const conflicting:CoachInput={
    date:DATE,plan:strengthPlan,
    wellnessLogs:[{date:DATE,energy:1,pain:2,painArea:""}],
    activity:[{date:DATE,sleepHours:4,steps:800,activeMinutes:5}],
    foodLogs:[{date:DATE,calories:800,protein:30}],
    workouts:[{date:"2026-07-23",painAfter:5}],
    measurements:[],
  };
  const runs=new Set(Array.from({length:50},()=>JSON.stringify(ids(conflicting))));
  assert.equal(runs.size,1,"результат должен быть стабильным");
  const advice=buildCoachResult(conflicting).advice;
  // Приоритеты строго возрастают, значит порядок задан явно.
  for(let i=1;i<advice.length;i++)assert.ok(advice[i-1].priority<advice[i].priority);
});

test("день отдыха не превращается в тренировочный совет", ()=>{
  const advice=ids({...normalDay(),plan:{title:"Полный отдых",type:"Отдых"}});
  assert.ok(advice.includes("rest-day"));
  assert.equal(advice.includes("workout-todo"),false);
});
