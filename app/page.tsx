"use client";

import { useEffect, useMemo, useState } from "react";
import { buildHomeWeek, meals, phases, rules, safety, week } from "./personal-data";
import { ExerciseVideo } from "./exercise-video";
import { WorkoutSession } from "./training-session";
import AuthGate from "./auth-gate";
import { NutritionTools, Readiness, ScheduleEditor, StrengthAdvice, TrainingAnalytics, TrainingCalendar } from "./fitness-features";
import { BodyMap, GarminImport, PersonalRecords } from "./advanced-features";
import { CoachCard } from "./coach-card";
import { CoachChatPanel } from "./coach-chat-panel";
import { ProgressionPanel, type ProgressionProposal } from "./progression-panel";
import { buildCoachResult, COACH_ACTION_LABELS, COACH_TARGETS, type CoachAction } from "../lib/coach";
import { buildCoachInsights } from "../lib/coach-insights";
import { WhatsNewGate } from "./whats-new-gate";
import { useToast } from "./toast";
import { Apple, CalendarDays, ChartColumn, Home as HomeIcon, Route } from "lucide-react";
import {
  MEASUREMENT_KEYS, METRIC_LABELS, METRIC_UNITS, PERIODS, PERIOD_LABELS,
  buildHistory, computeMetricCards, computeMetricStats, computeProgressSummary, computeTrendPoints, filterHistoryByPeriod, groupHistoryByMonth,
  type HistoryEntry, type Measurement, type MetricCardData, type MetricKey, type MetricPoint, type MetricStats, type Period, type ProgressSummary,
} from "./progress-model";

const filters = ["Все", "Силовые", "Велосипед", "Плавание"];
const gymExercises = Array.from(new Set(week.flatMap((d: any) => d.x.map((x: any) => x[0]))));
const NAV_ITEMS = [
  ["Сегодня", "⌂"], ["План", "▦"], ["Дорожная карта", "⌁"], ["Питание", "◒"], ["Прогресс", "◎"]
] as const;
const MOBILE_ICONS={
  "Сегодня":HomeIcon,
  "План":CalendarDays,
  "Дорожная карта":Route,
  "Питание":Apple,
  "Прогресс":ChartColumn,
} as const;

export default function Home() {
  const notify = useToast();
  const [filter, setFilter] = useState("Все");
  const [nav, setNav] = useState("Сегодня");
  const [mobileMenu,setMobileMenu]=useState(false);
  const [data,setData]=useState<any>({profile:{name:"Илья",height:167,startWeight:86,targetWeight:67},workouts:[],measurements:[],activity:[],photos:[]});
  const [activeWorkout,setActiveWorkout]=useState<any>(null);
  const [coachChatOpen,setCoachChatOpen]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [progressionProposals,setProgressionProposals]=useState<ProgressionProposal[]>([]);
  const loadProgression=()=>fetch("/api/progression").then(r=>r.json()).then(d=>setProgressionProposals(d.proposals||[])).catch(()=>{});
  const load=()=>fetch("/api/fitness").then(r=>r.json()).then(d=>{setData(d);setLoaded(true)}).catch(()=>{});
  useEffect(()=>{load();loadProgression()},[]);
  const streak=useMemo(()=>calcStreak(data.workouts||[]),[data.workouts]);
  const dryStreak=useMemo(()=>calcDryStreak(data.activity||[]),[data.activity]);
  const today=localIso(new Date()), todayActivity=(data.activity||[]).find((x:any)=>x.date===today)||{};
  const todayWorkouts=(data.workouts||[]).filter((x:any)=>x.date===today).length;
  const days=useMemo(()=>makeWeek(data.workouts||[]),[data.workouts]);
  const weekDates=new Set(days.map(x=>x.iso));
  const weekWorkouts=(data.workouts||[]).filter((x:any)=>weekDates.has(x.date));
  const weekCalories=(data.activity||[]).filter((x:any)=>weekDates.has(x.date)).reduce((n:number,x:any)=>n+(Number(x.calories)||0),0);
  const currentWeight=Number(data.measurements?.[0]?.weight??data.profile?.startWeight??86), startWeight=Number(data.profile?.startWeight??86), targetWeight=Number(data.profile?.targetWeight??67);
  const lost=Math.max(0,startWeight-currentWeight), remaining=Math.max(0,currentWeight-targetWeight), goalPct=Math.max(0,Math.min(100,(lost/(startWeight-targetWeight||1))*100));
  const goalEta=useMemo(()=>projectGoalDate(data.measurements||[],targetWeight),[data.measurements,targetWeight]);
  const hour=new Date().getHours(), greeting=hour<5?"Доброй ночи":hour<12?"Доброе утро":hour<17?"Добрый день":hour<23?"Добрый вечер":"Доброй ночи", dateLabel=formatDateLabel(new Date());
  const homeWeek=useMemo(()=>buildHomeWeek(data.profile?.programStart),[data.profile?.programStart]);
  const overrides=data.scheduleOverrides||[], movedToday=overrides.find((x:any)=>x.scheduledDate===today), regularToday=homeWeek.find(x=>x.day===(new Date().getDay()||7))||homeWeek[0];
  const movedPlan=movedToday&&homeWeek.find(x=>x.title===movedToday.planTitle), replacement=movedToday?.replacementTitle&&homeWeek.find(x=>x.title===movedToday.replacementTitle);
  const todayPlan=replacement||movedPlan||regularToday;
  const coach=useMemo(()=>buildCoachResult({date:today,ready:loaded,plan:todayPlan?{title:todayPlan.title,type:todayPlan.type}:null,wellnessLogs:data.wellnessLogs,activity:data.activity,foodLogs:data.foodLogs,workouts:data.workouts,measurements:data.measurements,profile:data.profile}),[data,todayPlan,today,loaded]);
  const coachInsights=useMemo(()=>loaded?buildCoachInsights({date:today,measurements:data.measurements||[],workouts:data.workouts||[],foodLogs:data.foodLogs||[],strengthLogs:data.strengthLogs||[],planDays:homeWeek.map(d=>({day:d.day,type:d.type})),scheduleOverrides:data.scheduleOverrides||[],targets:{calories:COACH_TARGETS.calories,protein:COACH_TARGETS.protein},targetWeight:data.profile?.targetWeight!=null?Number(data.profile.targetWeight):null}):[],[data,homeWeek,today,loaded]);
  const coachAction:CoachAction|null=coach.decision?.action??null;
  const goCoach=()=>{setNav("Сегодня");setMobileMenu(false);setTimeout(()=>document.getElementById("volt-coach")?.scrollIntoView({behavior:"smooth",block:"start"}),80)};
  const upcoming=orderedPlans(homeWeek,new Date().getDay()||7).filter(x=>x.type!=="Отдых").slice(0,3);
  const motivation=todayWorkouts>0?"Ты уже сделал главное — пришёл и выполнил.":streak>1?`У тебя серия ${streak} дня. Сегодня добавь к ней ещё один.`:"Начни с первого движения. Остальное сделает ритм.";
  const saveActivity=async(e:any)=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"activity",date:today,...b})});notify(r.ok?"Активность за сегодня обновлена":"Не удалось сохранить активность",r.ok?"good":"warn");load()};

  return (
    <AuthGate><main className="app-shell">
      <button className={`mobile-sidebar-backdrop${mobileMenu?" visible":""}`} aria-label="Закрыть меню профиля" onClick={()=>setMobileMenu(false)}/>
      <aside className={`sidebar${mobileMenu?" mobile-open":""}`}>
        <a className="brand" href="#top" aria-label="VOLT — на главную"><span className="brand-mark">V</span><b>VOLT</b></a>
        <button className="mobile-sidebar-close" aria-label="Закрыть меню профиля" onClick={()=>setMobileMenu(false)}>×</button>
        <nav className="side-nav" aria-label="Основная навигация">
          {NAV_ITEMS.map(([label, icon]) => (
            <button key={label} data-tour-id={label==="Прогресс"?"nav-progress":undefined} className={nav === label ? "active" : ""} onClick={() => {setNav(label);setMobileMenu(false)}}><span>{icon}</span>{label}</button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="streak"><span>⚡</span><div><b>{streak} {streak===1?"день":"дня"}</b><small>серия активности</small></div></div>
          <div className="streak dry"><span>🌿</span><div><b>{dryStreak} {dryStreak===1?"день":"дня"}</b><small>без пива</small></div></div>
          <PushToggle/>
          <button className="profile" onClick={()=>{setNav("Прогресс");setMobileMenu(false)}}><span className="avatar">И</span><span><b>{data.profile?.name||"Илья"}</b><small>Неделя 1</small></span><i>•••</i></button>
          <button className="logout" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});location.reload()}}>Выйти</button>
        </div>
      </aside>

      <section className="content" id="top">
        <header className="topbar">
          <div><p className="eyebrow">{dateLabel}</p><h1>{greeting}, {data.profile?.name||"Илья"}</h1></div>
          <div className="header-actions">{loaded&&coachAction&&<button type="button" className={`coach-indicator ${COACH_ACTION_LABELS[coachAction].tone}`} aria-label={`VOLT Coach: ${COACH_ACTION_LABELS[coachAction].label}. Перейти к решению`} onClick={goCoach}><span className="coach-status-dot" aria-hidden="true"/><span className="coach-indicator-text">Coach: {COACH_ACTION_LABELS[coachAction].short}</span></button>}<button aria-label="Уведомления" className="icon-btn">◔<span></span></button><button className="mini-avatar" aria-label="Открыть профиль и серии" aria-expanded={mobileMenu} onClick={()=>window.matchMedia("(max-width: 760px)").matches?setMobileMenu(true):setNav("Прогресс")}>И</button></div>
        </header>

        <button className="mobile-status-bar" onClick={()=>setMobileMenu(true)} aria-label="Открыть профиль, серии и напоминания"><span>⚡ <b>{streak}</b><small> серия</small></span><span>🌿 <b>{dryStreak}</b><small> без пива</small></span><span className="mobile-status-profile">И <b>{data.profile?.name||"Илья"}</b> ›</span></button>

        {nav === "Сегодня" ? <><section className="motivation-banner card"><span>⚡</span><div><p className="eyebrow">НАСТРОЙ НА СЕГОДНЯ</p><h3>{motivation}</h3><small>Не нужно быть идеальным. Нужно быть последовательным.</small></div></section><section className="hero">
          <div className="hero-photo" style={{backgroundImage:`url(${todayPlan.image})`}} role="img" aria-label={todayPlan.title} />
          <div className="hero-shade" />
          <div className="hero-content">
            <span className="pill lime">{todayPlan.d.toUpperCase()} · НЕДЕЛЯ 1</span>
            <h2>{todayPlan.title.toUpperCase()}</h2>
            <div className="hero-meta"><span>◷ {todayPlan.time}</span><span>◫ {todayPlan.exercises.length} упражнений</span>{todayPlan.rounds>1&&<span>◉ {todayPlan.rounds} круга</span>}</div>
            {coach.summary.workoutDone?<>
             <div className="hero-done-status" role="status"><span className="hero-done-icon" aria-hidden="true">✓</span><div><b>{todayPlan.type==="Отдых"?"План дня выполнен":"Тренировка выполнена"}</b><small>Отличная работа сегодня</small></div></div>
             <button className="repeat-btn" onClick={() => setActiveWorkout(todayPlan)}><span aria-hidden="true">↻</span>{todayPlan.type==="Отдых"?"Открыть план дня ещё раз":"Повторить тренировку"}</button>
            </>:<button className="start-btn" onClick={() => setActiveWorkout(todayPlan)}><span>▶</span>{todayPlan.type==="Отдых"?"Открыть план дня":"Начать тренировку"}</button>}
          </div>
          <div className="coach-note"><span className="coach-avatar">M</span><div><small>СОВЕТ ТРЕНЕРА</small><b>Держи темп. Сегодня ты сильнее.</b></div></div>
        </section>

        <section className="metrics" aria-label="Дневной прогресс">
          <Metric icon="◉" color="orange" label="Активные калории" value={fmt(todayActivity.calories||0)} unit="/ 900 ккал" pct={pct(todayActivity.calories,900)} />
          <Metric icon="◷" color="blue" label="Время активности" value={fmt(todayActivity.activeMinutes||0)} unit="/ 75 мин" pct={pct(todayActivity.activeMinutes,75)} />
          <Metric icon="↟" color="lime" label="Шаги" value={fmt(todayActivity.steps||0)} unit="/ 10 000" pct={pct(todayActivity.steps,10000)} />
          <Metric icon="✓" color="violet" label="Тренировки" value={String(todayWorkouts)} unit="/ 1 сегодня" pct={pct(todayWorkouts,1)} />
        </section>

        <form className="activity-entry card" onSubmit={saveActivity}><div><p className="eyebrow">ДАННЫЕ ЗА СЕГОДНЯ</p><h3>Обновить активность</h3></div><label>Калории<input name="calories" type="number" min="0" defaultValue={todayActivity.calories||0}/></label><label>Активность, мин<input name="activeMinutes" type="number" min="0" defaultValue={todayActivity.activeMinutes||0}/></label><label>Шаги<input name="steps" type="number" min="0" defaultValue={todayActivity.steps||0}/></label><label>Пиво, банки<input name="beers" type="number" min="0" defaultValue={todayActivity.beers||0}/></label><label>Сон, ч<input name="sleepHours" type="number" min="0" max="24" step="0.5" defaultValue={todayActivity.sleepHours||0}/></label><button>Сохранить</button></form>

        <MoodCheckin data={data} refresh={load}/>
        <Readiness data={data} refresh={load}/>
        <CoachCard result={coach} plan={todayPlan} insights={coachInsights} ready={loaded} onAskCoach={()=>setCoachChatOpen(true)}/>
        <ProgressionPanel proposals={progressionProposals} refresh={loadProgression}/>

        <WeeklyDigest data={data} weekWorkouts={weekWorkouts} weekDates={weekDates} currentWeight={currentWeight}/>

        <div className="grid-main">
          <section className="week-card card">
            <div className="section-head"><div><p className="eyebrow">ЭТА НЕДЕЛЯ</p><h3>Ритм тренировок</h3></div><button>Подробнее ↗</button></div>
            <div className="week-days">
              {days.map((day) => <div key={day.iso} className={`day ${day.state}`}><small>{day.short}</small><b>{day.date}</b><span>{day.state === "done" ? "✓" : day.state === "missed" ? "×" : day.state === "active" ? "•" : ""}</span></div>)}
            </div>
            <div className="chart-wrap">
              <div className="chart-labels"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
              <div className="bars" aria-label="График нагрузки за неделю">
                {days.map((day) => <div className="bar-slot" key={day.iso}><i style={{height:`${day.count?100:0}%`}} className={day.state === "active" ? "today" : ""} /></div>)}
              </div>
            </div>
            <div className="week-footer"><div><small>Нагрузка</small><b>{weekWorkouts.length} силовая тренировка</b></div><div><small>Активных дней</small><b>{new Set(weekWorkouts.map((x:any)=>x.date)).size} <span>/ 7</span></b></div><div><small>Калории</small><b>{fmt(weekCalories)} <span>ккал</span></b></div></div>
          </section>

          <section className="goal-card card">
            <div className="section-head"><div><p className="eyebrow">ГЛАВНАЯ ЦЕЛЬ</p><h3>Снизить вес</h3></div><button className="dots">•••</button></div>
            <div className="weight-ring" style={{background:`conic-gradient(var(--lime) ${goalPct}%, #292e2e 0)`}}><div><b>{currentWeight.toFixed(1).replace(".",",")}</b><span>кг сейчас</span></div></div>
            <div className="weight-row"><div><small>Старт</small><b>{startWeight.toFixed(1).replace(".",",")} кг</b></div><span>−{lost.toFixed(1).replace(".",",")} кг</span><div className="right"><small>Цель</small><b>{targetWeight.toFixed(1).replace(".",",")} кг</b></div></div>
            <div className="goal-progress"><i style={{width:`${goalPct}%`}} /></div>
            <p>Старт программы · осталось {remaining.toFixed(1).replace(".",",")} кг</p>
            <p>{goalEta?`При текущем темпе — цель примерно к ${goalEta}`:"Добавь больше замеров веса, чтобы увидеть прогноз даты"}</p>
          </section>
        </div>

        <section className="plan-section">
          <div className="section-head plan-title"><div><p className="eyebrow">ПЛАН ТРЕНИРОВОК</p><h3>Следующие занятия</h3></div><button>Весь план →</button></div>
          <div className="filters" role="group" aria-label="Фильтр тренировок">{filters.map((f) => <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div>
          <div className="workouts">
            {upcoming.filter(w => filter === "Все" || (filter === "Силовые"&&w.type==="Силовая") || (filter === "Велосипед"&&w.title.includes("велосипед")) || (filter === "Плавание"&&w.title==="Бассейн")).map((w) => (
              <article className="workout" key={`${w.day}-${w.title}`} onClick={()=>setActiveWorkout(w)}>
                <div className="workout-img" style={{backgroundImage:`url(${w.image})`}}><span>{w.type}</span><button aria-label={`Открыть ${w.title}`}>↗</button></div>
                <div className="workout-copy"><small>{w.d} · {w.time}</small><h4>{w.title}</h4><p>{w.exercises.length} упражнений{w.rounds>1?` · ${w.rounds} круга`:""}</p></div>
              </article>
            ))}
          </div>
        </section></> : <>{nav==="План"&&<ScheduleEditor data={data} refresh={load}/>} {nav==="Питание"&&<NutritionTools data={data}/>}<Personal section={nav} data={data} refresh={load} coachAction={coachAction}/></>}
      </section>

      {activeWorkout&&<WorkoutSession plan={activeWorkout} strengthLogs={data.strengthLogs||[]} coachAction={activeWorkout?.title===todayPlan?.title?coachAction:null} loadOverrides={data.progressionOverrides||{}} close={()=>setActiveWorkout(null)} done={()=>{setActiveWorkout(null);load();loadProgression()}}/>}
      {loaded&&!coachChatOpen&&<button type="button" className="coach-chat-fab" aria-label="Спросить тренера" onClick={()=>setCoachChatOpen(true)}><span aria-hidden="true">💬</span></button>}
      <CoachChatPanel open={coachChatOpen} onClose={()=>setCoachChatOpen(false)} plan={todayPlan?{title:todayPlan.title,type:todayPlan.type}:null} today={today} onFoodSaved={load} quickActions={[
        {label:"Начать тренировку",icon:"▶",onClick:()=>{setCoachChatOpen(false);setNav("Сегодня");setActiveWorkout(todayPlan)}},
        {label:"Записать питание",icon:"🍽",onClick:()=>{setCoachChatOpen(false);setNav("Питание");setMobileMenu(false)}},
        {label:"Отметить самочувствие",icon:"❤",onClick:()=>{setCoachChatOpen(false);goCoach()}},
      ]}/>
      {loaded&&<WhatsNewGate seenVersion={Number(data.whatsNewSeenVersion)||0} onSeen={async(version)=>{await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"markWhatsNewSeen",version})});load()}}/>}

      <nav className="mobile-nav" aria-label="Мобильная навигация">{NAV_ITEMS.map(([label])=>{const Icon=MOBILE_ICONS[label];return <button key={label} data-tour-id={label==="Прогресс"?"nav-progress-mobile":undefined} className={nav===label?"active":""} onClick={()=>{setNav(label);setMobileMenu(false)}}><span aria-hidden="true"><Icon size={23} strokeWidth={2}/></span>{label}</button>})}</nav>
    </main></AuthGate>
  );
}

function Metric({ icon, color, label, value, unit, pct }: {icon:string;color:string;label:string;value:string;unit:string;pct:number}) {
  return <article className="metric card"><div className={`metric-icon ${color}`}>{icon}</div><div className="metric-copy"><small>{label}</small><p><b>{value}</b> <span>{unit}</span></p><div className="progress"><i className={color} style={{width:`${pct}%`}} /></div></div><strong>{pct}%</strong></article>;
}

function Intro({k,t,p}:{k:string;t:string;p:string}){return <header className="detail-intro"><p className="eyebrow">{k}</p><h2>{t}</h2><p>{p}</p></header>}
function Personal({section,data,refresh,coachAction}:{section:string;data:any;refresh:()=>void;coachAction:CoachAction|null}){
 const homeWeek=buildHomeWeek(data.profile?.programStart);
 if(section==="План") return <div className="detail-page"><Intro k="ПЕРСОНАЛЬНАЯ ПРОГРАММА" t="Тренировки без ударной нагрузки" p="Недели 1–3 — дома. С 4-й недели основным становится расписание зала, бассейна и велосипеда."/><Notice/><h3 className="detail-title">Недели 1–3 · домашний план по дням</h3><p className="detail-lead">Неделя 1 — 2 круга; неделя 2 — 3; неделя 3 — прибавка веса или повторов.</p><div className="day-plan">{homeWeek.map((d:any)=><details key={d.d} open={d.day===(new Date().getDay()||7)}><summary><span>{d.d}</span><div><i>{d.type}</i><h4>{d.title}</h4></div><b>{d.time}</b></summary>{d.warmup&&<><h5 className="plan-block-title">Разминка · выполнить перед кругами</h5><PlanExercises items={d.warmup}/><h5 className="plan-block-title">Основная часть</h5></>}<PlanExercises items={d.exercises}/></details>)}</div><h3 className="detail-title">С недели 4 · зал + кардио</h3><p className="detail-lead">Открой нужный день: внутри — полный список, техника и фотопримеры.</p><div className="day-plan">{week.map(d=><details key={d.d}><summary><span>{d.d}</span><div><i>{d.t}</i><h4>{d.n}</h4></div><b>{d.time}</b></summary><PlanExercises items={d.x}/></details>)}</div></div>;
 if(section==="Дорожная карта") return <div className="detail-page"><Intro k="ЛИЧНАЯ ДОРОЖНАЯ КАРТА · 5–7 МЕСЯЦЕВ" t="86 → 67 кг" p="Рост 167 см. Быстро, но без потери мышц: до 1 кг в неделю на старте, после 75 кг — 0,5–0,7 кг."/><div className="road-stats">{[["0,8–1,0","кг в неделю"],["3","силовых"],["3–4","кардио"],["5–7","месяцев"]].map(x=><article key={x[1]}><b>{x[0]}</b><span>{x[1]}</span></article>)}</div><Notice/><div className="phases">{phases.map((p,i)=><article key={p.p}><span>{String(i+1).padStart(2,"0")}</span><div><small>{p.p}</small><h3>{p.n}</h3><p>{p.g}</p><ul>{p.x.map(x=><li key={x}>{x}</li>)}</ul></div></article>)}</div><h3 className="detail-title">Правила тяжёлых дней</h3><div className="motivation-grid">{rules.map((r,i)=><article key={r}><span>{String(i+1).padStart(2,"0")}</span><p>{r}</p></article>)}</div></div>;
 if(section==="Питание") return <div className="detail-page"><Intro k="ПИТАНИЕ · БЕЗ ЗАПРЕТОВ" t="≈ 1700 ккал · 150 г белка" p="Белок в каждом приёме пищи, овощи в обед и ужин, вода перед едой. Готовь курицу и крупу на 2–3 дня."/><NutritionDiary data={data} refresh={refresh}/><div className="meal-list">{meals.map((m,i)=><article key={m[0]}><span>{String(i+1).padStart(2,"0")}</span><div><small>{m[0]}</small><h3>{m[1]}</h3></div><b>{m[2]}</b></article>)}</div><div className="nutrition-grid"><article><small>БЕЛОК</small><h3>Чередуй источники</h3><p>Курица, индейка, постная говядина, рыба, яйца, творог 5%, греческий йогурт и протеин.</p></article><article><small>ПИВО</small><h3>До 2 × 0,5 л в неделю</h3><p>≈ 450–500 ккал. Убрать хлеб на завтрак и гарнир на ужин. Не пить в день силовой и сразу после.</p></article><article><small>ПЕРЕДЫШКА</small><h3>Каждые 6–8 недель</h3><p>Неделя поддержки около 2300 ккал. Не опускаться ниже 1600 и не голодать после «плохого» дня.</p></article></div></div>;
 return <ProgressPage data={data} refresh={refresh} coachAction={coachAction}/>
}
function Notice(){return <div className="safety">✦ <span><b>Суставы под защитой</b>{safety}</span></div>}
function PlanExercises({items}:{items:any[]}){return <div className="plan-exercises">{items.map((x:any)=><article key={x[0]}>{x[3]&&<img src={x[3]} alt={`Пример: ${x[0]}`}/>}<div><h4>{x[0]}</h4><p>{x[1]}</p><b>{x[2]}</b></div><ExerciseVideo name={x[0]}/></article>)}</div>}

function AiKeySetup({onReady}:{onReady:()=>void}){
 const notify=useToast();
 const [value,setValue]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
 const save=async(e:any)=>{e.preventDefault();setError("");setBusy(true);const r=await fetch("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({anthropicKey:value})}),j=await r.json();setBusy(false);if(!r.ok)return setError(j.error||"Не удалось сохранить ключ");setValue("");notify("Ключ сохранён");onReady()};
 return <form className="ai-key-setup" onSubmit={save}><p><b>Распознавание фото не настроено.</b> Вставьте ключ Claude API (console.anthropic.com) — это нужно один раз, дальше заработает сразу.</p><div><input type="password" placeholder="sk-ant-api03-…" value={value} onChange={(e:any)=>setValue(e.target.value)} required minLength={20}/><button type="submit" disabled={busy}>{busy?"Сохраняю…":"Сохранить"}</button></div>{error&&<div className="food-error">{error}</div>}</form>;
}

function dayLabel(iso:string,today:string){
 if(iso===today)return "Сегодня";
 const yesterday=localIso(new Date(Date.now()-86400000));
 if(iso===yesterday)return "Вчера";
 return new Intl.DateTimeFormat("ru-RU",{weekday:"short",day:"numeric",month:"long"}).format(new Date(`${iso}T00:00:00`));
}

function NutritionDiary({data,refresh}:{data:any;refresh:()=>void}){
 const notify=useToast();
 const today=localIso(new Date());
 const [viewDate,setViewDate]=useState(today);
 const [error,setError]=useState(""),[saving,setSaving]=useState(false),[aiBusy,setAiBusy]=useState(false),[aiNote,setAiNote]=useState(""),[aiKeySet,setAiKeySet]=useState<boolean|null>(null);
 const logs=data.foodLogs||[],dayLogs=logs.filter((x:any)=>x.date===viewDate),sum=dayLogs.reduce((t:any,x:any)=>({calories:t.calories+x.calories,protein:t.protein+x.protein,fat:t.fat+x.fat,carbs:t.carbs+x.carbs}),{calories:0,protein:0,fat:0,carbs:0});
 const history=useMemo(()=>{
  const byDate=new Map<string,number>();
  for(const x of (data.foodLogs||[]))byDate.set(x.date,(byDate.get(x.date)||0)+(Number(x.calories)||0));
  const days=[...Array(14)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-(13-i));const iso=localIso(d);return {iso,short:new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"numeric"}).format(d),calories:byDate.get(iso)||0}});
  return days;
 },[data.foodLogs]);
 useEffect(()=>{fetch("/api/settings").then(r=>r.json()).then(j=>setAiKeySet(!!j.anthropicKeySet)).catch(()=>setAiKeySet(true))},[]);
 const photoAI=async(e:any)=>{const input=e.currentTarget,files=[...(input.files||[])].slice(0,3),form=input.closest("form");if(!files.length)return;setError("");setAiBusy(true);try{const fd=new FormData();for(const f of files)fd.append("photo",f);const r=await fetch("/api/food-photo",{method:"POST",body:fd}),j=await r.json();if(!r.ok)setError(j.error||"Не удалось распознать фото");else{const ta=form?.elements.namedItem("rawText") as HTMLTextAreaElement;if(ta)ta.value=(ta.value.trim()?ta.value.trim()+"\n":"")+j.text;if(j.note)setAiNote(j.note)}}catch{setError("Не удалось распознать фото")}finally{setAiBusy(false);input.value=""}};
 const submit=async(e:any)=>{e.preventDefault();setError("");setSaving(true);const form=e.currentTarget,body=Object.fromEntries(new FormData(form));const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"food",...body})}),j=await r.json();setSaving(false);if(!r.ok)return setError(j.error||"Не удалось сохранить");form.reset();setAiNote("");notify("Приём пищи сохранён");refresh()};
 const remove=async(id:number)=>{if(!confirm("Удалить этот приём пищи? Дневные показатели будут пересчитаны."))return;const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"deleteFood",id})});if(r.ok){notify("Запись удалена");refresh()}else setError("Не удалось удалить запись")};
 const shiftDay=(delta:number)=>{const d=new Date(`${viewDate}T00:00:00`);d.setDate(d.getDate()+delta);const iso=localIso(d);if(iso<=today)setViewDate(iso)};
 return <section className="food-diary"><div className="section-head"><div><p className="eyebrow">ДНЕВНИК ПИТАНИЯ</p><h3>{dayLabel(viewDate,today)}</h3></div><b>{Math.round(sum.calories)} / 1700 ккал</b></div>
  <div className="food-day-nav"><button type="button" onClick={()=>shiftDay(-1)} aria-label="Предыдущий день">←</button><input type="date" value={viewDate} max={today} onChange={e=>e.target.value&&setViewDate(e.target.value)}/><button type="button" onClick={()=>shiftDay(1)} disabled={viewDate>=today} aria-label="Следующий день">→</button></div>
  <div className="macro-scales"><Macro label="Калории" value={sum.calories} goal={1700} unit="ккал"/><Macro label="Белки" value={sum.protein} goal={150} unit="г"/><Macro label="Жиры" value={sum.fat} goal={60} unit="г"/><Macro label="Углеводы" value={sum.carbs} goal={170} unit="г"/></div>
  <div className="chart-wrap food-history-chart">
   <div className="chart-labels"><span>1700</span><span>1275</span><span>850</span><span>425</span><span>0</span></div>
   <div className="bars" aria-label="Калории за последние 14 дней">{history.map(d=><div className="bar-slot" key={d.iso} title={`${d.short}: ${Math.round(d.calories)} ккал`}><i style={{height:`${Math.min(100,d.calories/1700*100)}%`}} className={d.iso===viewDate?"today":""}/></div>)}</div>
  </div>
  {aiKeySet===false&&<AiKeySetup onReady={()=>setAiKeySet(true)}/>}<form onSubmit={submit}><label className="food-date">Дата<input name="date" type="date" defaultValue={viewDate} key={viewDate} required/></label><label className="food-kind">Приём пищи<select name="mealType" defaultValue="Завтрак"><option>Завтрак</option><option>Обед</option><option>Ужин</option><option>Перекус</option></select></label><div className="food-photo-row"><label className="food-photo">{aiBusy?"⏳ Распознаю…":"📷 Снять фото"}<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={photoAI} disabled={aiBusy||!aiKeySet} hidden/></label><label className="food-photo">{aiBusy?"⏳ Распознаю…":"🖼 Из галереи"}<input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={photoAI} disabled={aiBusy||!aiKeySet} hidden/></label></div>{aiNote&&<p className="food-ai-note"><b>Оценка:</b> {aiNote}<input type="hidden" name="note" value={aiNote}/></p>}<label className="food-text">Вставьте описание приёма пищи (можно просто словами — ИИ оценит КБЖУ)<textarea name="rawText" rows={8} required placeholder={'Например: Омлет из 5 яиц + чашка рамен\n\nили точный формат:\n🍲 Бульон говяжий с яйцом — 130 ккал (Б 10 / Ж 8 / У 2)\n🦃 Индейка запечённая — 350 ккал (Б 58 / Ж 11 / У 3)'}/></label>{error&&<div className="food-error">{error}</div>}<button type="submit" disabled={saving}><span>＋</span>{saving?"Обрабатываю…":"Отправить и рассчитать"}</button></form>{dayLogs.length>0&&<div className="food-log-list">{dayLogs.map((log:any)=><article key={log.id} className={`meal-${String(log.mealType).toLowerCase()}`}><header><div><em>{log.mealType}</em><b>{log.items.length} блюда</b></div><span>{Math.round(log.calories)} ккал · Б {log.protein} / Ж {log.fat} / У {log.carbs}</span><button onClick={()=>remove(log.id)} aria-label={`Удалить ${log.mealType}`} title="Удалить запись">×</button></header>{log.items.map((x:any)=><p key={x.name}><span>{x.name}</span><b>{x.calories} ккал</b></p>)}{log.note&&<footer className="food-note">💬 {log.note}</footer>}</article>)}</div>}</section>
}
function Macro({label,value,goal,unit}:{label:string;value:number;goal:number;unit:string}){const p=Math.min(100,Math.round(value/goal*100));return <article><div><span>{label}</span><b>{Math.round(value)} / {goal} {unit}</b></div><div className="macro-bar"><i style={{width:`${p}%`}}/></div><small>{p}%</small></article>}

function ProgressPage({data,refresh,coachAction}:{data:any;refresh:()=>void;coachAction:CoachAction|null}){
 const notify=useToast();
 const [tab,setTab]=useState("Тело");
 const [formOpen,setFormOpen]=useState(false);
 const [chartPeriod,setChartPeriod]=useState<Period>("3M");
 const [historyPeriod,setHistoryPeriod]=useState<Period>("ALL");
 const [historyOpen,setHistoryOpen]=useState(false);
 const [historyVisible,setHistoryVisible]=useState(5);
 const [editingId,setEditingId]=useState<number|null>(null);
 const [menuOpenId,setMenuOpenId]=useState<number|null>(null);
 const [photoVisible,setPhotoVisible]=useState(8);

 const measurements:Measurement[]=useMemo(()=>data.measurements||[],[data.measurements]);
 const workouts=useMemo(()=>data.workouts||[],[data.workouts]);
 const photos=data.photos||[];
 const profile=useMemo(()=>({name:data.profile?.name||"Илья",height:Number(data.profile?.height??167),startWeight:Number(data.profile?.startWeight??86),targetWeight:Number(data.profile?.targetWeight??67)}),[data.profile]);
 const anchor=useMemo(()=>new Date(),[]);
 const summary=useMemo(()=>computeProgressSummary(measurements,profile,workouts,anchor),[measurements,profile,workouts,anchor]);
 const cards=useMemo(()=>computeMetricCards(measurements),[measurements]);
 const history=useMemo(()=>buildHistory(measurements),[measurements]);
 const historyFiltered=useMemo(()=>filterHistoryByPeriod(history,historyPeriod,anchor),[history,historyPeriod,anchor]);

 const deletePhoto=async(id:number)=>{if(!confirm("Удалить это фото? Действие необратимо."))return;await fetch(`/api/photos?id=${id}`,{method:"DELETE"});notify("Фото удалено");refresh()};
 const deleteMeasurementRow=async(id:number)=>{if(!confirm("Удалить этот замер?"))return;await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"deleteMeasurement",id})});notify("Замер удалён");refresh()};
 const submitEdit=async(e:any,id:number)=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"updateMeasurement",id,...b})});setEditingId(null);refresh();notify("Замер обновлён")};
 const submitProfile=async(e:any)=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"profile",...b})});notify("Профиль обновлён");refresh()};

 return <div className="detail-page"><Intro k="ПРОФИЛЬ И ПРОГРЕСС" t={profile.name} p="Тренировки, замеры и фотографии сохраняются в персональном профиле."/>
 <div className="metric-tabs" role="group" aria-label="Раздел прогресса">{["Тело","Тренировки","Аналитика"].map(x=><button key={x} type="button" data-tour-id={x==="Аналитика"?"tab-analytics":undefined} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</div>
 {tab==="Тело"&&<>
 <ProgressSummaryHero summary={summary} profile={profile}/>

 <div className="section-head"><div><p className="eyebrow">ДИНАМИКА ЗАМЕРОВ</p><h3>Замеры</h3></div><button type="button" className={formOpen?"ghost-btn":"add-measurement-btn"} onClick={()=>setFormOpen(v=>!v)}>{formOpen?"Закрыть":"+ Новый замер"}</button></div>
 {formOpen&&<MeasurementForm previous={history[0]} onClose={()=>setFormOpen(false)} onSaved={()=>{setFormOpen(false);refresh();notify("Замер сохранён")}}/>}
 <MeasurementChart measurements={measurements} target={profile.targetWeight} period={chartPeriod} onPeriodChange={setChartPeriod} anchor={anchor}/>

 <h3 className="detail-title">Карточки показателей</h3>
 <MetricCardsGrid cards={cards}/>

 <h3 className="detail-title">Фото · прогресс</h3><p className="detail-lead">Фото скрыты по умолчанию — нажми, чтобы показать.</p>
 <PhotoCompareSection photos={photos} onDelete={deletePhoto} visible={photoVisible} onShowMore={()=>setPhotoVisible(v=>v+8)}/>
 <form className="photo-form" onSubmit={async e=>{e.preventDefault();await fetch("/api/photos",{method:"POST",body:new FormData(e.currentTarget)});e.currentTarget.reset();notify("Фото добавлено");refresh()}}><input name="date" type="date" defaultValue={localIso(new Date())}/><input required name="photo" type="file" accept="image/*"/><button>+ Добавить фото</button></form>

 <MeasurementHistory history={history} filtered={historyFiltered} period={historyPeriod} onPeriodChange={setHistoryPeriod}
  open={historyOpen} onToggleOpen={()=>{setHistoryOpen(v=>!v);setHistoryVisible(5)}}
  visible={historyVisible} onShowMore={()=>setHistoryVisible(v=>v+30)}
  editingId={editingId} onStartEdit={setEditingId} onCancelEdit={()=>setEditingId(null)} onSaveEdit={submitEdit}
  onDelete={deleteMeasurementRow} menuOpenId={menuOpenId} onToggleMenu={(id:number)=>setMenuOpenId(v=>v===id?null:id)}/>

 <BodyMap data={data} refresh={refresh}/>
 <Notice/>

 <ProfileSection profile={profile} onSubmit={submitProfile}/>
 </>}
 {tab==="Тренировки"&&<>
 <WorkoutHistory workouts={data.workouts||[]} refresh={refresh}/>
 <StrengthLog data={data} refresh={refresh}/>
 <StrengthAdvice data={data} coachAction={coachAction}/>
 <PersonalRecords data={data}/>
 <GarminImport refresh={refresh}/>
 </>}
 {tab==="Аналитика"&&<>
 <TrainingAnalytics data={data}/>
 <TrainingCalendar data={data}/>
 </>}
 </div>
}

function ProgressSummaryHero({summary,profile}:{summary:ProgressSummary;profile:{startWeight:number;targetWeight:number}}){
 if(summary.state==="empty")return <div className="progress-hero empty-hero"><div><small>ПРОГРЕСС</small><h3>Пока нет замеров</h3><p>Добавь первый замер веса ниже, чтобы начать отслеживать прогресс.</p></div></div>;
 const pct=summary.goalPct!=null?Math.round(summary.goalPct):null;
 const fmt=(v:number|null)=>v==null?null:`${v>0?"+":""}${v.toFixed(1)} кг`;
 const showMonthly=summary.state==="monthly"||summary.state==="long";
 return <div className="progress-hero">
  <div className="big-ring" style={pct!=null?{background:`conic-gradient(var(--lime) ${pct}%, #2a2e30 ${pct}%)`}:undefined}><div><b>{summary.currentWeight}</b><span>кг сейчас</span></div></div>
  <div>
   <small>ЦЕЛЬ</small><h3>{profile.startWeight} → {profile.targetWeight} кг</h3>
   <div className="goal-progress"><i style={{width:`${pct??0}%`}}/></div>
   <div className="progress-summary-facts">
    {showMonthly&&<div><small>За 30 дней</small><b>{fmt(summary.change30d)??"—"}</b></div>}
    {summary.state==="early"&&<div><small>Изменение</small><b>{fmt(summary.changeSinceStart)??"—"}</b></div>}
    {(showMonthly)&&<div><small>С начала</small><b>{fmt(summary.changeSinceStart)??"—"}</b></div>}
    <div><small>Осталось</small><b>{summary.remainingToGoal!=null?`${summary.remainingToGoal} кг`:"—"}</b></div>
    <div><small>Последний замер</small><b>{summary.lastDate||"—"}</b></div>
    <div><small>Тренировок / 30д</small><b>{summary.workoutsLast30d}</b></div>
   </div>
  </div>
 </div>
}

function MeasurementForm({previous,onClose,onSaved}:{previous?:HistoryEntry;onClose:()=>void;onSaved:()=>void}){
 const [expanded,setExpanded]=useState(false);
 const [saving,setSaving]=useState(false);
 const submit=async(e:any)=>{e.preventDefault();setSaving(true);const form=e.currentTarget,b=Object.fromEntries(new FormData(form));await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"measurement",...b})});setSaving(false);onSaved()};
 const prevOf=(key:string)=>previous?(previous as any)[key]:null;
 return <form className="measure-form-card" onSubmit={submit}>
  <div className="measure-form-primary">
   <label>Дата<input required name="date" type="date" defaultValue={localIso(new Date())}/></label>
   <label>Вес, кг{prevOf("weight")!=null&&<em>было {prevOf("weight")}</em>}<input name="weight" type="number" step="0.1" placeholder={prevOf("weight")!=null?String(prevOf("weight")):undefined}/></label>
  </div>
  <button type="button" className="measure-form-toggle" onClick={()=>setExpanded(v=>!v)}>{expanded?"− Скрыть обхваты":"+ Добавить обхваты"}</button>
  {expanded&&<div className="measure-form-secondary">
   {(["waist","chest","biceps","thigh","neck"] as const).map(key=><label key={key}>{METRIC_LABELS[key]}, {METRIC_UNITS[key]}{prevOf(key)!=null&&<em>было {prevOf(key)}</em>}<input name={key} type="number" step="0.1" placeholder={prevOf(key)!=null?String(prevOf(key)):undefined}/></label>)}
  </div>}
  <div className="measure-form-actions"><button type="button" className="ghost-btn" onClick={onClose}>Отмена</button><button type="submit" disabled={saving}>{saving?"Сохраняю…":"Сохранить замер"}</button></div>
 </form>
}

function MeasurementChart({measurements,target,period,onPeriodChange,anchor}:{measurements:Measurement[];target:number;period:Period;onPeriodChange:(p:Period)=>void;anchor:Date}){
 const [metric,setMetric]=useState<MetricKey>("weight");
 const stats=useMemo(()=>computeMetricStats(measurements,metric,period,anchor),[measurements,metric,period,anchor]);
 return <div>
  <div className="metric-tabs" role="group" aria-label="Выбор замера">{MEASUREMENT_KEYS.map(key=><button key={key} type="button" className={metric===key?"active":""} onClick={()=>setMetric(key)}>{METRIC_LABELS[key]}</button>)}</div>
  <div className="period-tabs" role="group" aria-label="Период графика">{PERIODS.map(p=><button key={p} type="button" className={period===p?"active":""} onClick={()=>onPeriodChange(p)}>{PERIOD_LABELS[p]}</button>)}</div>
  <MetricStatsRow stats={stats} unit={METRIC_UNITS[metric]}/>
  <SeriesChart points={stats.points} label={METRIC_LABELS[metric]} unit={METRIC_UNITS[metric]} target={metric==="weight"?target:undefined}/>
 </div>
}

function MetricStatsRow({stats,unit}:{stats:MetricStats;unit:string}){
 const fmtChange=(v:number|null)=>v==null?"—":`${v>0?"+":""}${v.toFixed(1)} ${unit}`;
 return <div className="metric-stats-row">
  <div><small>Сейчас</small><b>{stats.last!=null?`${stats.last} ${unit}`:"—"}</b></div>
  <div><small>За период</small><b>{fmtChange(stats.changeInPeriod)}</b></div>
  <div><small>С начала</small><b>{fmtChange(stats.changeSinceStart)}</b></div>
  <div><small>Мин / Макс</small><b>{stats.min!=null?`${stats.min} / ${stats.max}`:"—"}</b></div>
  <div><small>Замеров</small><b>{stats.count}</b></div>
 </div>
}

function SeriesChart({points,label,unit,target}:{points:MetricPoint[];label:string;unit:string;target?:number}){
 if(points.length<2)return <p className="detail-lead">{points.length===0?`Нет данных «${label}» за выбранный период.`:`Добавь ещё один замер «${label}», чтобы увидеть график.`}</p>;
 const r1=(n:number)=>Math.round(n*10)/10;
 const values=points.map(p=>p.value);
 const min=Math.min(...values,...(target!=null?[target]:[])), max=Math.max(...values,...(target!=null?[target]:[]));
 const padV=(max-min)*0.08||1, lo=min-padV, hi=max+padV;
 const w=680,h=180,padX=10,padY=10;
 const x=(i:number)=>padX+(i/(points.length-1))*(w-2*padX), y=(v:number)=>h-padY-((v-lo)/((hi-lo)||1))*(h-2*padY);
 const path=points.map((p,i)=>`${i===0?"M":"L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
 const trend=computeTrendPoints(points);
 return <div className="weight-chart">
  <div className="chart-y-axis"><span>{hi.toFixed(1)}</span><span>{lo.toFixed(1)}</span></div>
  <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`График «${label}» по замерам`}>
   {target!=null&&<line x1={padX} y1={y(target)} x2={w-padX} y2={y(target)} stroke="var(--line)" strokeDasharray="4 4"/>}
   {trend&&<line x1={x(0)} y1={y(trend[0].value)} x2={x(points.length-1)} y2={y(trend[1].value)} stroke="#5b6469" strokeWidth="1.5" strokeDasharray="2 4"/>}
   <path d={path} fill="none" stroke="var(--lime)" strokeWidth="2.5"/>
   {points.map((p,i)=>{const prev=points[i-1],diff=prev?r1(p.value-prev.value):null;return <circle key={p.id} cx={x(i)} cy={y(p.value)} r="3.5" fill="var(--lime)"><title>{`${p.date} · ${p.value} ${unit}${diff!=null?` (${diff>0?"+":""}${diff})`:""}`}</title></circle>})}
  </svg>
  <div className="weight-chart-labels"><span>{points[0].date}</span><span>{target!=null?`Цель ${target} ${unit}`:`${label}, ${unit}`}</span><span>{points[points.length-1].date}</span></div>
 </div>
}

function MetricCardsGrid({cards}:{cards:MetricCardData[]}){
 return <div className="metric-cards-grid">{cards.map(c=><article key={c.key} className="metric-card-item">
  <small>{c.label}</small>
  <b>{c.hasData?`${c.last} ${c.unit}`:"—"}</b>
  <div className="metric-card-deltas">
   <span>{c.change30d!=null?`${c.change30d>0?"+":""}${c.change30d} за 30д`:"— за 30д"}</span>
   <span>{c.changeSinceStart!=null?`${c.changeSinceStart>0?"+":""}${c.changeSinceStart} с начала`:"— с начала"}</span>
  </div>
  <small className="metric-card-date">{c.lastDate?`Обновлено ${c.lastDate}`:"Нет данных"}</small>
 </article>)}</div>
}

function PhotoCompareSection({photos,onDelete,visible,onShowMore}:{photos:any[];onDelete:(id:number)=>void;visible:number;onShowMore:()=>void}){
 const sorted=useMemo(()=>[...photos].sort((a,b)=>a.date.localeCompare(b.date)),[photos]);
 const [idxA,setIdxA]=useState<number|null>(null);
 const [idxB,setIdxB]=useState<number|null>(null);
 const resolvedA=Math.min(idxA??0,Math.max(0,sorted.length-1));
 const resolvedB=Math.min(idxB??Math.max(0,sorted.length-1),Math.max(0,sorted.length-1));
 const a=sorted[resolvedA], b=sorted[resolvedB];
 const strip=useMemo(()=>[...sorted].reverse().slice(0,visible),[sorted,visible]);
 return <div>
  {sorted.length>0&&<div className="photo-date-picker">
   <label>Дата «до»<select value={resolvedA} onChange={e=>setIdxA(Number(e.target.value))}>{sorted.map((p,i)=><option key={p.id} value={i}>{p.date}</option>)}</select></label>
   <label>Дата «после»<select value={resolvedB} onChange={e=>setIdxB(Number(e.target.value))}>{sorted.map((p,i)=><option key={p.id} value={i}>{p.date}</option>)}</select></label>
  </div>}
  <div className="photo-compare"><Photo item={a} title="ДО" onDelete={onDelete}/><Photo item={b} title="ПОСЛЕ" onDelete={onDelete}/></div>
  {sorted.length>2&&<div className="photo-strip">{strip.map(p=><Photo key={p.id} item={p} title={p.date} onDelete={onDelete} compact/>)}</div>}
  {visible<sorted.length&&<button type="button" className="ghost-btn" onClick={onShowMore}>Показать ещё фото</button>}
 </div>
}

function MeasurementHistory({history,filtered,period,onPeriodChange,open,onToggleOpen,visible,onShowMore,editingId,onStartEdit,onCancelEdit,onSaveEdit,onDelete,menuOpenId,onToggleMenu}:{
 history:HistoryEntry[];filtered:HistoryEntry[];period:Period;onPeriodChange:(p:Period)=>void;open:boolean;onToggleOpen:()=>void;visible:number;onShowMore:()=>void;
 editingId:number|null;onStartEdit:(id:number)=>void;onCancelEdit:()=>void;onSaveEdit:(e:any,id:number)=>void;onDelete:(id:number)=>void;menuOpenId:number|null;onToggleMenu:(id:number)=>void;
}){
 const shown=open?filtered.slice(0,visible):history.slice(0,5);
 const rowProps={editingId,menuOpenId,onToggleMenu,onStartEdit,onCancelEdit,onSaveEdit,onDelete};
 return <section>
  <div className="section-head"><div><p className="eyebrow">ИСТОРИЯ ЗАМЕРОВ</p><h3>Записи{!open&&history.length>5?` (последние 5 из ${history.length})`:""}</h3></div>{history.length>5&&<button type="button" className="ghost-btn" onClick={onToggleOpen}>{open?"Свернуть":"Вся история"}</button>}</div>
  {open&&<div className="period-tabs" role="group" aria-label="Период истории">{PERIODS.map(p=><button key={p} type="button" className={period===p?"active":""} onClick={()=>onPeriodChange(p)}>{PERIOD_LABELS[p]}</button>)}</div>}
  {history.length===0?<p className="detail-lead">Пока нет ни одного замера.</p>:open?
   <GroupedHistory groups={groupHistoryByMonth(shown)} {...rowProps}/>:
   <div className="measure-table">{shown.map(entry=><HistoryRow key={entry.id} entry={entry} {...rowProps}/>)}</div>}
  {open&&visible<filtered.length&&<button type="button" className="ghost-btn load-more" onClick={onShowMore}>Показать ещё ({Math.min(30,filtered.length-visible)})</button>}
 </section>
}

function GroupedHistory({groups,...rowProps}:{groups:ReturnType<typeof groupHistoryByMonth>}&Omit<Parameters<typeof HistoryRow>[0],"entry">){
 return <div className="history-grouped">{groups.map(y=><div key={y.year} className="history-year"><h4>{y.year}</h4>{y.months.map(mo=><div key={mo.key} className="history-month"><small>{mo.label}</small><div className="measure-table">{mo.entries.map(entry=><HistoryRow key={entry.id} entry={entry} {...rowProps}/>)}</div></div>)}</div>)}</div>
}

function HistoryRow({entry,editingId,menuOpenId,onToggleMenu,onStartEdit,onCancelEdit,onSaveEdit,onDelete}:{
 entry:HistoryEntry;editingId:number|null;menuOpenId:number|null;onToggleMenu:(id:number)=>void;onStartEdit:(id:number)=>void;onCancelEdit:()=>void;onSaveEdit:(e:any,id:number)=>void;onDelete:(id:number)=>void;
}){
 if(editingId===entry.id)return <HistoryEditForm entry={entry} onCancel={onCancelEdit} onSave={onSaveEdit}/>;
 return <article className="history-row">
  <b>{entry.date}</b>
  <span>{entry.weight??"—"} кг{entry.deltaWeight!=null&&<em className={`history-delta${entry.deltaWeight>0?" up":entry.deltaWeight<0?" down":""}`}>{entry.deltaWeight>0?"+":""}{entry.deltaWeight}</em>}</span>
  <span>Талия {entry.waist??"—"}</span><span>Грудь {entry.chest??"—"}</span><span>Бицепс {entry.biceps??"—"}</span><span>Бедро {entry.thigh??"—"}</span><span>Шея {entry.neck??"—"}</span>
  <div className="history-row-menu">
   <button type="button" className="history-menu-btn" aria-label="Действия с записью" onClick={()=>onToggleMenu(entry.id)}>•••</button>
   {menuOpenId===entry.id&&<div className="history-menu-pop">
    <button type="button" onClick={()=>{onStartEdit(entry.id);onToggleMenu(entry.id)}}>Изменить</button>
    <button type="button" className="danger" onClick={()=>{onDelete(entry.id);onToggleMenu(entry.id)}}>Удалить</button>
   </div>}
  </div>
 </article>
}

function HistoryEditForm({entry,onCancel,onSave}:{entry:HistoryEntry;onCancel:()=>void;onSave:(e:any,id:number)=>void}){
 return <form className="history-edit-form" onSubmit={e=>onSave(e,entry.id)}>
  <label>Дата<input required name="date" type="date" defaultValue={entry.date}/></label>
  {MEASUREMENT_KEYS.map(key=><label key={key}>{METRIC_LABELS[key]}<input name={key} type="number" step="0.1" defaultValue={(entry as any)[key]??""}/></label>)}
  <div className="history-edit-actions"><button type="button" className="ghost-btn" onClick={onCancel}>Отмена</button><button type="submit">Сохранить</button></div>
 </form>
}

function ProfileSection({profile,onSubmit}:{profile:{name:string;height:number;startWeight:number;targetWeight:number};onSubmit:(e:any)=>void}){
 return <details className="profile-collapse"><summary><p className="eyebrow">ПРОФИЛЬ И ЦЕЛЬ</p><h3>{profile.name}</h3></summary>
  <form className="data-form" onSubmit={onSubmit}><label>Имя<input name="name" defaultValue={profile.name}/></label><label>Рост<input name="height" type="number" defaultValue={profile.height}/></label><label>Стартовый вес<input name="startWeight" type="number" step="0.1" defaultValue={profile.startWeight}/></label><label>Цель<input name="targetWeight" type="number" step="0.1" defaultValue={profile.targetWeight}/></label><button>Сохранить профиль</button></form>
 </details>
}
function WorkoutHistory({workouts,refresh}:{workouts:any[];refresh:()=>void}){
 const notify=useToast();
 const [message,setMessage]=useState(""); const clock=(n:number)=>`${Math.floor((Number(n)||0)/60)} мин ${String((Number(n)||0)%60).padStart(2,"0")} сек`;
 const save=async(e:any,w:any)=>{e.preventDefault();setMessage("");const form=e.currentTarget,raw:any=Object.fromEntries(new FormData(form)),details=(w.details||[]).map((x:any,i:number)=>({...x,value:Number(raw[`detail-${i}`])||0}));const body={action:"updateWorkout",id:w.id,date:raw.date,type:raw.type,title:raw.title,rounds:raw.rounds,durationSeconds:Math.round((Number(raw.durationMinutes)||0)*60),restSeconds:Math.round((Number(raw.restMinutes)||0)*60),minHeartRate:raw.minHeartRate,avgHeartRate:raw.avgHeartRate,maxHeartRate:raw.maxHeartRate,calories:raw.calories,distanceMeters:raw.distanceMeters,avgSpeed:raw.avgSpeed,details};const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});if(!r.ok){const j=await r.json();notify(j.error||"Не удалось сохранить","warn");return setMessage(j.error||"Не удалось сохранить")};setMessage("Изменения сохранены");notify("Тренировка обновлена");refresh()};
 return <section className="workout-history"><div className="section-head"><div><p className="eyebrow">ЖУРНАЛ ТРЕНИРОВОК</p><h3>Предыдущие тренировки</h3></div><b>{workouts.length}</b></div>{message&&<p className="history-message">{message}</p>}<div>{workouts.length===0?<p className="detail-lead">Завершённые тренировки появятся здесь.</p>:workouts.map(w=><details key={w.id} className="history-card"><summary><div><small>{w.date} · {w.type}</small><h4>{w.title}</h4></div><span><b>{clock(w.durationSeconds)}</b><em>Пульс {w.avgHeartRate||"—"}</em></span></summary><form onSubmit={e=>save(e,w)}><div className="history-fields"><label>Дата<input name="date" type="date" required defaultValue={w.date}/></label><label>Тип<select name="type" defaultValue={w.type}><option>Силовая</option><option>Кардио</option><option>Плавание</option><option>Восстановление</option></select></label><label>Название<input name="title" required defaultValue={w.title}/></label><label>Круги<input name="rounds" type="number" min="1" max="20" defaultValue={w.rounds}/></label><label>Активное время, мин<input name="durationMinutes" type="number" min="0" step="0.01" defaultValue={((w.durationSeconds||0)/60).toFixed(2)}/></label><label>Отдых, мин<input name="restMinutes" type="number" min="0" step="0.01" defaultValue={((w.restSeconds||0)/60).toFixed(2)}/></label><label>Мин. пульс<input name="minHeartRate" type="number" min="0" max="250" defaultValue={w.minHeartRate||0}/></label><label>Средний пульс<input name="avgHeartRate" type="number" min="0" max="250" defaultValue={w.avgHeartRate||0}/></label><label>Макс. пульс<input name="maxHeartRate" type="number" min="0" max="250" defaultValue={w.maxHeartRate||0}/></label><label>Калории<input name="calories" type="number" min="0" defaultValue={w.calories||0}/></label><label>Расстояние, м<input name="distanceMeters" type="number" min="0" step="0.1" defaultValue={w.distanceMeters||0}/></label><label>Скорость, км/ч<input name="avgSpeed" type="number" min="0" step="0.1" defaultValue={w.avgSpeed||0}/></label></div>{w.details?.length>0&&<div className="history-exercises"><h5>Фактически выполнено</h5>{w.details.map((x:any,i:number)=><label key={`${x.key}-${i}`}><span>{x.name}</span><input name={`detail-${i}`} type="number" min="0" defaultValue={x.value}/><em>{x.unit}</em></label>)}</div>}<button>Сохранить изменения</button></form></details>)}</div></section>
}
function Photo({item,title,onDelete,compact}:{item:any;title:string;onDelete?:(id:number)=>void;compact?:boolean}){
 const [revealed,setRevealed]=useState(false);
 if(!item) return <article className={compact?"priv-wrap compact":undefined}><span>{title}</span><div>Фото ещё не загружено</div></article>;
 return <article className={`priv-wrap${revealed?" revealed":""}${compact?" compact":""}`}>
  <span>{title}</span>
  <img className="priv-photo" src={item.url} alt={`Фото ${title.toLowerCase()}`}/>
  {!revealed&&<button type="button" className="priv-reveal" onClick={()=>setRevealed(true)}>👁 Показать фото</button>}
  {onDelete&&<button type="button" className="photo-delete" aria-label="Удалить фото" title="Удалить фото" onClick={()=>onDelete(item.id)}>×</button>}
  <small>{item.date}</small>
 </article>
}

function StrengthLog({data,refresh}:{data:any;refresh:()=>void}){
 const notify=useToast();
 const logs=data.strengthLogs||[];
 const [exercise,setExercise]=useState(gymExercises[0]||"");
 const submit=async(e:any)=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"strength",...b})});e.currentTarget.reset();notify("Рабочий вес записан");refresh()};
 const remove=async(id:number)=>{await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"deleteStrength",id})});notify("Запись удалена");refresh()};
 const history=logs.filter((x:any)=>x.exercise===exercise).sort((a:any,b:any)=>a.date.localeCompare(b.date));
 const ordered=[...history].reverse(), latest=ordered[0], prev=ordered[1];
 const trend=latest&&prev?Number(latest.weight)-Number(prev.weight):null;
 return <section className="strength-card card"><div className="section-head"><div><p className="eyebrow">ЗАЛ</p><h3>Рабочие веса</h3></div></div>
  <form onSubmit={submit} className="strength-form"><label>Упражнение<select name="exercise" value={exercise} onChange={e=>setExercise(e.target.value)}>{gymExercises.map(x=><option key={x} value={x}>{x}</option>)}</select></label><label>Дата<input name="date" type="date" required defaultValue={localIso(new Date())}/></label><label>Рабочий вес, кг<input name="weight" type="number" min="0" step="0.5" required/></label><label>Повторы<input name="reps" type="number" min="0"/></label><label>Сложность<select name="difficulty" defaultValue="Нормально"><option>Легко</option><option>Нормально</option><option>Тяжело</option><option>Боль</option></select></label><button>Записать</button></form>
  {history.length>0?<>
   <SeriesChart points={history.map((x:any)=>({id:x.id,date:x.date,value:Number(x.weight)}))} label={exercise} unit="кг"/>
   {trend!=null&&<p className="detail-lead">{trend>0?`+${trend.toFixed(1)} кг с прошлого раза — прогресс.`:trend<0?`${trend.toFixed(1)} кг с прошлого раза.`:"Вес не изменился с прошлого раза."}</p>}
   <div className="strength-history">{ordered.slice(0,10).map((x:any)=><article key={x.id}><b>{x.date}</b><span>{x.weight} кг{x.reps?` × ${x.reps}`:""}</span><button type="button" onClick={()=>remove(x.id)} aria-label="Удалить запись">×</button></article>)}</div>
  </>:<p className="detail-lead">Пока нет записей по «{exercise}».</p>}
 </section>
}
function WeeklyDigest({data,weekWorkouts,weekDates,currentWeight}:{data:any;weekWorkouts:any[];weekDates:Set<string>;currentWeight:number}){
 const hrs=weekWorkouts.filter((w:any)=>Number(w.avgHeartRate)>0).map((w:any)=>Number(w.avgHeartRate));
 const avgHr=hrs.length?Math.round(hrs.reduce((a:number,b:number)=>a+b,0)/hrs.length):null;
 const activity=data.activity||[];
 const dryDays=activity.filter((x:any)=>weekDates.has(x.date)&&Number(x.beers)===0).length;
 const sleepVals=activity.filter((x:any)=>weekDates.has(x.date)&&Number(x.sleepHours)>0).map((x:any)=>Number(x.sleepHours));
 const avgSleep=sleepVals.length?sleepVals.reduce((a:number,b:number)=>a+b,0)/sleepVals.length:null;
 const cutoff=new Date();cutoff.setDate(cutoff.getDate()-7);const cutoffIso=localIso(cutoff);
 const past=(data.measurements||[]).filter((m:any)=>m.weight!=null&&m.date<=cutoffIso).sort((a:any,b:any)=>b.date.localeCompare(a.date))[0];
 const weightChange=past?currentWeight-Number(past.weight):null;
 return <section className="digest-card card"><div className="section-head"><div><p className="eyebrow">ИТОГИ НЕДЕЛИ</p><h3>Как прошла неделя</h3></div></div>
  <div className="digest-grid">
   <article><b>{weekWorkouts.length}</b><span>тренировок</span></article>
   <article><b>{weightChange!=null?`${weightChange<=0?"−":"+"}${Math.abs(weightChange).toFixed(1)}`:"—"}</b><span>кг за неделю</span></article>
   <article><b>{avgHr??"—"}</b><span>средний пульс</span></article>
   <article><b>{dryDays}</b><span>дней без пива</span></article>
   <article><b>{avgSleep!=null?avgSleep.toFixed(1):"—"}</b><span>ч сна в среднем</span></article>
  </div>
 </section>
}

function MoodCheckin({data,refresh}:{data:any;refresh:()=>void}){
 const notify=useToast();
 const [note,setNote]=useState(""), [saving,setSaving]=useState(false), today=localIso(new Date());
 const moods=["😊","🙂","😐","😔","😢","😡"];
 const log=async(mood:string)=>{setSaving(true);await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"mood",date:today,mood,note})});setNote("");setSaving(false);notify("Состояние отмечено");refresh()};
 const remove=async(id:number)=>{await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"deleteMood",id})});notify("Запись удалена");refresh()};
 const recent=(data.moodLogs||[]).slice(0,5);
 return <section className="mood-card card"><div className="section-head"><div><p className="eyebrow">КАК ТЫ СЕЙЧАС</p><h3>Отметь состояние</h3></div></div>
  <div className="mood-picker">{moods.map(m=><button key={m} type="button" disabled={saving} onClick={()=>log(m)}>{m}</button>)}</div>
  <input className="mood-note" placeholder="Коротко, если хочешь (необязательно)" value={note} onChange={e=>setNote(e.target.value)} maxLength={300}/>
  {recent.length>0&&<div className="mood-log">{recent.map((m:any)=><div key={m.id} className="mood-entry"><span>{m.mood}</span><small>{m.date}{m.note?` · ${m.note}`:""}</small><button type="button" onClick={()=>remove(m.id)} aria-label="Удалить запись">×</button></div>)}</div>}
 </section>
}

function urlBase64ToUint8Array(base64:string){const padding="=".repeat((4-base64.length%4)%4);const b64=(base64+padding).replace(/-/g,"+").replace(/_/g,"/");const raw=atob(b64);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;++i)out[i]=raw.charCodeAt(i);return out}
function PushToggle(){
 const notify=useToast();
 const [enabled,setEnabled]=useState(false), [busy,setBusy]=useState(false), supported=typeof window!=="undefined"&&"serviceWorker" in navigator&&"PushManager" in window;
 useEffect(()=>{if(!supported)return;navigator.serviceWorker.ready.then(reg=>reg.pushManager.getSubscription()).then(sub=>setEnabled(!!sub)).catch(()=>{})},[supported]);
 if(!supported)return null;
 const toggle=async()=>{
  setBusy(true);
  try{
   const reg=await navigator.serviceWorker.ready;
   if(enabled){
    const sub=await reg.pushManager.getSubscription();
    if(sub){await fetch("/api/push",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe()}
    setEnabled(false);
    notify("Напоминания выключены");
   }else{
    const perm=await Notification.requestPermission();
    if(perm!=="granted")return;
    const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY||"";
    const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(key)});
    await fetch("/api/push",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(sub.toJSON())});
    setEnabled(true);
    notify("Напоминания включены");
   }
  }finally{setBusy(false)}
 };
 return <button type="button" className="push-toggle" onClick={toggle} disabled={busy}>{enabled?"🔔 Напоминание включено":"🔕 Включить напоминание"}</button>
}

function calcDryStreak(activity:any[]){const map=new Map(activity.map((x:any)=>[x.date,Number(x.beers)||0]));const d=new Date();const iso=(x:Date)=>localIso(x);if(!map.has(iso(d)))d.setDate(d.getDate()-1);let n=0;while(map.has(iso(d))&&map.get(iso(d))===0){n++;d.setDate(d.getDate()-1)}return n}
function calcStreak(logs:any[]){const set=new Set(logs.map(x=>x.date));const d=new Date();if(!set.has(localIso(d)))d.setDate(d.getDate()-1);let n=0,misses=0;while(true){if(set.has(localIso(d))){n++;misses=0}else{misses++;if(misses>1)break}d.setDate(d.getDate()-1)}return n}
function projectGoalDate(measurements:any[],target:number):string|null{
 const all=[...measurements].filter((m:any)=>m.weight!=null).sort((a:any,b:any)=>a.date.localeCompare(b.date));
 if(all.length<2)return null;
 const cutoff=new Date(all[all.length-1].date);cutoff.setDate(cutoff.getDate()-45);
 const windowed=all.filter((m:any)=>new Date(m.date)>=cutoff);
 const points=windowed.length>=2?windowed:all;
 const first=points[0],last=points[points.length-1];
 const days=(new Date(last.date).getTime()-new Date(first.date).getTime())/86400000;
 if(days<7)return null;
 const ratePerDay=(Number(last.weight)-Number(first.weight))/days;
 if(ratePerDay>=-0.01)return null;
 const remaining=Number(last.weight)-target;
 if(remaining<=0)return null;
 const daysToGoal=remaining/-ratePerDay;
 if(daysToGoal>3*365)return null;
 const eta=new Date();eta.setDate(eta.getDate()+Math.round(daysToGoal));
 const months=["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
 return `${eta.getDate()} ${months[eta.getMonth()]} ${eta.getFullYear()}`
}
function localIso(d:Date){const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}
function formatDateLabel(d:Date){const days=["ВОСКРЕСЕНЬЕ","ПОНЕДЕЛЬНИК","ВТОРНИК","СРЕДА","ЧЕТВЕРГ","ПЯТНИЦА","СУББОТА"],months=["ЯНВАРЯ","ФЕВРАЛЯ","МАРТА","АПРЕЛЯ","МАЯ","ИЮНЯ","ИЮЛЯ","АВГУСТА","СЕНТЯБРЯ","ОКТЯБРЯ","НОЯБРЯ","ДЕКАБРЯ"];return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`}
function pct(value:any,goal:number){return Math.max(0,Math.min(100,Math.round((Number(value)||0)/goal*100)))}
function fmt(value:any){return Number(value||0).toLocaleString("ru-RU")}
function makeWeek(logs:any[]){const now=new Date(),today=localIso(now), monday=new Date(now);monday.setDate(now.getDate()-((now.getDay()+6)%7));const labels=["ПН","ВТ","СР","ЧТ","ПТ","СБ","ВС"];return labels.map((short,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);const iso=localIso(d),count=logs.filter(x=>x.date===iso).length;return{short,date:String(d.getDate()),iso,count,state:count?"done":iso===today?"active":iso<today?"missed":"future"}})}
function orderedPlans(plans:any[],today:number){return [...plans].sort((a,b)=>((a.day-today+7)%7)-((b.day-today+7)%7))}
