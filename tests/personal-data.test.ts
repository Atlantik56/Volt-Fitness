import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { currentProgramWeek, buildHomeWeek, buildProgramWeek } from "../app/personal-data.ts";
import { sessionsForDay } from "../app/week-schedule-model.ts";

function withNow(iso: string, fn: () => void) {
 mock.timers.enable({ apis: ["Date"], now: new Date(`${iso}T12:00:00`) });
 try { fn() } finally { mock.timers.reset() }
}

test("currentProgramWeek: старт во вторник, неделя 2 начинается в следующий понедельник, а не через 7 дней", () => {
 // Старт 2026-07-21 (вторник). Через 7 суток (2026-07-28, вторник) по старой формуле
 // была бы неделя 2 — по факту неделя 2 должна начаться раньше, в понедельник 2026-07-27.
 withNow("2026-07-26", () => assert.equal(currentProgramWeek("2026-07-21"), 1)); // воскресенье той же недели
 withNow("2026-07-27", () => assert.equal(currentProgramWeek("2026-07-21"), 2)); // понедельник — уже неделя 2
 withNow("2026-08-02", () => assert.equal(currentProgramWeek("2026-07-21"), 2)); // воскресенье недели 2
 withNow("2026-08-03", () => assert.equal(currentProgramWeek("2026-07-21"), 3)); // понедельник недели 3
});

test("currentProgramWeek: старт в понедельник — неделя считается ровно по 7 дней", () => {
 withNow("2026-07-20", () => assert.equal(currentProgramWeek("2026-07-20"), 1));
 withNow("2026-07-26", () => assert.equal(currentProgramWeek("2026-07-20"), 1));
 withNow("2026-07-27", () => assert.equal(currentProgramWeek("2026-07-20"), 2));
});

test("currentProgramWeek: нет/некорректная дата старта -> неделя 1", () => {
 assert.equal(currentProgramWeek(undefined), 1);
 assert.equal(currentProgramWeek("не-дата"), 1);
});

test("buildHomeWeek: бассейн по вторникам/четвергам появляется с недели 2, суббота — всегда ходьба/велосипед", () => {
 withNow("2026-07-27", () => {
  const plan = buildHomeWeek("2026-07-21");
  const tue = plan.find(d => d.day === 2)!, thu = plan.find(d => d.day === 4)!, sat = plan.find(d => d.day === 6)!;
  assert.equal(tue.title, "Бассейн");
  assert.equal(thu.title, "Бассейн");
  assert.equal(sat.title, "Ходьба или велосипед");
 });
});

test("buildHomeWeek: до недели 2 — вторник/четверг ходьба и восстановление, не бассейн", () => {
 withNow("2026-07-24", () => {
  const plan = buildHomeWeek("2026-07-21");
  const tue = plan.find(d => d.day === 2)!, thu = plan.find(d => d.day === 4)!;
  assert.equal(tue.title, "Ходьба или велосипед");
  assert.equal(thu.title, "Прогулка и мобильность");
 });
});

test("Week 3 → Week 4: история старого ритма не меняется, Plan v2 начинается ровно с недели 4", () => {
 const week3=buildProgramWeek(3),week4=buildProgramWeek(4);
 assert.equal(week3.find(day=>day.day===1)?.title,"Гантели по кругу");
 assert.equal(week3.find(day=>day.day===2)?.title,"Бассейн");
 assert.equal(week3.find(day=>day.day===6)?.title,"Ходьба или велосипед");
 assert.deepEqual(week4.map(day=>day.title),["Strength A","Bike / Indoor Cycling","Swim — Main aerobic session","Strength B","Swim — Endurance","Полный отдых","Полный отдых"]);
});

test("Plan v2: 6 сессий за 5 дней, Monday содержит Strength A + Swim Technique", () => {
 const plan=buildProgramWeek(4),sessions=plan.flatMap(day=>sessionsForDay(day as any));
 assert.equal(sessions.filter(session=>session.type!=="Отдых").length,6);
 assert.equal(plan.filter(day=>sessionsForDay(day as any).some(session=>session.type!=="Отдых")).length,5);
 assert.deepEqual(sessionsForDay(plan[0] as any).map(session=>session.title),["Strength A","Swim — Technique"]);
 assert.deepEqual(plan.slice(5).map(day=>day.type),["Отдых","Отдых"]);
});

test("Plan v2: Bike optional/planned и не добавлены тяжёлые упражнения на ноги", () => {
 const plan=buildProgramWeek(4),bike=plan.find(day=>day.day===2)!;
 assert.equal(bike.optional,true);
 assert.equal(bike.availability,"planned");
 assert.match(bike.time,/25–30/);
 const strengthNames=plan.flatMap(day=>sessionsForDay(day as any)).filter(session=>session.type==="Силовая").flatMap(session=>session.exercises.map((exercise:any[])=>exercise[0]));
 assert.ok(!strengthNames.some(name=>/squat|lunge|leg press|leg extension|leg curl|присед|выпад|разгибание ног|сгибание ног/i.test(name)));
});
