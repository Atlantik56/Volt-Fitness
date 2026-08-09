import type { HomeWeekDay } from "./week-schedule-model";

export const home = [
["Тяга одной гантели в наклоне с опорой на скамью","Ладонь и колено на опоре, спина ровная. Веди локоть к тазу и медленно опускай гантель.","10–12 / рука","/exercises/one-arm-dumbbell-row.webp"],
["Попеременное сгибание рук с гантелями стоя","Локти прижаты к корпусу. Поднимай гантель силой бицепса, не раскачивай тело.","12–15","/exercises/dumbbell-biceps-curl.webp"],
["Отведение прямой ноги назад стоя (kick-back) с опорой на стул или стену","Держись за устойчивую опору, корпус и таз сохраняй неподвижными. Плавно отведи прямую ногу назад и немного вверх, сожми ягодицу и медленно верни. Не прогибай поясницу; амплитуда только комфортная.","12 / нога","/exercises/standing-leg-kickback.webp"],
["Жим гантелей сидя над головой с опорой спины","Прижми спину к опоре, держи гантели у плеч. Выжми вверх без прогиба в пояснице.","10–12","/exercises/seated-dumbbell-press.webp"],
["Жим гантелей лёжа на горизонтальной скамье","Лопатки сведены, стопы в пол. Опусти гантели к бокам груди и выжми вверх без удара локтями.","10–12","/exercises/dumbbell-bench-press.webp"],
["Отжимания от пола","Ладони чуть шире плеч, пальцы направлены вперёд. Держи тело прямой линией, опускай грудь между ладонями и выжимай себя вверх без провала в пояснице.","8–12","/exercises/push-up.webp"],
["Разгибание рук с гантелями лёжа — французский жим","Плечи вертикальны и неподвижны. Согни локти, опусти гантели к вискам и разогни руки.","12–15","/exercises/lying-triceps-extension.webp"],
["Разведение рук с гантелями лёжа на горизонтальной скамье","Сохраняй мягкий сгиб локтей. Разведи руки дугой до уровня груди и сведи над грудью.","10–12","/exercises/dumbbell-chest-fly.webp"],
["Отведение согнутой ноги назад из упора на ладонях и коленях («донки-кик»)","Ладони под плечами, колени под тазом, спина нейтральна. Сохраняя колено согнутым, плавно подними бедро назад-вверх до комфортной высоты и медленно опусти. Не разворачивай таз и не прогибай поясницу.","12 / нога","/exercises/quadruped-donkey-kick.webp"],
["Планка на предплечьях","Локти под плечами, живот напряжён. Держи прямую линию от головы до пяток, не проваливай таз. Если тяжело — опусти колени на коврик и удерживай прямую линию от головы до колен.","20–30 сек","/exercises/forearm-plank.webp"]];
export const homeWarmup = [
["Ходьба на месте с невысоким подъёмом коленей","Шагай мягко, держи корпус ровно и поднимай колени только до комфортной высоты. Без прыжков и боли в тазобедренном суставе.","60 сек","/warmup/march-in-place.webp"],
["Круговые движения плечами стоя","Стой ровно, руки расслаблены. Медленно сделай круги плечами назад, затем вперёд; не запрокидывай голову.","10 назад + 10 вперёд","/warmup/shoulder-circles.webp"],
["Сведение лопаток стоя без веса","Согни локти, мягко отведи их назад и сведи лопатки. Не прогибай поясницу и не поднимай плечи к ушам.","12 повторений","/warmup/scapular-retraction.webp"],
["Попеременное вытяжение рук вверх","Поочерёдно тянись рукой вверх, сохраняя таз неподвижным. Не уходи в глубокий наклон и двигайся без рывков.","8 раз каждой рукой","/warmup/overhead-reach.webp"]];
const poolSession=(day:number,d:string)=>({day,d,type:"Кардио",title:"Бассейн",time:"~30 мин",rounds:1,image:"/workouts/swimming-crawl.webp",exercises:[["Разминка в воде","100–150 м вольным стилем в лёгком темпе, без ускорений","5 мин"],["Основная часть","Кроль или на спине, комфортный темп, свободное дыхание. Без брасса.","20 мин"],["Заминка","Медленно, спокойное дыхание","5 мин"]]});
const tuesdayWalk={day:2,d:"Вторник",type:"Кардио",title:"Ходьба или велосипед",time:"30–60 мин",rounds:1,image:"/workouts/road-cycling.webp",exercises:[["Разминка","Лёгкий темп","5 мин"],["Основная часть","Разговорный темп, без тяжёлых горок","20–50 мин"],["Заминка","Постепенно снизить темп","5 мин"]]};
const thursdayWalk={day:4,d:"Четверг",type:"Восстановление",title:"Прогулка и мобильность",time:"20–30 мин",rounds:1,image:"/workouts/recovery-walk.webp",exercises:[["Спокойная прогулка","Темп без одышки","20–30 мин"],["Лёгкая растяжка","Без боли и резких движений","5 мин"]]};
// Недели программы всегда начинаются в понедельник (расписание в buildHomeWeek —
// фиксированные Пн–Вс), а не через фиксированные 7 дней от старта, который может
// приходиться на любой день недели — иначе смена недели «плывёт» относительно
// календарной недели, которую видит пользователь.
function mondayOf(d:Date):Date{
 const monday=new Date(d.getFullYear(),d.getMonth(),d.getDate());
 monday.setDate(monday.getDate()-((d.getDay()+6)%7));
 return monday;
}
export function currentProgramWeek(programStart?:string):number{
 if(!programStart)return 1;
 const start=new Date(`${programStart}T00:00:00`);
 if(Number.isNaN(start.getTime()))return 1;
 const diffDays=Math.round((mondayOf(new Date()).getTime()-mondayOf(start).getTime())/86400000);
 return Math.max(1,Math.floor(diffDays/7)+1);
}
const strengthA={id:"strength-a",type:"Силовая",title:"Strength A",time:"~45–50 мин",rounds:1,image:"/exercises/chest-press-machine.webp",exercises:[
 ["Machine Chest Press","Спина прижата к спинке, рукояти на уровне середины груди. Выжми вперёд без блокировки локтей и подконтрольно верни.","3 × 10–12","/exercises/chest-press-machine.webp"],
 ["Lat Pulldown","Грудь слегка вверх, корпус почти вертикален. Тяни перекладину к верхней части груди локтями вниз.","3 × 10–12","/exercises/lat-pulldown.webp"],
 ["Seated Row","Сохраняй нейтральную спину. Веди локти назад к тазу, своди лопатки и плавно выпрямляй руки.","3 × 10–12","/exercises/seated-row-machine-v2.webp"],
 ["Machine Shoulder Press","Прижми спину к опоре, поставь стопы устойчиво. Выжми рукояти вверх без прогиба в пояснице.","2 × 10–12","/exercises/shoulder-press-machine-v2.webp"],
 ["Cable Triceps Extension","Локти прижаты к корпусу. Разогни руки без раскачивания плеч и медленно верни рукоять.","2 × 12–15","/exercises/triceps-extension-machine-v2.webp"],
 ["Biceps Curl","Держи локти неподвижно, не раскачивай корпус. Согни руки и плавно опусти вес.","2 × 12–15","/exercises/biceps-curl-machine-v2.webp"],
 ["Pallof Press / safe core","Стой устойчиво боком к блоку. Выжми рукоять перед собой, не позволяя корпусу разворачиваться; амплитуда только комфортная.","3 подхода"],
]};
const strengthB={id:"strength-b",type:"Силовая",title:"Strength B",time:"~45–50 мин",rounds:1,image:"/exercises/incline-chest-press-machine-v2.webp",exercises:[
 ["Incline / Machine Chest Press","Прижми спину к опоре. Выжми рукояти вперёд-вверх без блокировки локтей и плавно верни.","3 × 10–12","/exercises/incline-chest-press-machine-v2.webp"],
 ["Alternate Lat Pulldown","Используй комфортный нейтральный или средний хват. Тяни локти вниз без раскачивания корпуса.","3 × 10–12","/exercises/lat-pulldown.webp"],
 ["Seated / Cable Row","Сохраняй нейтральную спину и неподвижный корпус. Веди локти назад и плавно возвращай вес.","3 × 10–12","/exercises/seated-row-machine-v2.webp"],
 ["Reverse Fly","Грудь остаётся у опоры. Разведи руки назад с мягкими локтями, сведи лопатки и медленно верни.","2 × 12–15","/exercises/reverse-pec-deck-machine-v2.webp"],
 ["Lateral Raise","Подними руки в стороны до комфортного уровня без рывка и раскачивания корпуса.","2 × 12–15","/exercises/cable-lateral-raise.webp"],
 ["Biceps Curl","Держи локти неподвижно, не раскачивай корпус. Согни руки и плавно опусти вес.","2 × 12–15","/exercises/biceps-curl-machine-v2.webp"],
 ["Triceps Extension","Локти прижаты к корпусу. Разогни руки без движения плеч и плавно верни вес.","2 × 12–15","/exercises/triceps-extension-machine-v2.webp"],
 ["Pallof Press / safe core","Стой устойчиво боком к блоку. Выжми рукоять перед собой, не позволяя корпусу разворачиваться; амплитуда только комфортная.","3 подхода"],
]};
const swimSession=(id:string,title:string,time:string)=>({id,type:"Кардио",title,time,rounds:1,image:"/workouts/swimming-crawl.webp",exercises:[["VOLT Swim Foundation","Детальный состав, интервалы и фактический прогресс открываются из единого календарного слота VOLT Swim.","По плану Foundation"]]});
const restSession={type:"Отдых",title:"Полный отдых",time:"—",rounds:0,image:"",exercises:[["Восстановление","Сон и спокойное восстановление без обязательной нагрузки.","По самочувствию"]]};

export function buildPlanV2Week(programWeek=4):HomeWeekDay[]{
 const bikeMinutes=programWeek<=4?"25–30 мин":programWeek===5?"~30 мин":"30–35 мин";
 const mondaySwim=swimSession("swim-technique","Swim — Technique","~35–45 мин");
 return [
  {day:1,d:"Понедельник",...strengthA,sessions:[strengthA,mondaySwim]},
  {day:2,d:"Вторник",id:"bike-zone-2",type:"Кардио",title:"Bike / Indoor Cycling",time:bikeMinutes,rounds:1,image:"/workouts/road-cycling.webp",optional:true,availability:"planned" as const,exercises:[["Лёгкая разминка","Начни с очень лёгкого сопротивления и спокойного каденса.","5 мин"],["Easy Zone 2","Разговорный темп без интервалов и тяжёлого сопротивления. Пока велостанок недоступен, сессию можно оставить запланированной.",programWeek<=4?"15–20 мин":programWeek===5?"20 мин":"20–25 мин"],["Заминка","Постепенно снизь сопротивление и темп.","5 мин"]]},
  {day:3,d:"Среда",...swimSession("swim-aerobic","Swim — Main aerobic session","~40–55 мин")},
  {day:4,d:"Четверг",...strengthB},
  {day:5,d:"Пятница",...swimSession("swim-endurance","Swim — Endurance","~45–65 мин")},
  {day:6,d:"Суббота",id:"rest-saturday",...restSession},
  {day:7,d:"Воскресенье",id:"rest-sunday",...restSession},
 ];
}
export function buildProgramWeek(programWeek:number):HomeWeekDay[]{
 if(programWeek>=4)return buildPlanV2Week(programWeek);
 const pool=programWeek>1;
 return [
 {day:1,d:"Понедельник",type:"Силовая",title:"Гантели по кругу",time:"~30–35 мин",rounds:2,image:"/exercises/dumbbell-bench-press.webp",warmup:homeWarmup,exercises:home},
 pool?poolSession(2,"Вторник"):tuesdayWalk,
 {day:3,d:"Среда",type:"Силовая",title:"Гантели по кругу",time:"~30–35 мин",rounds:2,image:"/exercises/dumbbell-bench-press.webp",warmup:homeWarmup,exercises:home},
 pool?poolSession(4,"Четверг"):thursdayWalk,
 {day:5,d:"Пятница",type:"Силовая",title:"Гантели по кругу",time:"~30–35 мин",rounds:2,image:"/exercises/dumbbell-bench-press.webp",warmup:homeWarmup,exercises:home},
 {day:6,d:"Суббота",type:"Кардио",title:"Ходьба или велосипед",time:"30–60 мин",rounds:1,image:"/workouts/road-cycling.webp",exercises:[["Разминка","Лёгкий темп","5 мин"],["Основная часть","Разговорный темп, без тяжёлых горок","20–50 мин"],["Заминка","Постепенно снизить темп","5 мин"]]},
 {day:7,d:"Воскресенье",type:"Отдых",title:"Полный отдых",time:"—",rounds:0,image:"",exercises:[["Восстановление","Сон и заготовка еды на 2–3 дня","По самочувствию"]]}
 ];
}
export function buildHomeWeek(programStart?:string):HomeWeekDay[]{
 return buildProgramWeek(currentProgramWeek(programStart));
}
// Совместимый плоский каталог для старых импортёров вычисляется из того же
// Plan v2, поэтому Roadmap/прогрессия не создают вторую версию расписания.
export const week=buildPlanV2Week(4).flatMap((day:any)=>(day.sessions??[day]).map((session:any)=>({d:day.d,t:session.type,n:session.title,time:session.time,x:session.exercises,optional:session.optional===true})));
export const phases=[
{startWeek:1,endWeek:3,p:"Недели 1–3",n:"Дом: гантели + прогулки",g:"Привычка и подготовка к залу",x:["Пн / Ср / Пт — 10 упражнений, ~30–35 минут","Неделя 1 — 2 круга; неделя 2 — 3; неделя 3 — +вес или повторы","Вт / Чт — ходьба или велосипед в 1-ю неделю, затем бассейн ~30 минут; Сб — ходьба или велосипед 30–60 минут","Питание по плану с первого дня"]},
{startWeek:4,endWeek:14,p:"Недели 4–14",n:"Plan v2: зал + Swim + Bike",g:"Сила верха и плавный рост аэробной выносливости",x:["Пн — Strength A + Swim Technique","Ср / Пт — Swim aerobic / endurance; Чт — Strength B","Вт — Bike Zone 2 опционально, 25–35 минут","Сб / Вс — восстановление"]},
{startWeek:15,endWeek:36,p:"Месяц 4+",n:"Plan v2: устойчивый ритм",g:"Дойти до цели и закрепить образ жизни",x:["2 силовых без тяжёлой нагрузки на ноги","3 Swim в неделю","Bike Zone 2 с постепенным ростом длительности","После 75 кг: темп 0,5–0,7 кг/нед и +200 ккал"]}];
export const meals=[
["Завтрак","Омлет из 3 яиц с овощами + хлеб. Замена: 250 г творога 5% с ягодами","~400 ккал · 25 г белка"],["Обед","Курица/индейка 180 г + гречка/рис 150 г + овощной салат","~500 ккал · 45 г белка"],["Полдник","Творог 200–250 г, или греческий йогурт + орехи, или протеин + фрукт","~300 ккал · 40 г белка"],["Ужин","Рыба/курица 200 г + овощи; крупа вечером не нужна","~400 ккал · 40 г белка"],["Буфер","Молоко в кофе, фрукт, сыр или небольшое сладкое","~100–150 ккал"]];
export const rules=["Минимальная версия: 1 круг дома или 10 минут прогулки","Сравнивай себя только с собой месяц назад","Пропуск — данные, не провал; возвращайся легко","Отмечай силу, выносливость, одежду и настроение","Зал, бассейн и велосипед — ещё и люди","Фиксируй тренировки и проговаривай процесс"];
export const safety="Любая боль в тазобедренном суставе — упражнение сразу убрать. Исключены прыжки, бег, приседания и выпады с весом; в бассейне — брасс. При повторяющейся боли — к ортопеду или спортивному врачу.";
