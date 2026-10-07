"use client";

import { invalidateAuthStatus } from "@/lib/auth-status-client";
import { useEffect, useMemo, useRef, useState } from "react";
import { buildHomeWeek, currentProgramWeek, meals, planV4WeekCatalog, safety, week } from "./personal-data";
import { ExerciseVideo } from "./exercise-video";
import { ActiveWorkout, type ActiveDraft } from "./active-workout";
import { WeekPlanEditor } from "./week-plan-editor";
import { buildWeekSchedule, sessionsForDay, weekRangeContaining, type HomeWeekSession, type ResolvedDayPlan } from "./week-schedule-model";
import { isSwimSlot } from "@/lib/swim/schedule-sync";
import { isCyclingSlot } from "@/lib/cycling";
import { exerciseLabelRu } from "@/lib/swim/exercise-catalog";
import { trainingLabelRu } from "@/lib/training-display";
import { intervalTotalMeters, intervalTypeLabel, totalDistanceMeters } from "@/lib/swim/workout-engine";
import type { ResolvedSwimSlot, SwimInterval, SwimWorkoutDef } from "@/lib/swim/types";
import { useRouter } from "next/navigation";
import AuthGate from "./auth-gate";
import { DisciplineProgression, NutritionTools, Readiness, StrengthAdvice } from "./fitness-features";
import { BodyMap, PersonalRecords } from "./advanced-features";
import { CoachCard } from "./coach-card";
import { AnalyticsCoachPage } from "./analytics-coach-page";
import { ProfileSettingsPage } from "./profile-settings-page";
import { TrainingPlanStartAction } from "./training-plan-start-action";
import { ProgressionPanel, type ProgressionProposal } from "./progression-panel";
import { buildCoachResult, COACH_ACTION_LABELS, COACH_TARGETS, type CoachAction } from "../lib/coach";
import { WhatsNewGate } from "./whats-new-gate";
import { EveningProgressCard, EveningProgressPage } from "./evening-progress";
import { computeEveningWeeklyStats } from "../lib/evening";
import { MoodSection, MoodSummaryCard } from "./mood-section";
import { MilestonesSection, LatestMilestoneCard, NewMilestoneBanner, useMilestones } from "./milestones-section";
import { useToast } from "./toast";
import { VoltGlobalNavigation, type VoltSection } from "./volt-global-navigation";
import { resolveSectionFromQuery, sectionUrl } from "./nav-url";
import {
  Bell, Bike, CalendarDays, Camera, ChartColumn, CheckCircle2, ChevronDown, Clock3, Droplets,
  Dumbbell, Flame, Footprints, Moon, PenLine, Play, ReceiptText,
  RefreshCw, Route, Sparkles, Utensils, Waves, Zap,
} from "lucide-react";
import {
  MEASUREMENT_KEYS, METRIC_LABELS, METRIC_UNITS, PERIODS, PERIOD_LABELS,
  buildHistory, computeMetricCards, computeMetricStats, computeProgressSummary, computeTrendPoints, filterHistoryByPeriod, groupHistoryByMonth,
  type HistoryEntry, type Measurement, type MetricCardData, type MetricKey, type MetricPoint, type MetricStats, type Period, type ProgressSummary,
} from "./progress-model";
import { resolveActiveProgramPosition, trainingPlanCycleForDate } from "@/lib/training-program/registry";
import type { TrainingPlanCycle } from "@/lib/training-program/types";

const gymExercises = Array.from(new Set(week.flatMap((d: any) => d.x.map((x: any) => x[0]))));
const isSwimSession=(session:HomeWeekSession)=>session.type==="Кардио"&&(session.title==="Бассейн"||session.id?.startsWith("swim-")===true);
const isCyclingSession=(session:HomeWeekSession)=>isCyclingSlot(session);
const sessionCompleted=(session:HomeWeekSession,date:string,workouts:any[])=>isSwimSession(session)
 ?workouts.some(workout=>workout.date===date&&String(workout.type||"").startsWith("Плавание"))
 :isCyclingSession(session)?workouts.some(workout=>workout.date===date&&isCyclingSlot(workout))
 :workouts.some(workout=>workout.date===date&&workout.title===session.title);
export default function Home() {
  const notify = useToast();
  const [nav, setNav] = useState<VoltSection>("Сегодня");
  const [progressTab,setProgressTab]=useState<string|null>(null);
  const [mobileMenu,setMobileMenu]=useState(false);
  const [data,setData]=useState<any>({profile:{name:"Илья",height:167,startWeight:86,targetWeight:67},workouts:[],measurements:[],activity:[],photos:[]});
  const [activeWorkout,setActiveWorkout]=useState<ActiveDraft|null>(null);
  const [analyticsMode,setAnalyticsMode]=useState<"insights"|"coach">("insights");
  const [urlReady,setUrlReady]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [loadError,setLoadError]=useState(false);
  const [progressionProposals,setProgressionProposals]=useState<ProgressionProposal[]>([]);
  const loadProgression=()=>fetch("/api/progression").then(r=>r.json()).then(d=>setProgressionProposals(d.proposals||[])).catch(()=>{});
  // Swim-черновики (snapshot.type начинается с "Плавание", см.
  // SWIM_WORKOUT_TYPE_PREFIX в lib/swim/workout-engine.ts) не должны
  // автоматически открываться в универсальном <ActiveWorkout/> — их
  // активное/awaiting_confirmation состояние восстанавливает сама страница
  // /swim/workouts/[programId]/[workoutId].
  const load=()=>fetch("/api/fitness").then(async r=>{if(!r.ok)throw new Error("fitness-load");return r.json()}).then(d=>{setLoadError(false);setData(d);setLoaded(true);const open=(d.workoutDrafts||[]).find((draft:any)=>(draft.status==="active"||draft.status==="awaiting_confirmation")&&!String(draft.snapshot?.type||"").startsWith("Плавание")&&!isCyclingSlot(draft.snapshot));if(open)setActiveWorkout(current=>current??open)}).catch(()=>setLoadError(true));
  // Общий resolver "какая тренировка Swim назначена сегодня" (lib/swim/services.ts:
  // resolveScheduledSwimWorkout) — та же функция, что использует /swim и /swim/workouts,
  // чтобы «Начать тренировку» на Главной открывало ровно ту же тренировку.
  const [swimToday,setSwimToday]=useState<ResolvedSwimSlot|null>(null);
  const loadSwimToday=()=>fetch("/api/swim/today").then(r=>r.ok?r.json():null).then(d=>setSwimToday(d?.slot??null)).catch(()=>setSwimToday(null));
  const router=useRouter();
  useEffect(()=>{
   load();loadProgression();loadSwimToday();
   const id=window.setTimeout(()=>{
    const {section,mode}=resolveSectionFromQuery(new URLSearchParams(window.location.search));
    setNav(section);
    setAnalyticsMode(mode);
    const canonical=sectionUrl(section,mode);
    if(window.location.pathname+window.location.search!==canonical)window.history.replaceState(null,"",canonical);
    setUrlReady(true);
   },0);
   return()=>window.clearTimeout(id);
  },[]);
  useEffect(()=>{
   if(!urlReady)return;
   const url=sectionUrl(nav,analyticsMode);
   if(window.location.pathname+window.location.search!==url)window.history.pushState(null,"",url);
  },[nav,analyticsMode,urlReady]);
  useEffect(()=>{
   const onPopState=()=>{
    const {section,mode}=resolveSectionFromQuery(new URLSearchParams(window.location.search));
    setNav(section);
    setAnalyticsMode(mode);
   };
   window.addEventListener("popstate",onPopState);
   return()=>window.removeEventListener("popstate",onPopState);
  },[]);
  // Сброс во время рендера (а не в эффекте) — рекомендованный React-паттерн для
  // производного состояния при смене nav, без каскадного лишнего рендера.
  const [prevNav,setPrevNav]=useState(nav);
  if(nav!==prevNav){setPrevNav(nav);if(nav!=="Моя история"&&progressTab)setProgressTab(null)}
  const streak=useMemo(()=>calcStreak(data.workouts||[]),[data.workouts]);
  const today=localIso(new Date()), todayActivity=(data.activity||[]).find((x:any)=>x.date===today)||{};
  const todayWorkouts=(data.workouts||[]).filter((x:any)=>x.date===today).length;
  const days=useMemo(()=>makeWeek(data.workouts||[]),[data.workouts]);
  const weekDates=new Set(days.map(x=>x.iso));
  const weekWorkouts=(data.workouts||[]).filter((x:any)=>weekDates.has(x.date));
  const currentWeight=Number(data.measurements?.[0]?.weight??data.profile?.startWeight??86), startWeight=Number(data.profile?.startWeight??86), targetWeight=Number(data.profile?.targetWeight??67);
  const lost=Math.max(0,startWeight-currentWeight), remaining=Math.max(0,currentWeight-targetWeight), goalPct=Math.max(0,Math.min(100,(lost/(startWeight-targetWeight||1))*100));
  const goalEta=useMemo(()=>projectGoalDate(data.measurements||[],targetWeight),[data.measurements,targetWeight]);
  const hour=new Date().getHours(), greeting=hour<5?"Доброй ночи":hour<12?"Доброе утро":hour<17?"Добрый день":hour<23?"Добрый вечер":"Доброй ночи", dateLabel=formatDateLabel(new Date());
  const trainingPlanCycles=(data.profile?.trainingPlanCycles??[]) as TrainingPlanCycle[];
  const activeTrainingPlanCycle=(data.profile?.activeTrainingPlanCycle??null) as TrainingPlanCycle|null;
  const todayPlanCycle=trainingPlanCycleForDate(trainingPlanCycles,today);
  const activePlanPosition=resolveActiveProgramPosition(todayPlanCycle,today);
  const programWeek=currentProgramWeek(data.profile?.programStart,trainingPlanCycles);
  const displayProgramWeek=activePlanPosition?.weekIndex??programWeek;
  const homeWeek=buildHomeWeek(data.profile?.programStart,trainingPlanCycles,today);
  // AI-11 — Гибкая неделя: план на дату = каноническая программа (homeWeek) +
  // пользовательские изменения текущей недели (week_schedule_changes). Никогда
  // не переходит на следующую неделю — see app/week-schedule-model.ts.
  const weekMondayIso=weekRangeContaining(today).mondayIso;
  const weekPlanRaw=buildWeekSchedule(homeWeek,data.weekScheduleChanges||[],weekMondayIso);
  const weekPlan:ResolvedDayPlan[]=weekPlanRaw.map(d=>{
   const sessions=sessionsForDay(d.scheduled),required=sessions.filter(session=>session.type!=="Отдых"&&!session.optional);
   const completedRequiredSessions=required.filter(session=>sessionCompleted(session,d.date,data.workouts||[])).length;
   return {...d,locked:{
    completed:required.length>0&&completedRequiredSessions===required.length,
    anyCompleted:sessions.some(session=>sessionCompleted(session,d.date,data.workouts||[])),
    openDraft:(data.workoutDrafts||[]).some((w:any)=>w.date===d.date),
    completedRequiredSessions,requiredSessions:required.length,
   }};
  });
  const todayResolved=weekPlan.find(d=>d.date===today)??weekPlan[0];
  const todaySessions=sessionsForDay(todayResolved.scheduled);
  const todayRequiredSessions=todaySessions.filter(session=>session.type!=="Отдых"&&!session.optional);
  const todayPlan=todayRequiredSessions.find(session=>!sessionCompleted(session,today,data.workouts||[]))
   ??todaySessions.find(session=>!sessionCompleted(session,today,data.workouts||[]))??todaySessions[0];
  const todayPlanCompleted=sessionCompleted(todayPlan,today,data.workouts||[]);
  const [editingDate,setEditingDate]=useState<string|null>(null);
  const editingDay=editingDate?weekPlan.find(d=>d.date===editingDate):null;
  // Экран «План»: выбранный для просмотра день текущей недели (по умолчанию —
  // сегодня). Отдельно от editingDate — выбор дня только показывает его план,
  // редактирование по-прежнему открывает WeekPlanEditor.
  const [selectedPlanDate,setSelectedPlanDate]=useState<string|null>(null);
  const [selectedPlanSessionId,setSelectedPlanSessionId]=useState<string|null>(null);
  const selectedResolved=weekPlan.find(d=>d.date===(selectedPlanDate??today))??todayResolved;
  const selectedSessions=sessionsForDay(selectedResolved.scheduled);
  const selectedPlan=selectedSessions.find(session=>session.id===selectedPlanSessionId)??selectedSessions[0];
  const isSelectedToday=selectedResolved.date===today;
  const isSelectedSwim=isSwimSession(selectedPlan);
  const isSelectedCycling=isCyclingSession(selectedPlan);
  const selectedPlanCompleted=sessionCompleted(selectedPlan,selectedResolved.date,data.workouts||[]);
  const selectPlanDate=(date:string)=>{setSelectedPlanDate(date);setSelectedPlanSessionId(null)};
  // Для любого выбранного Swim-дня запрашиваем тот же календарный resolver,
  // что используют Главная и сам VOLT Swim. Plan больше не показывает
  // generic-заглушки из personal-data как будто это состав тренировки.
  const [selectedSwimResult,setSelectedSwimResult]=useState<{date:string;slot:ResolvedSwimSlot|null}|null>(null);
  const selectedSwim=selectedSwimResult?.date===selectedResolved.date?selectedSwimResult.slot:null;
  const selectedSwimLoading=isSelectedSwim&&selectedSwimResult?.date!==selectedResolved.date;
  useEffect(()=>{
   if(!isSelectedSwim)return;
   const controller=new AbortController();
   const requestedDate=selectedResolved.date;
   fetch(`/api/swim/today?date=${encodeURIComponent(selectedResolved.date)}`,{cache:"no-store",signal:controller.signal})
    .then(r=>r.ok?r.json():Promise.reject(new Error("swim resolver failed")))
    .then(d=>setSelectedSwimResult({date:requestedDate,slot:d?.slot??null}))
    .catch(error=>{if(error?.name!=="AbortError")setSelectedSwimResult({date:requestedDate,slot:null})});
   return()=>controller.abort();
  },[isSelectedSwim,selectedResolved.date]);
  // Незавершённая (но не отменённая и не подтверждённая) сессия на сегодня —
  // /api/fitness уже отдаёт только открытые черновики (planned/active/
  // awaiting_confirmation, см. listOpenWorkoutDrafts в lib/active-workout-service.ts),
  // поэтому просто ищем совпадение по дате и названию плана, не заводя новый
  // признак состояния. Используется только для текста кнопки на карточке —
  // реальным источником истины остаётся сам черновик/workout_log.
  const openDraftToday=(data.workoutDrafts||[]).find((d:any)=>d.date===today&&d.snapshot?.title===todayPlan?.title);
  const coach=buildCoachResult({date:today,ready:loaded,plan:todayPlan?{title:todayPlan.title,type:todayPlan.type}:null,wellnessLogs:data.wellnessLogs,activity:data.activity,foodLogs:data.foodLogs,workouts:data.workouts,measurements:data.measurements,profile:data.profile});
  const coachAction:CoachAction|null=coach.decision?.action??null;
  const nutritionCalories=coach.summary.nutrition.calories??0;
  const nutritionCalorieTarget=coach.summary.targets.calories;
  const activityProgress=Math.round((pct(todayActivity.activeMinutes,75)+pct(todayActivity.steps,10000))/2);
  const goCoach=()=>{setAnalyticsMode("coach");setNav("Аналитика");setMobileMenu(false)};
  const goAnalytics=()=>{setAnalyticsMode("insights");setNav("Аналитика");setMobileMenu(false)};
  const motivation=todayWorkouts>0?"Ты уже сделал главное — пришёл и выполнил.":streak>1?`У тебя серия ${streak} дня. Сегодня добавь к ней ещё один.`:"Начни с первого движения. Остальное сделает ритм.";
  const saveActivity=async(e:any)=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"activity",date:today,...b})});notify(r.ok?"Активность за сегодня обновлена":"Не удалось сохранить активность",r.ok?"good":"warn");load()};
  const startWorkout=async(plan:any,origin:"original"|"scheduled"="original",scheduleChangeId:number|null=null,scheduledFor=today,changeReasonCode="")=>{
   const snapshot={title:plan.title,type:plan.type,rounds:plan.rounds??1,origin,scheduledFor,scheduleChangeId,changeReasonCode,programIdentity:plan.programIdentity,exercises:plan.exercises.map((exercise:any[])=>({name:exercise[0],target:exercise[2],recommendedWeight:data.progressionOverrides?.[exercise[0]]?.weight??data.strengthLogs?.find((log:any)=>log.exercise===exercise[0])?.weight??0}))};
   const response=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"startWorkoutDraft",date:today,snapshot})});
   const json=await response.json().catch(()=>({}));
   if(!response.ok)return notify(json.error||"Не удалось начать тренировку","warn");
   setActiveWorkout(json.draft);load();
  };
  // Корневая причина старого бага: кнопка "Начать тренировку" всегда вызывала
  // startWorkout(todayPlan) — универсальный движок силовых тренировок, который
  // строит снимок из generic-упражнений дня (для Бассейна — заглушка "Разминка
  // в воде/Основная часть/Заминка") и открывает старый <ActiveWorkout/>, а не
  // реальную структурированную тренировку Foundation. Если сегодня по общему
  // расписанию бассейн, ведём через resolveScheduledSwimWorkout на тот же
  // /swim/workouts/[programId]/[workoutId], что открывают /swim и План Swim.
  const isTodaySwim=isSwimSession(todayPlan);
  const isTodayCycling=isCyclingSession(todayPlan);
  const startTodayWorkout=()=>{
   if(todayPlan.type==="Отдых"){
    setSelectedPlanDate(today);
    setNav("План");
    setMobileMenu(false);
    window.scrollTo({top:0,behavior:"smooth"});
    return;
   }
   if(isTodayCycling){router.push(`/cycling?date=${encodeURIComponent(todayResolved.date)}`);return}
   if(!isTodaySwim)return void startWorkout(todayPlan,todayResolved.changed?"scheduled":"original",todayResolved.changeId,todayResolved.scheduledFor,todayResolved.reasonCode);
   if(!swimToday){notify("Не удалось определить тренировку Swim на сегодня","warn");return}
   if(swimToday.kind==="unresolved"){notify("Сегодня запланирован бассейн, но тренировка базового плана не определена","warn");return}
   router.push(swimToday.route);
  };
  // Экран «План»: Swim всегда открывает назначенную календарём тренировку
  // Foundation. Для остальных выбранных дней сохраняется прежний универсальный
  // движок; его черновик по-прежнему создаётся датой «сегодня».
  const startSelectedWorkout=()=>{
   if(isSelectedCycling){router.push(`/cycling?date=${encodeURIComponent(selectedResolved.date)}`);return}
   if(isSelectedSwim){
    if(!selectedSwim){notify("Не удалось определить тренировку Swim на выбранный день","warn");return}
    if(selectedSwim.kind==="unresolved"){notify("На этот день запланирован бассейн, но тренировка базового плана не определена","warn");return}
    router.push(selectedSwim.route);
    return;
   }
   if(isSelectedToday)return startTodayWorkout();
   void startWorkout(selectedPlan,selectedResolved.changed?"scheduled":"original",selectedResolved.changeId,selectedResolved.scheduledFor,selectedResolved.reasonCode);
  };

  return (
    <AuthGate><main className="app-shell">
      <VoltGlobalNavigation
        environment="volt"
        activeSection={nav}
        mobileOpen={mobileMenu}
        onMobileOpenChange={setMobileMenu}
        onNavigate={(section)=>{if(section==="Аналитика")setAnalyticsMode("insights");setNav(section)}}
        footer={<div className="streak"><span aria-hidden="true"><Zap size={20}/></span><div><b>{streak} {daysLabel(streak)}</b><small>серия активности</small></div></div>}
      />

      <section className="content" id="top">
        {nav!=="Аналитика"&&nav!=="Профиль и настройки"&&<header className={`topbar${nav==="Дорожная карта"?" roadmap-topbar":""}${nav==="Моя история"?" journey-topbar":""}`}>
          {nav==="Дорожная карта"?<div className="roadmap-topbar-brand" aria-label="VOLT">VOLT</div>:nav==="Моя история"?<div className="journey-topbar-copy"><h1>Мой путь</h1><p>Твоя история. Твои победы. <em>Твой прогресс.</em></p></div>:<div><p className="eyebrow">{dateLabel}</p><h1>{greeting}, {data.profile?.name||"Илья"}</h1></div>}
          <div className="header-actions">
            <span className="date-chip"><CalendarDays size={14}/>{dateLabel}</span>
            <span className="sync-chip"><RefreshCw size={13}/>Синхронизировано<i/></span>
            {loaded&&coachAction&&<button type="button" className={`coach-indicator ${COACH_ACTION_LABELS[coachAction].tone}`} aria-label={`VOLT Coach: ${COACH_ACTION_LABELS[coachAction].label}. Перейти к решению`} onClick={goCoach}><span className="coach-status-dot" aria-hidden="true"/><span className="coach-indicator-text">Coach: {COACH_ACTION_LABELS[coachAction].short}</span></button>}
            <button aria-label="Уведомления" className="icon-btn"><Bell size={17}/><span></span></button>
            <button className="mini-avatar" aria-label="Открыть профиль и настройки" aria-expanded={mobileMenu} onClick={()=>window.matchMedia("(max-width: 760px)").matches?setMobileMenu(true):setNav("Профиль и настройки")}>И</button>
          </div>
        </header>}

        {nav!=="Профиль и настройки"&&<button className={`mobile-status-bar${nav==="Дорожная карта"?" roadmap-status-bar":""}`} onClick={()=>setMobileMenu(true)} aria-label="Открыть профиль, серии и напоминания"><span>⚡ <b>{streak}</b><small> серия</small></span><span>🌙 <b>Вечер</b><small> прогресс</small></span><span className="mobile-status-profile">И <b>{data.profile?.name||"Илья"}</b> ›</span></button>}

        {/* Hero не содержит собственного изображения: утверждённое фото зала —
            общий архитектурный фон страницы (владелец — .app-shell), см.
            App Background Architecture в docs/design-system/01-design-principles.md.
            .hero-shade — только локальное затемнение для читаемости текста. */}
        {nav === "Сегодня" ? <>{loaded&&<NewMilestoneBanner data={data} refresh={load}/>}<section className="hero">
          <div className="hero-shade" />
          <div className="hero-content">
            <p className="eyebrow">ФОКУС ДНЯ</p>
            <h2>{motivation}</h2>
            <p className="hero-sub">Не нужно быть идеальным. Нужно быть последовательным.</p>
            <div className="hero-actions">
              <button type="button" className="start-btn" onClick={startTodayWorkout}><span aria-hidden="true"><Play size={12} fill="currentColor"/></span>{todayPlan.type==="Отдых"?"Открыть план дня":"Начать тренировку"}</button>
            </div>
          </div>
        </section>

        <div className="today-focus">
          <section className="next-workout-card card">
            <div className="next-workout-photo" style={{backgroundImage:`url(${todayPlan.image})`}} role="img" aria-label={trainingLabelRu(todayPlan.title)} />
            <p className="eyebrow">СЛЕДУЮЩАЯ ТРЕНИРОВКА{todayResolved.changed&&<span className="plan-changed-badge">План изменён</span>}</p>
            <h3>{trainingLabelRu(todayPlan.title)}</h3>
            <p className="next-workout-type">{todayPlan.type}</p>
            {/* Программа назначила эту тренировку на другой день: на сегодня у
                неё своей сессии нет. Молча подменять день нельзя — показываем,
                что это перенос, иначе расписание выглядит противоречивым. */}
            {isTodaySwim&&swimToday?.kind==="workout"&&swimToday.scheduledFor&&
             <p className="next-workout-shifted">По программе назначена на {dayLabel(swimToday.scheduledFor,today)}. На сегодня своей сессии в программе нет.</p>}
            {todayPlanCompleted&&<div className="hero-done-status" role="status"><span className="hero-done-icon" aria-hidden="true">✓</span><div><b>{todayPlan.type==="Отдых"?"План дня выполнен":"Тренировка выполнена"}</b><small>Отличная работа сегодня</small></div></div>}
            {todaySessions.length>1&&<div className="today-session-list" aria-label="Сессии на сегодня">{todaySessions.map((session,index)=><button type="button" key={session.id??`${session.title}-${index}`} onClick={()=>{setSelectedPlanDate(today);setSelectedPlanSessionId(session.id??null);setNav("План")}}><span>{sessionCompleted(session,today,data.workouts||[]) ? "✓" : String(index+1).padStart(2,"0")}</span><b>{trainingLabelRu(session.title)}</b><small>{session.optional?"Опционально":session.type}</small></button>)}</div>}
            <div className="next-workout-meta">
              <span><Clock3 size={14}/>{todayPlan.time}</span>
              <span>{isTodayCycling?<Bike size={14}/>:<Dumbbell size={14}/>} {todayPlan.exercises.length} {isTodayCycling?"этапа":"упражнений"}</span>
              {todayPlan.rounds>1&&<span><RefreshCw size={14}/>{todayPlan.rounds} круга</span>}
            </div>
            <div className="next-workout-actions">
             {isTodayCycling
              ?<button className={todayPlanCompleted?"repeat-btn":"start-btn"} onClick={startTodayWorkout}><span aria-hidden="true">{todayPlanCompleted?<CheckCircle2 size={13}/>:<Bike size={13}/>}</span>{todayPlanCompleted?"Тренировка выполнена":openDraftToday?.status==="awaiting_confirmation"?"Подтвердить результат":openDraftToday?"Продолжить тренировку":"Открыть Cycling"}</button>
              :isTodaySwim
              ?<button className={swimToday?.kind==="workout"&&swimToday.status==="completed"?"repeat-btn":"start-btn"} onClick={startTodayWorkout}><span aria-hidden="true">{swimToday?.kind==="workout"&&swimToday.status==="completed"?<CheckCircle2 size={13}/>:<Play size={12} fill="currentColor"/>}</span>{swimToday?.kind==="workout"?(swimToday.status==="completed"?"Тренировка выполнена":swimToday.status==="in_progress"?"Продолжить тренировку":swimToday.status==="awaiting_confirmation"?"Подтвердить результат":"Начать тренировку"):"Начать тренировку"}</button>
              :todayPlanCompleted?<button className="repeat-btn" onClick={startTodayWorkout}><span aria-hidden="true">↻</span>{todayPlan.type==="Отдых"?"Открыть план дня ещё раз":"Повторить тренировку"}</button>
              :openDraftToday?<button className="start-btn" onClick={startTodayWorkout}><span aria-hidden="true"><Play size={12} fill="currentColor"/></span>{todayPlan.type==="Отдых"?"Продолжить план дня":"Продолжить тренировку"}</button>
              :<button className="start-btn" onClick={startTodayWorkout}><span aria-hidden="true"><Play size={12} fill="currentColor"/></span>{todayPlan.type==="Отдых"?"Открыть план дня":"Начать тренировку"}</button>}
             <button type="button" className="ghost-btn hero-edit-plan-btn" onClick={()=>setEditingDate(today)}>Изменить план</button>
            </div>
          </section>

          <section className="streak-highlight-card card">
            <p className="eyebrow">СЕРИЯ АКТИВНОСТИ</p>
            <h3>{streak} {daysLabel(streak)}</h3>
            <p>{streak>0?"Ты в отличной форме!":"Начни серию сегодня."}</p>
            <div className="streak-bars" aria-label="Тренировки по дням недели">
              {days.map(day=>(
                <div key={day.iso} className="streak-bar-col">
                  <i className={day.state==="done"?"done":""} style={{height:`${day.state==="done"?100:day.state==="active"?38:14}%`}}/>
                  <small>{day.short.slice(0,2)}</small>
                </div>
              ))}
            </div>
            <button type="button" className="ghost-btn" onClick={()=>setNav("Моя история")}>Мой путь →</button>
          </section>
        </div>

        <section className="stat-strip" aria-label="Дневной прогресс">
          <Metric icon={<Flame size={15}/>} color="orange" label="Калории" value={fmt(nutritionCalories)} unit={`/ ${fmt(nutritionCalorieTarget)} ккал`} pct={pct(nutritionCalories,nutritionCalorieTarget)} />
          <Metric icon={<Clock3 size={15}/>} color="blue" label="Активность" value={fmt(todayActivity.activeMinutes||0)} unit="/ 75 мин" pct={pct(todayActivity.activeMinutes,75)} />
          <Metric icon={<Footprints size={15}/>} color="lime" label="Шаги" value={fmt(todayActivity.steps||0)} unit="/ 10 000" pct={pct(todayActivity.steps,10000)} />
          <Metric icon={<CheckCircle2 size={15}/>} color="violet" label="Тренировки" value={String(todayWorkouts)} unit="/ 1 сегодня" pct={pct(todayWorkouts,1)} />
        </section>

        {/* Асимметричная мозаика: блоки намеренно имеют разный вес
            (Coach шире всех, кольцо активности компактное, CTA-карточки
            лёгкие) — вместо ряда одинаковых карточек. */}
        <div className="today-mosaic">
         <div className="today-mosaic-main">
          <CoachCard result={coach} plan={todayPlan} date={today} ready={loaded} onAskCoach={goCoach}/>
          <Readiness data={data} refresh={load}/>
          <DisciplineProgression data={data}/>
          <LastWorkoutCard workout={data.workouts?.[0]} onOpen={()=>{setNav("Моя история");setProgressTab("Тренировки")}}/>
         </div>

         <div className="today-mosaic-side">
          <section className="ring-card card" aria-label="Активность сегодня">
            <div className="section-head"><p className="eyebrow">АКТИВНОСТЬ СЕГОДНЯ</p></div>
            <div className="ring-vis" style={{"--ring-pct":activityProgress} as any}>
              <b>{activityProgress}%</b>
              <span>цели</span>
            </div>
            <ul className="ring-legend">
              <li><i style={{background:"var(--blue)"}}/>Активность<b>{fmt(todayActivity.activeMinutes||0)} / 75 мин</b></li>
              <li><i style={{background:"var(--lime)"}}/>Шаги<b>{fmt(todayActivity.steps||0)} / 10 000</b></li>
            </ul>
            <button type="button" className="link-more" onClick={goAnalytics}>Подробнее →</button>
          </section>

          <EveningProgressCard data={data} onOpen={()=>setNav("Вечерний прогресс")}/>
          <LatestMilestoneCard data={data} onOpen={()=>{setNav("Моя история");setProgressTab("Вехи")}}/>
          <MoodSummaryCard data={data} onOpen={()=>{setNav("Моя история");setProgressTab("Состояние")}}/>
         </div>
        </div>

        <form className="activity-entry card" onSubmit={saveActivity}><div><p className="eyebrow">ДАННЫЕ ЗА СЕГОДНЯ</p><h3>Обновить активность</h3></div><label>Сожжено, ккал<input name="calories" type="number" min="0" defaultValue={todayActivity.calories||0}/></label><label>Активность, мин<input name="activeMinutes" type="number" min="0" defaultValue={todayActivity.activeMinutes||0}/></label><label>Шаги<input name="steps" type="number" min="0" defaultValue={todayActivity.steps||0}/></label><label>Пиво, банки<input name="beers" type="number" min="0" defaultValue={todayActivity.beers||0}/></label><label>Сон, ч<input name="sleepHours" type="number" min="0" max="24" step="0.5" defaultValue={todayActivity.sleepHours||0}/></label><button>Сохранить</button></form>

        <ProgressionPanel proposals={progressionProposals} refresh={loadProgression}/>

        <WeeklyDigest data={data} weekWorkouts={weekWorkouts} weekDates={weekDates} currentWeight={currentWeight}/>

        <div className="grid-main">
          {/* Краткий недельный контекст — статусы дней без графика нагрузки и
              без построчного редактора; полная версия переехала на «План»
              (docs: IA сценария «План тренировок», п.3). */}
          <section className="week-card card week-context">
            <div className="section-head"><div><p className="eyebrow">ЭТА НЕДЕЛЯ</p><h3>Ритм тренировок</h3></div><button type="button" onClick={()=>setNav("План")}>Открыть план →</button></div>
            <div className="week-days">
              {days.map((day) => <div key={day.iso} className={`day ${day.state}`}><small>{day.short}</small><b>{day.date}</b><span>{day.state === "done" ? "✓" : day.state === "missed" ? "×" : day.state === "active" ? "•" : ""}</span></div>)}
            </div>
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

        <p className="volt-quote">«Маленькие шаги каждый день приводят к большим результатам.»</p>
        </> : nav==="План" ? <PlanScreen
          today={today} weekPlan={weekPlan} selectedResolved={selectedResolved} selectedPlan={selectedPlan}
          selectedSessions={selectedSessions} selectedSessionId={selectedPlan.id??null} onSelectSession={setSelectedPlanSessionId}
          isSelectedToday={isSelectedToday} onSelectDate={selectPlanDate} onEditDate={setEditingDate}
          onStartSelected={startSelectedWorkout} planMeta={planActionMeta(selectedResolved,isSelectedToday,selectedPlanCompleted,!!openDraftToday)}
          selectedSwim={selectedSwim} selectedSwimLoading={selectedSwimLoading}
          programWeek={displayProgramWeek} activeCycle={activeTrainingPlanCycle}
          onPlanStarted={()=>{load();loadSwimToday()}}
        /> : nav==="Аналитика" ? <AnalyticsCoachPage
          data={data} analyticsStatus={loadError?"error":loaded?"ready":"loading"} onRetry={load} coach={coach} today={today} mode={analyticsMode} onModeChange={setAnalyticsMode}
          plan={todayPlan?{title:todayPlan.title,type:todayPlan.type}:null}
          originalPlan={todayResolved.changed?{title:todayResolved.original.title,type:todayResolved.original.type}:null}
          planChanged={todayResolved.changed} changeReasonCode={todayResolved.reasonCode}
          onFoodSaved={load} onStartWorkout={startTodayWorkout} onOpenNutrition={()=>setNav("Питание")}
        /> : nav==="Профиль и настройки" ? <ProfileSettingsPage
          data={data} refresh={load} onOpenRoadmap={()=>setNav("Дорожная карта")}
          onLogout={async()=>{await fetch("/api/auth/logout",{method:"POST"});invalidateAuthStatus();location.reload()}}
        /> : <Personal
          section={nav} data={data} refresh={load} coachAction={coachAction} loaded={loaded}
          initialProgressTab={progressTab} onAskCoach={goCoach}
        />}
      </section>

      {activeWorkout&&<ActiveWorkout draft={activeWorkout} data={data} onClose={()=>setActiveWorkout(null)} onChanged={draft=>{setActiveWorkout(draft.status==="cancelled"?null:draft);load();if(draft.status==="completed")loadProgression()}} onEditWorkout={()=>{setActiveWorkout(null);setNav("Моя история");setProgressTab("Тренировки")}}/>}
      {editingDay&&<WeekPlanEditor day={editingDay} weekDays={weekPlan} homeWeek={homeWeek} onClose={()=>setEditingDate(null)} refresh={load}/>}
      {loaded&&<WhatsNewGate seenVersion={Number(data.whatsNewSeenVersion)||0} onSeen={async(version)=>{await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"markWhatsNewSeen",version})});load()}}/>}

    </main></AuthGate>
  );
}

// Экран «План» — один композиционный поток: неделя как главный объект,
// выбранная/следующая тренировка, её состав и спокойная справочная программа.
// Данные и действия остаются прежними: WeekPlanEditor по-прежнему единственная
// точка replace/swap/rest, а запуск использует существующие обработчики.
function PlanScreen({today,weekPlan,selectedResolved,selectedPlan,selectedSessions,selectedSessionId,onSelectSession,isSelectedToday,onSelectDate,onEditDate,onStartSelected,planMeta,selectedSwim,selectedSwimLoading,programWeek,activeCycle,onPlanStarted}:{
  today:string;weekPlan:ResolvedDayPlan[];selectedResolved:ResolvedDayPlan;selectedPlan:any;isSelectedToday:boolean;
  selectedSessions:HomeWeekSession[];selectedSessionId:string|null;onSelectSession:(id:string|null)=>void;
  onSelectDate:(date:string)=>void;onEditDate:(date:string)=>void;onStartSelected:()=>void;
  planMeta:{label:string;cls:string;repeat:boolean};
  selectedSwim:ResolvedSwimSlot|null;selectedSwimLoading:boolean;
  programWeek:number;activeCycle:TrainingPlanCycle|null;onPlanStarted:()=>void;
}){
 const weekSessions=weekPlan.flatMap(day=>sessionsForDay(day.scheduled).map(session=>({day,session})));
 const strengthDays=weekSessions.filter(({session})=>session.type==="Силовая").length;
 const swimDays=weekSessions.filter(({session})=>isSwimSession(session)).length;
 const plannedDays=weekSessions.filter(({session})=>session.type!=="Отдых"&&!session.optional).length;
 const completedDays=weekPlan.reduce((sum,day)=>sum+(day.locked?.completedRequiredSessions??0),0);
 const weekProgress=plannedDays?Math.round((completedDays/plannedDays)*100):100;
 const selectedEntryIndex=weekSessions.findIndex(({day,session})=>day.date===selectedResolved.date&&(
  selectedPlan.id?session.id===selectedPlan.id:session.title===selectedPlan.title
 ));
 const nextEntry=weekSessions.slice(Math.max(0,selectedEntryIndex)+1).find(({session})=>session.type!=="Отдых")??null;
 const nextResolved=nextEntry?.day??selectedResolved;
 const nextSession=nextEntry?.session??selectedPlan;
 const todayTitles=weekSessions.filter(({day,session})=>day.date===today&&session.type!=="Отдых"&&!session.optional).map(({session})=>trainingLabelRu(session.title)).join(" + ")||"Восстановление";
 const upcomingEntry=weekSessions.find(({day,session})=>day.date>today&&session.type!=="Отдых");
 const isSwim=isSwimSession(selectedPlan);
 const isCycling=isCyclingSession(selectedPlan);
 const isRest=selectedPlan.type==="Отдых";
 const resolvedSwim=selectedSwim?.kind==="workout"?selectedSwim:null;
 const swimWorkout=isSwim?(resolvedSwim?.workout??null):null;
 const focusTitle=isSwim?(swimWorkout?.title??(selectedSwimLoading?"Загрузка тренировки…":"Тренировка не определена")):(selectedPlan.type==="Отдых"?"Отдых":trainingLabelRu(selectedPlan.title));
 const focusType=isSwim?`VOLT Swim · ${resolvedSwim?.programId==="endurance"?"общий план":"базовый план"}`:isCycling?"VOLT Cycling · общий план":isRest?"День восстановления":selectedPlan.type;
 const actionMeta=isSwim?{
  label:selectedSwimLoading?"Загрузка…":resolvedSwim?.status==="completed"?"Тренировка выполнена":resolvedSwim?.status==="in_progress"?"Продолжить тренировку":resolvedSwim?.status==="awaiting_confirmation"?"Подтвердить результат":resolvedSwim?"Открыть тренировку":"Тренировка недоступна",
  cls:resolvedSwim?.status==="completed"?"repeat-btn":"start-btn",
  repeat:resolvedSwim?.status==="completed",
 }:planMeta;

 return <div className="plan-screen">
  <TrainingPlanStartAction cycle={activeCycle} today={today} todayTitle={todayTitles} nextTitle={upcomingEntry?trainingLabelRu(upcomingEntry.session.title):null} onStarted={onPlanStarted}/>
  <section className="plan-hero">
   <div className="plan-hero-shade"/>
   <div className="plan-hero-head">
    <div className="plan-hero-copy">
     <p className="eyebrow">ТЕКУЩАЯ НЕДЕЛЯ · {activeCycle?`ПЛАН ${activeCycle.programVersion}.0`:"ПЛАН 2.0"}</p>
     <h2>Неделя {programWeek}</h2>
     <p className="plan-hero-summary"><b>{completedDays} из {plannedDays} обязательных сессий</b><span>{strengthDays} силовых</span><span>{swimDays} плавательных</span></p>
     <p className="plan-hero-note">Техника, устойчивый ритм и восстановление без перегруза.</p>
    </div>
    <div className="plan-hero-status">
     <div><span>Ритм недели</span><b>{weekProgress}%</b></div>
     <div className="plan-hero-progress" aria-label={`Выполнено ${weekProgress}% плана недели`}><i style={{width:`${weekProgress}%`}}/></div>
     <button type="button" className="ghost-btn plan-edit-action" onClick={()=>onEditDate(selectedResolved.date)}><CalendarDays size={14}/>Изменить неделю</button>
    </div>
   </div>

   <div className="plan-week-rail" role="group" aria-label="План на семь дней">
    {weekPlan.map(d=>{
     const state=d.locked?.completed?"done":d.date===today?"today":d.date<today?"past":"future";
     const sessions=sessionsForDay(d.scheduled);
     const kind=d.scheduled.type==="Отдых"?"rest":sessions.length>1?"mixed":sessions.some(isCyclingSession)?"cycling":isSwimSlot(d.scheduled)?"swim":d.scheduled.type==="Силовая"?"strength":"cardio";
     const DayIcon=kind==="swim"?Waves:kind==="cycling"?Bike:kind==="strength"?Dumbbell:kind==="rest"?Moon:kind==="mixed"?Zap:Footprints;
     return <button key={d.date} type="button" aria-pressed={d.date===selectedResolved.date} className={`plan-day ${state} ${kind}${d.date===selectedResolved.date?" selected":""}`} onClick={()=>onSelectDate(d.date)}>
      <span className="plan-day-date"><small>{d.original.d.slice(0,2).toUpperCase()}</small><b>{Number(d.date.slice(8,10))}</b></span>
      <span className="plan-day-symbol" aria-hidden="true"><DayIcon size={15}/></span>
      <span className="plan-day-kind">{d.scheduled.type==="Отдых"?"Отдых":sessions.length>1?`${sessions.length} сессии`:kind==="cycling"?"Велосипед":isSwimSlot(d.scheduled)?"Плавание":d.scheduled.optional?"Опционально":d.scheduled.type}</span>
      <span className="plan-day-state">{d.locked?.completed?<><CheckCircle2 size={10}/>Готово</>:d.date===today?"Сегодня":d.changed?"Изменён":""}</span>
     </button>;
    })}
   </div>
  </section>

  {selectedSessions.length>1&&<div className="plan-session-switcher" role="group" aria-label="Сессии выбранного дня">{selectedSessions.map((session,index)=><button type="button" key={session.id??`${session.title}-${index}`} className={(session.id??null)===selectedSessionId?"active":""} onClick={()=>onSelectSession(session.id??null)}><span>{String(index+1).padStart(2,"0")}</span><b>{trainingLabelRu(session.title)}</b><small>{session.optional?"Опционально":session.type}</small></button>)}</div>}

  <section className="plan-now" aria-label="Текущая и следующая тренировки">
   <article className={`plan-focus-card${isRest?" rest":""}`}>
    <div className={`plan-focus-photo${isRest?" plan-rest-photo":""}`} style={{backgroundImage:`url(${isRest?"/workouts/rest-day-home-v2.png":selectedPlan.image})`}} role="img" aria-label={focusTitle}/>
    <div className="plan-focus-shade"/>
    <div className="plan-focus-content">
     <p className="eyebrow">{isSelectedToday?"СЕГОДНЯ":dayLabel(selectedResolved.date,today).toUpperCase()}{selectedResolved.changed&&<span className="plan-changed-badge">План изменён</span>}</p>
     <h3>{focusTitle}</h3>
     <p className="next-workout-type">{focusType}</p>
     {selectedPlan.optional&&<p className="plan-focus-goal">Опциональная сессия · можно оставить запланированной, пока велостанок недоступен.</p>}
     {swimWorkout&&<p className="plan-focus-goal">{swimWorkout.goal}</p>}
     {isRest&&<div className="plan-rest-guide" aria-label="Фокус восстановления"><span><Footprints size={14}/>Спокойная прогулка</span><span><RefreshCw size={14}/>Лёгкая мобилизация</span><span><Moon size={14}/>Полноценный сон</span></div>}
     <div className="next-workout-meta">
      <span><Clock3 size={14}/>{swimWorkout?`~${swimWorkout.estimatedMinutes} мин`:isRest?"Без нагрузки":selectedPlan.time}</span>
      {swimWorkout?<><span><Waves size={14}/>{totalDistanceMeters(swimWorkout).toLocaleString("ru-RU")} м</span><span><RefreshCw size={14}/>{swimWorkout.intervals.length} интервалов</span></>:isRest?<span><Moon size={14}/>Восстановление</span>:<>
       <span>{isCycling?<Bike size={14}/>:<Dumbbell size={14}/>} {selectedPlan.exercises.length} {isCycling?"этапа":"упражнений"}</span>
       {selectedPlan.rounds>1&&<span><RefreshCw size={14}/>{selectedPlan.rounds} круга</span>}
      </>}
     </div>
     <button type="button" className={actionMeta.cls} onClick={onStartSelected} disabled={isSwim&&!resolvedSwim}><span aria-hidden="true">{actionMeta.repeat?"↻":<Play size={12} fill="currentColor"/>}</span>{isRest?"Открыть план дня":actionMeta.label}</button>
    </div>
   </article>

   <aside className="plan-next-card">
    <span className="plan-next-icon" aria-hidden="true"><Clock3 size={17}/></span>
    <div>
     <p className="eyebrow">ДАЛЬШЕ</p>
     <span className="plan-next-date">{dayLabel(nextResolved.date,today)}</span>
     <h3>{trainingLabelRu(nextSession.title)}</h3>
     <p>{isSwimSession(nextSession)?"VOLT Swim":isCyclingSession(nextSession)?"VOLT Cycling":nextSession.type} · {nextSession.time}</p>
    </div>
    <button type="button" className="ghost-btn" onClick={()=>{onSelectDate(nextResolved.date);onSelectSession(nextSession.id??null)}}>Посмотреть день <span aria-hidden="true">→</span></button>
   </aside>
  </section>

  <section className="plan-day-exercises" id="plan-workout-composition">
   <div className="section-head plan-section-heading"><div><p className="eyebrow">ДЕТАЛИ ТРЕНИРОВКИ</p><h3>{isSwim?(swimWorkout?.title??"VOLT Swim"):isRest?"Восстановление":trainingLabelRu(selectedPlan.title)}</h3></div><span>{swimWorkout?`${totalDistanceMeters(swimWorkout).toLocaleString("ru-RU")} м · ${swimWorkout.intervals.length} интервалов`:isRest?"Спокойный день":`${selectedPlan.exercises.length} ${isCycling?"этапа":"упражнений"}`}</span></div>
   {isSwim?(
    selectedSwimLoading?<div className="plan-swim-empty" aria-busy="true">Загружаем назначенную тренировку VOLT Swim…</div>:
    swimWorkout?<PlanSwimIntervals workout={swimWorkout}/>:<div className="plan-swim-empty">VOLT Swim не смог назначить тренировку базового плана на этот день. Измените день плана или откройте модуль Swim.</div>
   ):isRest?<div className="plan-rest-note"><span aria-hidden="true"><Moon size={22}/></span><div><b>Сегодня без тренировки</b><p>Восстановись и сохрани ритм недели. Следующее занятие уже отмечено выше.</p></div></div>:<>
    {selectedPlan.warmup&&<section className="plan-exercise-block"><header><div><span>01</span><div><p className="eyebrow">ПОДГОТОВКА</p><h4>Разминка</h4></div></div><small>{selectedPlan.warmup.length} упражнения</small></header><PlanExercises items={selectedPlan.warmup}/></section>}
    <section className="plan-exercise-block"><header><div><span>{selectedPlan.warmup?"02":"01"}</span><div><p className="eyebrow">РАБОЧИЙ БЛОК</p><h4>Основная часть</h4></div></div><small>{selectedPlan.exercises.length} {isCycling?"этапа":"упражнений"}{selectedPlan.rounds>1?` · ${selectedPlan.rounds} круга`:""}</small></header><PlanExercises items={selectedPlan.exercises}/></section>
   </>}
  </section>

  <section className="plan-program">
   <div className="section-head plan-program-head"><div><p className="eyebrow">НОВЫЙ ПЛАН · ПРЕДПРОСМОТР</p><h3>8-недельный цикл</h3></div><p>Календарные дни сохраняются: запуск в середине недели начинается с текущего дня.</p></div>
   <Notice/>
   <div className="plan-program-phases single">
    <PlanProgramPhase number="01" period="НЕДЕЛИ 1–8 · ДНИ 1–7" title="План 4.0: зал, плавание и велосипед" note="Две силовые, два Swim, два заезда; субботняя длинная база обязательна, пятничный Swim меняется на Bike только вручную" days={planV4WeekCatalog.map((d:any)=>({day:`День ${["Понедельник","Вторник","Среда","Четверг","Пятница","Суббота","Воскресенье"].indexOf(d.d)+1}`,type:d.t,title:d.n,time:d.time,exercises:d.x}))}/>
   </div>
  </section>
 </div>;
}

function PlanProgramPhase({number,period,title,note,days}:{number:string;period:string;title:string;note:string;days:any[]}){
 return <section className="plan-program-phase">
  <header><span>{number}</span><div><p className="eyebrow">{period}</p><h4>{title}</h4><p>{note}</p></div></header>
  <div className="plan-phase-rhythm">{days.map((day:any)=>{
   const kind=day.type==="Отдых"?"rest":day.title==="Бассейн"||day.title?.includes("Плавание")?"swim":isCyclingSlot(day)?"cycling":day.type==="Силовая"?"strength":"cardio";
   const DayIcon=kind==="swim"?Waves:kind==="cycling"?Bike:kind==="strength"?Dumbbell:kind==="rest"?Moon:Footprints;
   return <details key={`${day.day}-${day.title}`} className={`plan-phase-day ${kind}`}>
    <summary><span className="plan-phase-marker" aria-hidden="true"><DayIcon size={14}/></span><div><small>{day.day}</small><h5>{trainingLabelRu(day.title)}</h5><p>{day.type} · {day.time}</p></div><span className="plan-phase-open" aria-hidden="true">＋</span></summary>
    <div className="plan-phase-details">{day.warmup&&<><p className="plan-block-title">Разминка</p><PlanExercises items={day.warmup}/></>}<p className="plan-block-title">{day.type==="Отдых"?"План дня":"Основная часть"}</p><PlanExercises items={day.exercises}/></div>
   </details>;
  })}</div>
 </section>;
}

function PlanSwimIntervals({workout}:{workout:SwimWorkoutDef}){
 return <div className="plan-exercises plan-swim-intervals">{workout.intervals.map((interval:SwimInterval,index:number)=>{
  const target=interval.repeats>1?`${interval.repeats} × ${interval.distanceMeters} м`:`${interval.distanceMeters} м`;
  const rest=interval.restSeconds?` · отдых ${interval.restSeconds}${interval.restSecondsMax?`–${interval.restSecondsMax}`:""} сек`:"";
  return <article key={interval.id}>
   <span className="plan-exercise-fallback" aria-hidden="true"><Waves size={20}/><small>{intervalTotalMeters(interval).toLocaleString("ru-RU")} м</small></span>
   <div><p className="plan-swim-stage">{intervalTypeLabel(interval.type)}</p><h4><span>{index+1}</span>{exerciseLabelRu(interval.exerciseId)}</h4><p>{interval.description}</p><b>{target}{rest}</b></div>
  </article>;
 })}</div>;
}

// Ячейка спокойной панели показателей дня — не самостоятельная KPI-плитка:
// все четыре живут внутри одной стеклянной поверхности (.stat-strip).
function Metric({ icon, color, label, value, unit, pct }: {icon:React.ReactNode;color:string;label:string;value:string;unit:string;pct:number}) {
  return <article className="stat-cell">
    <div className="stat-cell-head"><span className={`metric-icon ${color}`}>{icon}</span><small>{label}</small></div>
    <p className="stat-cell-value"><b>{value}</b><span>{unit}</span></p>
    <div className="progress"><i className={color} style={{width:`${pct}%`}} /></div>
  </article>;
}

// Последняя тренировка — презентационная карточка поверх уже загруженных
// data.workouts (первая запись, т.к. GET /api/fitness отдаёт их по date DESC).
// Новых запросов/полей не добавляет; "Объём" не показывается — в текущей
// модели тренировки нет посчитанного суммарного объёма (в отличие от Swim).
function LastWorkoutCard({workout,onOpen}:{workout:any;onOpen:()=>void}){
  if(!workout)return <article className="last-workout-card card"><p className="eyebrow">ПОСЛЕДНЯЯ ТРЕНИРОВКА</p><p className="detail-lead" style={{margin:0}}>Завершённых тренировок пока нет.</p></article>;
  const mins=Math.round((Number(workout.durationSeconds)||0)/60);
  return (
    <button type="button" className="last-workout-card card" onClick={onOpen} style={{textAlign:"left",cursor:"pointer"}}>
      <p className="eyebrow">ПОСЛЕДНЯЯ ТРЕНИРОВКА</p>
      <div className="last-workout-body">
        <h4>{trainingLabelRu(workout.title)}</h4>
        <small>{workout.date} · {workout.type}</small>
        <div className="last-workout-stats">
          <span>Время<b>{mins} мин</b></span>
          <span>Калории<b>{fmt(workout.calories||0)}</b></span>
          {workout.avgHeartRate>0&&<span>Пульс<b>{workout.avgHeartRate}</b></span>}
        </div>
      </div>
    </button>
  );
}

const ROADMAP_WEEKS=36;
const roadmapPhases=[
 {title:"Адаптация",period:"Недели 1–12",description:"Формируем привычку, возвращаем базовую выносливость и укрепляем тело.",tags:["База и техника","Фундамент"]},
 {title:"Развитие",period:"Недели 13–24",description:"Постепенно увеличиваем нагрузку, развиваем силу и выносливость.",tags:["Прогрессия","Рост показателей"]},
 {title:"Мастерство",period:"Недели 25–36",description:"Переходим к более высокой интенсивности и закрепляем достигнутую форму.",tags:["Интенсивность","Максимум результата"]},
];
function RoadmapPage({profile}:{profile:any}){
 const rawWeek=currentProgramWeek(profile?.programStart);
 const week=Math.min(ROADMAP_WEEKS,Math.max(1,rawWeek));
 const start=profile?.programStart?new Date(`${profile.programStart}T00:00:00`):null;
 const startValid=Boolean(start&&!Number.isNaN(start.getTime()));
 const progress=startValid?Math.min(100,Math.max(0,Math.round((rawWeek-1)/ROADMAP_WEEKS*100))):0;
 const activePhase=week<=12?0:week<=24?1:2;
 const startLabel=startValid?(start as Date).toLocaleDateString("ru-RU",{day:"numeric",month:"long",year:"numeric"}):"Не указана";
 return <div className="detail-page roadmap-screen">
  <header className="roadmap-heading"><div><p className="eyebrow">ПРОГРАММА · 36 НЕДЕЛЬ</p><h2>Дорожная карта</h2><p>Твой путь к лучшей форме. Три фазы. Один результат.</p></div></header>
  <section className="roadmap-summary" aria-label="Положение в программе">
   <div><small>Старт программы</small><b>{startLabel}</b></div>
   <div><small>Текущая неделя</small><p><b>{week}</b><span>из {ROADMAP_WEEKS}</span></p></div>
   <div className="roadmap-progress"><small>Пройдено</small><p><b>{progress}%</b></p><span aria-hidden="true"><i style={{width:`${progress}%`}}/></span></div>
  </section>
  <div className="roadmap-path" aria-label="Фазы программы">
   {roadmapPhases.map((phase,index)=>{
    const current=index===activePhase;
    const completed=index<activePhase;
    return <article className={`roadmap-phase${current?" current":""}${completed?" completed":""}`} key={phase.title} aria-current={current?"step":undefined}>
     <div className="roadmap-node" aria-hidden="true"><span>{index+1}</span></div>
     <div className="roadmap-phase-card">
      <header><div><small>ФАЗА {index+1}</small><h3>{phase.title}</h3></div>{current&&<b>ТЕКУЩАЯ</b>}</header>
      <p>{phase.description}</p>
      <div className="roadmap-phase-meta">
       <span><CalendarDays size={14}/>{phase.period}</span>
       <span><Dumbbell size={14}/>{phase.tags[0]}</span>
       <span><ChartColumn size={14}/>{phase.tags[1]}</span>
      </div>
     </div>
    </article>;
   })}
  </div>
  <footer className="roadmap-footer"><span aria-hidden="true"><Zap size={24}/></span><div><h3>Последовательность создаёт результат</h3><p>Доверься процессу, выполняй план и наслаждайся прогрессом каждый день. Лучшая версия тебя — впереди.</p></div></footer>
 </div>;
}
function Personal({section,data,refresh,coachAction,loaded,initialProgressTab,onAskCoach}:{section:string;data:any;refresh:()=>void;coachAction:CoachAction|null;loaded?:boolean;initialProgressTab?:string|null;onAskCoach:()=>void}){
 if(section==="Дорожная карта") return <RoadmapPage profile={data.profile}/>;
 if(section==="Вечерний прогресс") return <EveningProgressPage data={data} refresh={refresh} loaded={loaded}/>;
 if(section==="Питание") return <div className="detail-page nutrition-hub"><NutritionDiary data={data} refresh={refresh} onAskCoach={onAskCoach}/><NutritionTools data={data}/><NutritionProgramGuide/></div>;
 return <ProgressPage data={data} refresh={refresh} coachAction={coachAction} initialTab={initialProgressTab}/>
}
function Notice(){return <div className="safety">✦ <span><b>Суставы под защитой</b>{safety}</span></div>}
function PlanExercises({items}:{items:any[]}){return <div className="plan-exercises">{items.map((x:any,index:number)=><article key={x[0]}>{x[3]?<img src={x[3]} alt={`Пример: ${trainingLabelRu(x[0])}`}/>:<span className="plan-exercise-fallback" aria-hidden="true"><Dumbbell size={18}/></span>}<div className="plan-exercise-copy"><div className="plan-exercise-title"><span>{index+1}</span><h4>{trainingLabelRu(x[0])}</h4></div><p>{x[1]}</p><b>{x[2]}</b></div><ExerciseVideo name={x[0]} compact/></article>)}</div>}

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

// Экран «План» · карточка выбранного дня. Для будущих дней действие всегда
// однозначно формулируется как «Выполнить сейчас» (см. AI-11 IA, п.5) — сама
// бизнес-логика запуска (startWorkout всегда создаёт черновик датой «сегодня»)
// не меняется, меняется только текст кнопки.
function planActionMeta(resolved:ResolvedDayPlan,isToday:boolean,todayDone:boolean,openDraftToday:boolean){
 const isRest=resolved.scheduled.type==="Отдых";
 if(isToday){
  if(todayDone)return {label:isRest?"Открыть план дня ещё раз":"Повторить тренировку",cls:"repeat-btn",repeat:true};
  if(openDraftToday)return {label:isRest?"Продолжить план дня":"Продолжить тренировку",cls:"start-btn",repeat:false};
  return {label:isRest?"Открыть план дня":"Начать тренировку",cls:"start-btn",repeat:false};
 }
 if(resolved.locked?.completed)return {label:"Тренировка выполнена",cls:"repeat-btn",repeat:true};
 if(resolved.locked?.openDraft)return {label:"Продолжить тренировку",cls:"start-btn",repeat:false};
 return {label:"Выполнить сейчас",cls:"start-btn",repeat:false};
}

type NutritionInputMode="photo"|"receipt"|"manual";
function nutritionCount(value:number,forms:[string,string,string]){const n=Math.abs(value)%100,m=n%10,word=n>10&&n<20?forms[2]:m===1?forms[0]:m>=2&&m<=4?forms[1]:forms[2];return `${value} ${word}`}
function nutritionPhotoError(status:number,message?:string){
 if(status===400||status===422)return message||"Не удалось распознать изображение. Проверь фото и попробуй ещё раз.";
 if(status===503)return "Распознавание фото сейчас не настроено. Добавь блюдо вручную — приложение не будет придумывать результат.";
 return "Распознавание фото сейчас недоступно. Попробуй позже или добавь блюдо вручную.";
}

function NutritionDiary({data,refresh,onAskCoach}:{data:any;refresh:()=>void;onAskCoach:()=>void}){
 const notify=useToast();
 const today=localIso(new Date());
 const photoInputRef=useRef<HTMLInputElement>(null),receiptInputRef=useRef<HTMLInputElement>(null);
 const [viewDate,setViewDate]=useState(today);
 const [inputMode,setInputMode]=useState<NutritionInputMode|null>(null);
 const [draftText,setDraftText]=useState("");
 const [error,setError]=useState(""),[saving,setSaving]=useState(false),[aiBusy,setAiBusy]=useState(false),[aiNote,setAiNote]=useState(""),[aiKeySet,setAiKeySet]=useState<boolean|null>(null);
 const logs=data.foodLogs||[],dayLogs=logs.filter((x:any)=>x.date===viewDate),sum=dayLogs.reduce((t:any,x:any)=>({calories:t.calories+x.calories,protein:t.protein+x.protein,fat:t.fat+x.fat,carbs:t.carbs+x.carbs}),{calories:0,protein:0,fat:0,carbs:0});
 const calorieTarget=COACH_TARGETS.calories;
 const remaining=Math.round(calorieTarget-sum.calories),caloriePct=Math.min(100,Math.round(sum.calories/calorieTarget*100));
 const activity=(data.activity||[]).find((x:any)=>x.date===viewDate),waterLiters=Number(activity?.waterLiters)||0,waterKnown=Boolean(activity?.waterLogged)||waterLiters>0;
 const coachNote=!dayLogs.length?"Добавь первый приём пищи — рекомендация появится только на реальных данных.":sum.protein<120?`Белка ${Math.round(sum.protein)} г из 150 г. Следующий приём пищи стоит собрать вокруг полноценного источника белка.`:sum.calories>calorieTarget?`Ориентир превышен на ${Math.abs(remaining)} ккал. Это факт дня, а не оценка — следующий выбор можно оставить обычным.`:"По записанным данным дневной баланс близок к ориентиру. Сохрани спокойный ритм без компенсаций.";
 const history=useMemo(()=>{
  const byDate=new Map<string,number>();
  for(const x of (data.foodLogs||[]))byDate.set(x.date,(byDate.get(x.date)||0)+(Number(x.calories)||0));
  return [...Array(14)].map((_,i)=>{const d=new Date();d.setDate(d.getDate()-(13-i));const iso=localIso(d),hasData=byDate.has(iso);return {iso,short:new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"numeric"}).format(d),calories:byDate.get(iso)||0,hasData}});
 },[data.foodLogs]);
 useEffect(()=>{fetch("/api/settings").then(r=>r.ok?r.json():Promise.reject()).then(j=>setAiKeySet(!!j.anthropicKeySet)).catch(()=>setAiKeySet(false))},[]);
 const photoAI=async(e:any)=>{const input=e.currentTarget,files=[...(input.files||[])].slice(0,3),mode=(input.dataset.mode||"photo") as NutritionInputMode;if(!files.length)return;setInputMode(mode);setError("");setAiBusy(true);try{const fd=new FormData();for(const f of files)fd.append("photo",f);const r=await fetch("/api/food-photo",{method:"POST",body:fd}),j=await r.json().catch(()=>({}));if(!r.ok)setError(nutritionPhotoError(r.status,j.error));else{setDraftText((current)=>(current.trim()?`${current.trim()}\n`:"")+j.text);if(j.note)setAiNote(j.note)}}catch{setError(nutritionPhotoError(0))}finally{setAiBusy(false);input.value=""}};
 const submit=async(e:any)=>{e.preventDefault();setError("");setSaving(true);const form=e.currentTarget,body=Object.fromEntries(new FormData(form));const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"food",...body})}),j=await r.json();setSaving(false);if(!r.ok)return setError(j.error||"Не удалось сохранить");form.reset();setDraftText("");setAiNote("");setInputMode(null);notify("Приём пищи сохранён");refresh()};
 const remove=async(id:number)=>{if(!confirm("Удалить этот приём пищи? Дневные показатели будут пересчитаны."))return;const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"deleteFood",id})});if(r.ok){notify("Запись удалена");refresh()}else setError("Не удалось удалить запись")};
 const shiftDay=(delta:number)=>{const d=new Date(`${viewDate}T00:00:00`);d.setDate(d.getDate()+delta);const iso=localIso(d);if(iso<=today)setViewDate(iso)};
 const chooseMode=(mode:NutritionInputMode)=>{setError("");setInputMode(mode)};
 return <>
  <header className="nutrition-hero">
   <div><p className="eyebrow">NUTRITION HUB</p><h2>Nutrition Hub</h2><p>Топливо для твоих целей. Каждый выбор имеет значение.</p></div>
   <div className="nutrition-date-control"><button type="button" onClick={()=>shiftDay(-1)} aria-label="Предыдущий день">←</button><label><CalendarDays size={14}/><input type="date" value={viewDate} max={today} onChange={e=>e.target.value&&setViewDate(e.target.value)}/></label><button type="button" onClick={()=>shiftDay(1)} disabled={viewDate>=today} aria-label="Следующий день">→</button></div>
  </header>

  <div className="nutrition-primary-grid">
   <section className="nutrition-add-panel">
    <div className="nutrition-panel-head"><div><p className="eyebrow">ДОБАВИТЬ ПРИЁМ ПИЩИ</p><h3>Как запишем еду?</h3></div><span><Sparkles size={13}/>AI внутри одного flow</span></div>
    <div className="nutrition-methods" role="group" aria-label="Способ добавления приёма пищи">
     <button type="button" className={`nutrition-method photo${inputMode==="photo"?" selected":""}${aiKeySet===false?" unavailable":""}`} aria-describedby={aiKeySet===false?"nutrition-ai-unavailable":undefined} disabled={aiBusy||aiKeySet===false} onClick={()=>{chooseMode("photo");photoInputRef.current?.click()}}><span><Camera size={22}/></span><b>{aiBusy&&inputMode==="photo"?"Распознаю…":"Фото"}</b><small>Сфотографируй блюдо — AI оценит состав и КБЖУ</small></button>
     <button type="button" className={`nutrition-method${inputMode==="receipt"?" selected":""}${aiKeySet===false?" unavailable":""}`} aria-describedby={aiKeySet===false?"nutrition-ai-unavailable":undefined} disabled={aiBusy||aiKeySet===false} onClick={()=>{chooseMode("receipt");receiptInputRef.current?.click()}}><span><ReceiptText size={22}/></span><b>{aiBusy&&inputMode==="receipt"?"Распознаю…":"Фото + чек"}</b><small>До трёх изображений: блюдо, чек или меню</small></button>
     <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" data-mode="photo" onChange={photoAI} disabled={aiBusy} hidden/>
     <input ref={receiptInputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple data-mode="receipt" onChange={photoAI} disabled={aiBusy} hidden/>
     <button type="button" className={`nutrition-method manual${inputMode==="manual"?" selected":""}`} onClick={()=>chooseMode("manual")}><span><PenLine size={22}/></span><b>Вручную</b><small>Опиши словами или вставь точные КБЖУ</small></button>
    </div>
    {aiKeySet===false&&<div id="nutrition-ai-unavailable" className="nutrition-ai-unavailable" role="status"><div><b>Распознавание фото сейчас недоступно</b><p>Добавь блюдо вручную — приложение не будет придумывать состав или КБЖУ.</p></div><button type="button" onClick={()=>chooseMode("manual")}>Добавить вручную</button><details><summary>Настроить распознавание</summary><AiKeySetup onReady={()=>setAiKeySet(true)}/></details></div>}
    {inputMode&&<form className="nutrition-entry-workspace" onSubmit={submit}>
     <div className="nutrition-entry-meta"><label>Дата<input name="date" type="date" defaultValue={viewDate} key={viewDate} required/></label><label>Приём пищи<select name="mealType" defaultValue="Завтрак"><option>Завтрак</option><option>Обед</option><option>Ужин</option><option>Перекус</option></select></label></div>
     <label className="nutrition-entry-text"><span>{inputMode==="manual"?"Описание приёма пищи":"Результат распознавания"}<small>{inputMode==="manual"?"Можно словами или в точном формате КБЖУ":"Проверь и при необходимости исправь перед сохранением"}</small></span><textarea name="rawText" rows={6} required value={draftText} onChange={e=>setDraftText(e.target.value)} placeholder={inputMode==="manual"?'Например: Омлет из 3 яиц и овощи\n\nили: Омлет — 320 ккал (Б 24 / Ж 21 / У 8)':"После загрузки здесь появятся распознанные блюда"}/></label>
     {aiNote&&<p className="food-ai-note"><b>Оценка AI:</b> {aiNote}<input type="hidden" name="note" value={aiNote}/></p>}
     {error&&<div className="food-error">{error}</div>}
     <div className="nutrition-entry-actions"><button type="button" className="ghost-btn" onClick={()=>{setInputMode(null);setError("")}}>Закрыть</button><button type="submit" disabled={saving||!draftText.trim()}><span>＋</span>{saving?"Обрабатываю…":"Добавить приём пищи"}</button></div>
    </form>}
    {error&&!inputMode&&<div className="food-error">{error}</div>}
   </section>

   <aside className="nutrition-day-column">
    <section className="nutrition-balance">
     <div className="nutrition-balance-head"><div><p className="eyebrow">СЕГОДНЯШНИЙ БАЛАНС</p><h3>{dayLabel(viewDate,today)}</h3></div><span>{nutritionCount(dayLogs.length,["приём","приёма","приёмов"])}</span></div>
     <div className="nutrition-calorie-ring" style={{"--nutrition-progress":`${caloriePct}%`} as any}><div><b>{Math.round(sum.calories)}</b><span>ккал из {calorieTarget}</span></div></div>
     <div className="nutrition-macros"><Macro label="Белки" value={sum.protein} goal={150} unit="г"/><Macro label="Жиры" value={sum.fat} goal={60} unit="г"/><Macro label="Углеводы" value={sum.carbs} goal={170} unit="г"/></div>
     <div className={`nutrition-remaining${remaining<0?" over":""}`}><span>{remaining>=0?"Осталось":"Сверх ориентира"}</span><b>{Math.abs(remaining)} ккал</b></div>
    </section>
    <section className="nutrition-water"><span><Droplets size={21}/></span><div><p className="eyebrow">ВОДА</p><h3>{waterKnown?`${waterLiters.toLocaleString("ru-RU")} л`:"Нет записи"}</h3><small>Заполняется в «Вечернем прогрессе»</small></div></section>
    <section className="nutrition-coach-note"><span><Sparkles size={18}/></span><div><p className="eyebrow">VOLT COACH · ПО ДАННЫМ ДНЯ</p><p>{coachNote}</p><button type="button" className="nutrition-coach-action" onClick={onAskCoach}>Открыть Coach</button></div></section>
   </aside>
  </div>

  <section className="nutrition-meals-section">
   <div className="nutrition-section-head"><div><p className="eyebrow">ПРИЁМЫ ПИЩИ</p><h3>{dayLogs.length?nutritionCount(dayLogs.length,["запись","записи","записей"]):"День пока пуст"}</h3></div>{!dayLogs.length&&<button type="button" className="ghost-btn" onClick={()=>{chooseMode("manual");requestAnimationFrame(()=>document.querySelector(".nutrition-add-panel")?.scrollIntoView({behavior:"smooth",block:"start"}))}}>Добавить вручную</button>}</div>
   {dayLogs.length?<div className="food-log-list">{dayLogs.map((log:any,index:number)=><article key={log.id} className={`meal-${String(log.mealType).toLowerCase()}`}><span className="nutrition-meal-index">{String(index+1).padStart(2,"0")}</span><div className="nutrition-meal-copy"><header><div><em>{log.mealType}</em><b>{nutritionCount(log.items.length,["блюдо","блюда","блюд"])}</b></div><button onClick={()=>remove(log.id)} aria-label={`Удалить ${log.mealType}`} title="Удалить запись">×</button></header>{log.items.map((x:any)=><p key={x.name}><span>{x.name}</span><b>{x.calories} ккал</b></p>)}{log.note&&<footer className="food-note">{log.note}</footer>}</div><div className="nutrition-meal-total"><b>{Math.round(log.calories)}<small>ккал</small></b><span>Б {Math.round(log.protein)} · Ж {Math.round(log.fat)} · У {Math.round(log.carbs)}</span></div></article>)}</div>:<div className="nutrition-empty"><Utensils size={25}/><div><b>Добавь первый приём пищи</b><p>Баланс и рекомендации появятся только после реальной записи.</p></div></div>}
  </section>

  <details className="nutrition-history"><summary><span><p className="eyebrow">ИСТОРИЯ</p><b>Калории за последние 14 дней</b></span><ChevronDown size={17}/></summary><div className="chart-wrap food-history-chart"><div className="chart-labels"><span>{calorieTarget}</span><span>{Math.round(calorieTarget*.75)}</span><span>{Math.round(calorieTarget*.5)}</span><span>{Math.round(calorieTarget*.25)}</span><span>0</span></div><div className="bars" aria-label="Калории за последние 14 дней">{history.map(d=><div className="bar-slot" key={d.iso} title={`${d.short}: ${d.hasData?`${Math.round(d.calories)} ккал`:"нет записи"}`}><i style={{height:`${Math.min(100,d.calories/calorieTarget*100)}%`}} className={d.iso===viewDate?"today":""}/></div>)}</div></div><div className="nutrition-history-list" aria-label="Последние 7 дней">{history.slice(-7).reverse().map((d,index)=><div className={d.iso===viewDate?"today":""} key={d.iso}><span>{index===0?"Сегодня":d.short}</span><i aria-hidden="true"><b style={{width:`${Math.min(100,d.calories/calorieTarget*100)}%`}}/></i><strong>{d.hasData?`${Math.round(d.calories)} ккал`:"нет записи"}</strong></div>)}</div></details>
 </>;
}

function Macro({label,value,goal,unit}:{label:string;value:number;goal:number;unit:string}){const p=Math.min(100,Math.round(value/goal*100));return <div className={`nutrition-macro macro-${label.toLowerCase()}`}><div><span>{label}</span><b>{Math.round(value)} <small>/ {goal} {unit}</small></b></div><div className="macro-bar"><i style={{width:`${p}%`}}/></div></div>}

function NutritionProgramGuide(){return <details className="nutrition-program-guide"><summary><span><p className="eyebrow">ОРИЕНТИРЫ ПРОГРАММЫ</p><b>Шаблон питания и правила</b></span><ChevronDown size={17}/></summary><div className="nutrition-program-content"><div className="nutrition-program-meals">{meals.map((m,i)=><article key={m[0]}><span>{String(i+1).padStart(2,"0")}</span><div><small>{m[0]}</small><h3>{m[1]}</h3></div><b>{m[2]}</b></article>)}</div><div className="nutrition-program-rules"><article><small>БЕЛОК</small><h3>Чередуй источники</h3><p>Курица, индейка, постная говядина, рыба, яйца, творог 5%, греческий йогурт и протеин.</p></article><article><small>ПИВО</small><h3>До 2 × 0,5 л в неделю</h3><p>≈ 450–500 ккал. Убрать хлеб на завтрак и гарнир на ужин. Не пить в день силовой и сразу после.</p></article><article><small>ПЕРЕДЫШКА</small><h3>Каждые 6–8 недель</h3><p>Неделя поддержки около 2300 ккал. Не опускаться ниже 1600 и не голодать после «плохого» дня.</p></article></div></div></details>}

function ProgressPage({data,refresh,coachAction,initialTab}:{data:any;refresh:()=>void;coachAction:CoachAction|null;initialTab?:string|null}){
 const notify=useToast();
 const [tab,setTab]=useState(initialTab||"Путь");
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

 return <div className="detail-page journey-page">
 <div className="metric-tabs journey-tabs" role="group" aria-label="Раздел прогресса">{["Путь","Тело","Тренировки","Состояние","Вехи"].map(x=><button key={x} type="button" data-tour-id={x==="Тело"?"progress-body-tab":undefined} className={tab===x?"active":""} onClick={()=>setTab(x)}>{x}</button>)}</div>
 {tab==="Путь"&&<JourneyOverview data={data} profile={profile} summary={summary} onOpenTab={setTab}/>}
 {tab==="Тело"&&<>
 <ProgressSummaryHero summary={summary} profile={profile}/>

 <div className="section-head"><div><p className="eyebrow">ДИНАМИКА ЗАМЕРОВ</p><h3>Замеры</h3></div><button type="button" className={formOpen?"ghost-btn":"add-measurement-btn"} onClick={()=>setFormOpen(v=>!v)}>{formOpen?"Закрыть":"+ Новый замер"}</button></div>
 {formOpen&&<MeasurementForm previous={history[0]} onClose={()=>setFormOpen(false)} onSaved={()=>{setFormOpen(false);refresh();notify("Замер сохранён")}}/>}
 <MeasurementChart measurements={measurements} target={profile.targetWeight} period={chartPeriod} onPeriodChange={setChartPeriod} anchor={anchor} stages={data.programStages||[]}/>

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

 <ProgramStages stages={data.programStages||[]} refresh={refresh}/>
 </>}
 {tab==="Тренировки"&&<>
 <WorkoutHistory workouts={data.workouts||[]} importedSets={data.importedSets} refresh={refresh}/>
 <StrengthLog data={data} refresh={refresh}/>
 <StrengthAdvice data={data} coachAction={coachAction}/>
 <PersonalRecords data={data}/>
 </>}
 {tab==="Состояние"&&<MoodSection data={data} refresh={refresh}/>}
 {tab==="Вехи"&&<MilestonesSection data={data} refresh={refresh}/>}
 </div>
}

type JourneyOverviewEvent={id:string;date:string;kind:string;title:string;summary:string};

function journeyNumber(value:number){return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(value)}
function journeyDuration(seconds:number){
 const totalMinutes=Math.round(Math.max(0,seconds)/60),hours=Math.floor(totalMinutes/60),minutes=totalMinutes%60;
 if(seconds>0&&totalMinutes===0)return "<1 мин";
 return hours?`${hours} ч${minutes?` ${minutes} мин`:""}`:`${minutes} мин`;
}
function journeyDate(iso:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))return iso;
 return new Intl.DateTimeFormat("ru-RU",{day:"numeric",month:"short"}).format(new Date(`${iso}T12:00:00`)).replace(".","");
}
function journeyEventLabel(kind:string){
 if(kind==="photo-checkpoint")return "Фото прогресса";
 if(kind==="personal-record")return "Личный рекорд";
 if(kind==="new-min-weight")return "Вес";
 if(kind==="program-stage-completed")return "Этап программы";
 if(kind==="best-month-regularity")return "Регулярность";
 if(kind==="swim-workout")return "Плавание";
 if(kind==="workout")return "Тренировка";
 if(kind==="manual")return "Личная веха";
 return "Достижение";
}
function JourneyEventIcon({kind}:{kind:string}){
 if(kind==="photo-checkpoint")return <Camera size={18}/>;
 if(kind==="swim-workout")return <Waves size={18}/>;
 if(kind==="new-min-weight")return <ChartColumn size={18}/>;
 if(kind==="program-stage-completed")return <Route size={18}/>;
 if(kind==="personal-record")return <Dumbbell size={18}/>;
 return <Sparkles size={18}/>;
}

// Journey — presentation-only обзор уже накопленной истории. Все цифры и
// события выводятся из загруженных measurements/workouts/strengthLogs/photos,
// а достижения — через тот же детерминированный useMilestones, что использует
// существующая вкладка «Вехи». Новых метрик, запросов и хранилищ здесь нет.
function JourneyOverview({data,profile,summary,onOpenTab}:{data:any;profile:{name:string;height:number;startWeight:number;targetWeight:number};summary:ProgressSummary;onOpenTab:(tab:string)=>void}){
 const milestones=useMilestones(data);
 const [photosRevealed,setPhotosRevealed]=useState(false);
 const anchor=useMemo(()=>new Date(),[]);
 const workouts=useMemo(()=>[...(data.workouts||[])].sort((a:any,b:any)=>b.date.localeCompare(a.date)||Number(b.id)-Number(a.id)),[data.workouts]);
 const measurements=useMemo(()=>[...(data.measurements||[])].filter((item:any)=>item.weight!=null&&Number.isFinite(Number(item.weight))).sort((a:any,b:any)=>a.date.localeCompare(b.date)||Number(a.id)-Number(b.id)),[data.measurements]);
 const photos=useMemo(()=>[...(data.photos||[])].sort((a:any,b:any)=>a.date.localeCompare(b.date)||Number(a.id)-Number(b.id)),[data.photos]);
 const currentWeight=measurements.length?Number(measurements[measurements.length-1].weight):null;
 const startWeight=Number(profile.startWeight);
 const weightChange=currentWeight==null?null:Math.round((currentWeight-startWeight)*10)/10;
 const heroValue=weightChange==null?(workouts.length?String(workouts.length):"Старт"):`${weightChange<0?"−":weightChange>0?"+":""}${journeyNumber(Math.abs(weightChange))}`;
 const heroUnit=weightChange==null?(workouts.length?"тренировок":""):"кг";
 const heroContext=weightChange==null?(workouts.length?"сохранено в истории":"путь только начинается"):"от стартовой точки";
 const totalDuration=workouts.reduce((sum:number,item:any)=>sum+(Number(item.durationSeconds)||0),0);
 const personalRecords=milestones.filter(item=>item.kind==="personal-record").length;
 const streak=calcStreak(workouts);
 const programWeek=currentProgramWeek(data.profile?.programStart);

 const events=useMemo<JourneyOverviewEvent[]>(()=>{
  const picked:JourneyOverviewEvent[]=[];
  const seenKinds=new Set<string>();
  for(const item of milestones){
   if(seenKinds.has(item.kind))continue;
   seenKinds.add(item.kind);
   picked.push({id:item.id,date:item.occurredAt,kind:item.kind,title:item.title,summary:item.summary});
   if(picked.length===5)break;
  }
  const addWorkout=(item:any,kind:string)=>{
   if(!item||picked.some(event=>event.id===`${kind}-${item.id}`))return;
   const duration=Number(item.durationSeconds)>0?` · ${journeyDuration(Number(item.durationSeconds))}`:"";
   picked.push({id:`${kind}-${item.id}`,date:item.date,kind,title:item.title,summary:`${item.type||"Тренировка"}${duration}`});
  };
  addWorkout(workouts[0],"workout");
  const swim=workouts.find((item:any)=>/плав|swim|бассейн/i.test(`${item.type||""} ${item.title||""}`));
  if(swim?.id!==workouts[0]?.id)addWorkout(swim,"swim-workout");
  return picked.sort((a,b)=>b.date.localeCompare(a.date)||a.id.localeCompare(b.id)).slice(0,7);
 },[milestones,workouts]);

 const strengthBest=useMemo(()=>{
  const byExercise=new Map<string,{weight:number;date:string}>();
  for(const item of data.strengthLogs||[]){
   const weight=Number(item.weight)||0;
   if(weight<=0)continue;
   const current=byExercise.get(item.exercise);
   if(!current||weight>current.weight||(weight===current.weight&&item.date>current.date))byExercise.set(item.exercise,{weight,date:item.date});
  }
  return [...byExercise.entries()].map(([exercise,value])=>({exercise,...value})).sort((a,b)=>b.weight-a.weight||a.exercise.localeCompare(b.exercise)).slice(0,4);
 },[data.strengthLogs]);

 const weightTrend=useMemo(()=>{
  const points=measurements.slice(-8).map((item:any)=>Number(item.weight));
  if(!points.length)return [];
  const min=Math.min(...points),max=Math.max(...points),range=max-min;
  return points.map((value,index)=>({id:measurements.slice(-8)[index].id,height:range?24+((value-min)/range)*66:52,value}));
 },[measurements]);

 const monthlyVolume=useMemo(()=>{
  const counts=new Map<string,number>();
  for(const item of workouts)counts.set(item.date.slice(0,7),(counts.get(item.date.slice(0,7))||0)+1);
  return [...Array(6)].map((_,index)=>{
   const date=new Date(anchor.getFullYear(),anchor.getMonth()-(5-index),1),key=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}`;
   return {key,label:new Intl.DateTimeFormat("ru-RU",{month:"short"}).format(date).replace(".",""),value:counts.get(key)||0};
  });
 },[workouts,anchor]);
 const maxMonth=Math.max(1,...monthlyVolume.map(item=>item.value));

 const activityMap=useMemo(()=>{
  const map=new Map<string,number>();
  for(const item of workouts)map.set(item.date,(map.get(item.date)||0)+1);
  for(const item of data.activity||[]){
   const active=Number(item.activeMinutes)>0||Number(item.steps)>0||Boolean(item.walk);
   if(active)map.set(item.date,Math.max(1,map.get(item.date)||0));
  }
  return map;
 },[workouts,data.activity]);
 const heatmapCells=useMemo(()=>[...Array(112)].map((_,index)=>{
  const date=new Date(anchor);date.setDate(anchor.getDate()-(111-index));
  const iso=localIso(date),value=activityMap.get(iso)||0;
  return {iso,value};
 }),[anchor,activityMap]);
 const activeDays=heatmapCells.filter(item=>item.value>0).length;
 const firstPhoto=photos[0]||null,lastPhoto=photos.length>1?photos[photos.length-1]:null;

 return <div className="journey-overview">
  <section className="journey-hero" aria-labelledby="journey-achievement-title">
   <div className="journey-hero-copy">
    <span>ГЛАВНОЕ ИЗМЕНЕНИЕ</span>
    <p className="journey-achievement"><b>{heroValue}</b>{heroUnit&&<small>{heroUnit}</small>}</p>
    <p className="journey-achievement-context"><Flame size={15}/>{heroContext}</p>
    <h2 id="journey-achievement-title">Твой путь уже складывается из реальных действий</h2>
    <p>Неделя {programWeek}. Продолжай в том же ритме — здесь остаются только подтверждённые изменения и события.</p>
    <button type="button" onClick={()=>onOpenTab("Тело")}>Смотреть прогресс <span aria-hidden="true">→</span></button>
   </div>
   <div className="journey-hero-mark" aria-hidden="true"><span>V</span></div>
   <div className="journey-hero-stats" aria-label="Ключевые факты пути">
    <article><span><Dumbbell size={17}/></span><div><b>{workouts.length}</b><small>тренировок</small></div></article>
    <article><span><Sparkles size={17}/></span><div><b>{personalRecords}</b><small>личных рекордов</small></div></article>
    <article><span><Clock3 size={17}/></span><div><b>{journeyDuration(totalDuration)}</b><small>времени тренировок</small></div></article>
    <article><span><Flame size={17}/></span><div><b>{streak} {daysLabel(streak)}</b><small>текущая серия</small></div></article>
   </div>
  </section>

  <section className="journey-events" aria-labelledby="journey-events-title">
   <header><div><p className="eyebrow">ЛЕНТА СОБЫТИЙ</p><h2 id="journey-events-title">Ключевые изменения</h2></div><button type="button" onClick={()=>onOpenTab("Вехи")}>Все события →</button></header>
   {events.length?<ol>{events.map(event=><li key={event.id}>
    <time dateTime={event.date}>{journeyDate(event.date)}</time>
    <span className="journey-event-icon"><JourneyEventIcon kind={event.kind}/></span>
    <div><small>{journeyEventLabel(event.kind)}</small><b>{trainingLabelRu(event.title)}</b><p>{event.summary}</p></div>
   </li>)}</ol>:<div className="journey-empty"><Sparkles size={22}/><p>Первое событие появится после сохранённой тренировки, замера или личной вехи.</p></div>}
  </section>

  <header className="journey-section-heading"><p className="eyebrow">ТОГДА → СЕЙЧАС</p><h2>Изменения, которые уже случились</h2></header>
  <div className="journey-story-grid">
   <section className="journey-story-card journey-weight-card">
    <header><div><p className="eyebrow">ВЕС</p><h3>{currentWeight!=null?`${journeyNumber(currentWeight)} кг`:"Нет замеров"}</h3></div>{weightChange!=null&&<span className={weightChange<=0?"positive":"neutral"}>{weightChange>0?"+":weightChange<0?"−":""}{journeyNumber(Math.abs(weightChange))} кг</span>}</header>
    <div className="journey-weight-trend" aria-label="История веса">{weightTrend.length?weightTrend.map(item=><i key={item.id} style={{height:`${item.height}%`}} title={`${journeyNumber(item.value)} кг`}/>):<span>Добавь первый замер, чтобы появилась история.</span>}</div>
    <div className="journey-then-now"><span><small>Тогда</small><b>{journeyNumber(startWeight)} кг</b></span><i aria-hidden="true">→</i><span><small>Сейчас</small><b>{currentWeight!=null?`${journeyNumber(currentWeight)} кг`:"—"}</b></span></div>
    <button type="button" onClick={()=>onOpenTab("Тело")}>Подробнее</button>
   </section>

   <section className="journey-story-card journey-photo-card">
    <header><div><p className="eyebrow">ФОТО ПРОГРЕСС</p><h3>{photos.length?`${photos.length} ${photos.length===1?"точка":"точки"}`:"Пока без фото"}</h3></div><Camera size={19}/></header>
    {firstPhoto?<div className={`journey-photo-pair${photosRevealed?" revealed":""}`}>
     <figure><img src={firstPhoto.url} alt="Первое фото прогресса"/><figcaption>{firstPhoto.date}</figcaption></figure>
     {lastPhoto?<figure><img src={lastPhoto.url} alt="Последнее фото прогресса"/><figcaption>{lastPhoto.date}</figcaption></figure>:<div className="journey-photo-placeholder"><Camera size={22}/><span>Нужна вторая точка</span></div>}
     <button type="button" className="journey-photo-reveal" onClick={()=>setPhotosRevealed(value=>!value)}>{photosRevealed?"Скрыть фото":"Показать фото"}</button>
    </div>:<div className="journey-story-empty"><Camera size={26}/><p>Добавь первое контрольное фото. Оно останется скрытым по умолчанию.</p></div>}
    <button type="button" onClick={()=>onOpenTab("Тело")}>{photos.length?"Открыть все фото":"Добавить фото"}</button>
   </section>

   <section className="journey-story-card journey-strength-card">
    <header><div><p className="eyebrow">СИЛА</p><h3>Лучшие результаты</h3></div><Dumbbell size={19}/></header>
    {strengthBest.length?<div className="journey-strength-list">{strengthBest.map(item=><article key={item.exercise}><span><b>{trainingLabelRu(item.exercise)}</b><small>{item.date}</small></span><strong>{journeyNumber(item.weight)} кг</strong></article>)}</div>:<div className="journey-story-empty"><Dumbbell size={26}/><p>Рабочие веса появятся после подтверждённых силовых записей.</p></div>}
    <button type="button" onClick={()=>onOpenTab("Тренировки")}>Все упражнения</button>
   </section>

   <section className="journey-story-card journey-volume-card">
    <header><div><p className="eyebrow">ОБЪЁМ ТРЕНИРОВОК</p><h3>{journeyDuration(totalDuration)}</h3><small>общее подтверждённое время</small></div><Clock3 size={19}/></header>
    <div className="journey-volume-bars" aria-label="Тренировки по месяцам">{monthlyVolume.map(item=><span key={item.key}><i className={item.value?undefined:"empty"} style={{height:item.value?`${item.value/maxMonth*100}%`:"2px"}} title={`${item.value} тренировок`}/><small>{item.label}</small></span>)}</div>
    <button type="button" onClick={()=>onOpenTab("Тренировки")}>Журнал тренировок</button>
   </section>
  </div>

  <div className="journey-bottom-grid">
   <section className="journey-activity-panel">
    <header><div><p className="eyebrow">КАЛЕНДАРЬ АКТИВНОСТИ</p><h3>Последние 16 недель</h3></div><span><b>{activeDays}</b><small>активных дней</small></span></header>
    <div className="journey-heatmap" aria-label="Календарь активности за последние 16 недель">{heatmapCells.map(item=><i key={item.iso} className={`level-${Math.min(3,item.value)}`} title={`${item.iso}: ${item.value?"есть активность":"нет активности"}`}/>)}</div>
    <footer><span><small>Тренировок</small><b>{workouts.length}</b></span><span><small>Текущая серия</small><b>{streak} {daysLabel(streak)}</b></span><span><small>Последний замер</small><b>{summary.lastDate||"—"}</b></span></footer>
   </section>

   <section className="journey-milestones-panel">
    <header><div><p className="eyebrow">МОИ ВЕХИ</p><h3>То, что уже достигнуто</h3></div><button type="button" onClick={()=>onOpenTab("Вехи")}>Все вехи →</button></header>
    {milestones.length?<div>{milestones.slice(0,6).map(item=><article key={item.id}><span><JourneyEventIcon kind={item.kind}/></span><div><b>{item.title}</b><small>{journeyDate(item.occurredAt)}</small></div></article>)}</div>:<div className="journey-empty"><Sparkles size={22}/><p>Вехи появятся только из реальных тренировок, замеров, фото и этапов.</p></div>}
   </section>
  </div>

  <blockquote className="journey-quote"><span aria-hidden="true">“</span><p><b>Дисциплина сегодня</b> — свобода завтра.<small>Ты не соревнуешься с другими. Ты становишься лучшей версией себя.</small></p></blockquote>
 </div>;
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

function MeasurementChart({measurements,target,period,onPeriodChange,anchor,stages=[]}:{measurements:Measurement[];target:number;period:Period;onPeriodChange:(p:Period)=>void;anchor:Date;stages?:{title:string;startDate:string}[]}){
 const [metric,setMetric]=useState<MetricKey>("weight");
 const stats=useMemo(()=>computeMetricStats(measurements,metric,period,anchor),[measurements,metric,period,anchor]);
 return <div>
  <div className="metric-tabs" role="group" aria-label="Выбор замера">{MEASUREMENT_KEYS.map(key=><button key={key} type="button" className={metric===key?"active":""} onClick={()=>setMetric(key)}>{METRIC_LABELS[key]}</button>)}</div>
  <div className="period-tabs" role="group" aria-label="Период графика">{PERIODS.map(p=><button key={p} type="button" className={period===p?"active":""} onClick={()=>onPeriodChange(p)}>{PERIOD_LABELS[p]}</button>)}</div>
  <MetricStatsRow stats={stats} unit={METRIC_UNITS[metric]}/>
  <SeriesChart points={stats.points} label={METRIC_LABELS[metric]} unit={METRIC_UNITS[metric]} target={metric==="weight"?target:undefined} stages={stages}/>
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

function SeriesChart({points,label,unit,target,stages=[]}:{points:MetricPoint[];label:string;unit:string;target?:number;stages?:{title:string;startDate:string}[]}){
 if(points.length<2)return <p className="detail-lead">{points.length===0?`Нет данных «${label}» за выбранный период.`:`Добавь ещё один замер «${label}», чтобы увидеть график.`}</p>;
 const r1=(n:number)=>Math.round(n*10)/10;
 const values=points.map(p=>p.value);
 const min=Math.min(...values,...(target!=null?[target]:[])), max=Math.max(...values,...(target!=null?[target]:[]));
 const padV=(max-min)*0.08||1, lo=min-padV, hi=max+padV;
 const w=680,h=180,padX=10,padY=10;
 const x=(i:number)=>padX+(i/(points.length-1))*(w-2*padX), y=(v:number)=>h-padY-((v-lo)/((hi-lo)||1))*(h-2*padY);
 const path=points.map((p,i)=>`${i===0?"M":"L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
 const trend=computeTrendPoints(points);
 // Sprint 7 — границы этапов программы на графике тела: интерполируем x по дате между
 // соседними точками (точки на оси расположены по индексу, не строго пропорционально
 // времени), поэтому дата этапа не обязана совпадать с датой замера.
 const firstDate=points[0].date,lastDate=points[points.length-1].date;
 const xForDate=(dateStr:string)=>{
  if(dateStr<=firstDate)return x(0);
  if(dateStr>=lastDate)return x(points.length-1);
  for(let i=0;i<points.length-1;i++){
   if(points[i].date<=dateStr&&dateStr<=points[i+1].date){
    const d0=+new Date(points[i].date),d1=+new Date(points[i+1].date),d=+new Date(dateStr);
    const frac=d1===d0?0:(d-d0)/(d1-d0);
    return x(i)+(x(i+1)-x(i))*frac;
   }
  }
  return x(0);
 };
 const visibleStages=stages.filter(s=>s.startDate>=firstDate&&s.startDate<=lastDate);
 return <div className="weight-chart">
  <div className="chart-y-axis"><span>{hi.toFixed(1)}</span><span>{lo.toFixed(1)}</span></div>
  <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label={`График «${label}» по замерам`}>
   {target!=null&&<line x1={padX} y1={y(target)} x2={w-padX} y2={y(target)} stroke="var(--line)" strokeDasharray="4 4"/>}
   {trend&&<line x1={x(0)} y1={y(trend[0].value)} x2={x(points.length-1)} y2={y(trend[1].value)} stroke="#5b6469" strokeWidth="1.5" strokeDasharray="2 4"/>}
   {visibleStages.map(s=>{const sx=xForDate(s.startDate);return <g key={`${s.startDate}-${s.title}`} className="stage-boundary"><line x1={sx} y1={padY} x2={sx} y2={h-padY} stroke="#ffad73" strokeWidth="1" strokeDasharray="3 3"/><title>{`Этап: ${s.title} · с ${s.startDate}`}</title></g>})}
   <path d={path} fill="none" stroke="var(--lime)" strokeWidth="2.5"/>
   {points.map((p,i)=>{const prev=points[i-1],diff=prev?r1(p.value-prev.value):null;return <circle key={p.id} cx={x(i)} cy={y(p.value)} r="3.5" fill="var(--lime)"><title>{`${p.date} · ${p.value} ${unit}${diff!=null?` (${diff>0?"+":""}${diff})`:""}`}</title></circle>})}
  </svg>
  {visibleStages.length>0&&<div className="stage-boundary-labels">{visibleStages.map(s=><span key={`${s.startDate}-${s.title}`}>{s.title}</span>)}</div>}
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

type Stage={id:number;kind:string;title:string;startDate:string;endDate:string|null;note:string;goal:string};
const STAGE_KIND_LABELS:Record<string,string>={start:"Старт",home:"Дома",pool:"Бассейн",gym:"Зал",custom:"Свой этап"};

// Sprint 7 — журнал реальных этапов программы (не путать со статичным планом-расписанием
// personal-data.ts/phases). Чистая метадата: удаление/редактирование этапа не трогает
// workout_logs/measurements.
function ProgramStages({stages,refresh}:{stages:Stage[];refresh:()=>void}){
 const notify=useToast();
 const [adding,setAdding]=useState(false);
 const [editingId,setEditingId]=useState<number|null>(null);
 const sorted=useMemo(()=>[...stages].sort((a,b)=>b.startDate.localeCompare(a.startDate)),[stages]);

 const submitCreate=async(e:any)=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));
  const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"stage",...b})});
  if(!r.ok){const j=await r.json().catch(()=>({}));return notify(j.error||"Не удалось сохранить этап","warn")}
  notify("Этап добавлен");setAdding(false);refresh();
 };
 const submitEdit=async(e:any,id:number)=>{
  e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));
  const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"updateStage",id,...b})});
  if(!r.ok){const j=await r.json().catch(()=>({}));return notify(j.error||"Не удалось сохранить этап","warn")}
  notify("Этап обновлён");setEditingId(null);refresh();
 };
 const remove=async(id:number)=>{
  if(!confirm("Удалить этот этап? Тренировки и замеры это не затронет."))return;
  const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"deleteStage",id})});
  if(r.ok){notify("Этап удалён");refresh()}else notify("Не удалось удалить этап","warn");
 };

 return <details className="profile-collapse stage-collapse">
  <summary><p className="eyebrow">ЭТАПЫ ПРОГРАММЫ</p><h3>{stages.length?`${stages.length} ${stages.length===1?"этап":"этапа"}`:"Пока нет этапов"}</h3></summary>
  <div className="stage-list">{sorted.map(s=>editingId===s.id
   ?<form key={s.id} className="data-form stage-form" onSubmit={e=>submitEdit(e,s.id)}>
     <StageFields defaults={s}/>
     <div className="measure-form-actions"><button type="button" className="ghost-btn" onClick={()=>setEditingId(null)}>Отмена</button><button type="submit">Сохранить</button></div>
    </form>
   :<article key={s.id} className="stage-card">
     <div><b>{STAGE_KIND_LABELS[s.kind]||s.kind}</b><h4>{s.title}</h4><small>{s.startDate} — {s.endDate||"сейчас"}</small>{s.goal&&<p>{s.goal}</p>}{s.note&&<p className="stage-note">{s.note}</p>}</div>
     <div className="stage-actions"><button type="button" onClick={()=>setEditingId(s.id)}>Изменить</button><button type="button" className="stage-delete" onClick={()=>remove(s.id)}>Удалить</button></div>
    </article>
  )}</div>
  {adding
   ?<form className="data-form stage-form" onSubmit={submitCreate}><StageFields/><div className="measure-form-actions"><button type="button" className="ghost-btn" onClick={()=>setAdding(false)}>Отмена</button><button type="submit">Добавить этап</button></div></form>
   :<button type="button" className="add-measurement-btn" onClick={()=>setAdding(true)}>+ Новый этап</button>}
 </details>
}

function StageFields({defaults}:{defaults?:Stage}){
 return <div className="stage-fields">
  <label>Тип<select name="kind" defaultValue={defaults?.kind||"custom"}>{Object.entries(STAGE_KIND_LABELS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
  <label>Название<input name="title" required defaultValue={defaults?.title} placeholder="Например, Зал: блочные тренажёры"/></label>
  <label>Начало<input name="startDate" type="date" required defaultValue={defaults?.startDate}/></label>
  <label>Окончание (пусто — идёт сейчас)<input name="endDate" type="date" defaultValue={defaults?.endDate||""}/></label>
  <label>Цель<input name="goal" defaultValue={defaults?.goal} placeholder="Например, привычка и подготовка к залу"/></label>
  <label>Заметка<textarea name="note" defaultValue={defaults?.note}/></label>
 </div>
}
function WorkoutHistory({workouts,importedSets,refresh}:{workouts:any[];importedSets?:Record<number,any[]>;refresh:()=>void}){
 const notify=useToast();
 const [message,setMessage]=useState(""); const clock=(n:number)=>`${Math.floor((Number(n)||0)/60)} мин ${String((Number(n)||0)%60).padStart(2,"0")} сек`;
 const save=async(e:any,w:any)=>{e.preventDefault();setMessage("");const form=e.currentTarget,raw:any=Object.fromEntries(new FormData(form)),details=(w.details||[]).map((x:any,i:number)=>({...x,value:Number(raw[`detail-${i}`])||0}));const body={action:"updateWorkout",id:w.id,date:raw.date,type:raw.type,title:raw.title,rounds:raw.rounds,durationSeconds:Math.round((Number(raw.durationMinutes)||0)*60),restSeconds:Math.round((Number(raw.restMinutes)||0)*60),minHeartRate:raw.minHeartRate,avgHeartRate:raw.avgHeartRate,maxHeartRate:raw.maxHeartRate,calories:raw.calories,distanceMeters:raw.distanceMeters,avgSpeed:raw.avgSpeed,details};const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)});if(!r.ok){const j=await r.json();notify(j.error||"Не удалось сохранить","warn");return setMessage(j.error||"Не удалось сохранить")};setMessage("Изменения сохранены");notify("Тренировка обновлена");refresh()};
 const remove=async(id:number)=>{if(!confirm("Удалить тренировку без возможности восстановления? Также удалятся связанные силовые записи и предложения прогрессии."))return;const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"deleteWorkout",id})});if(r.ok){notify("Тренировка удалена");refresh()}else{const j=await r.json().catch(()=>({}));notify(j.error||"Не удалось удалить тренировку","warn")}};
 return <section className="workout-history"><div className="section-head"><div><p className="eyebrow">ЖУРНАЛ ТРЕНИРОВОК</p><h3>Предыдущие тренировки</h3></div><b>{workouts.length}</b></div>{message&&<p className="history-message">{message}</p>}<div>{workouts.length===0?<p className="detail-lead">Завершённые тренировки появятся здесь.</p>:workouts.map(w=><details key={w.id} className="history-card"><summary><div><small>{w.date} · {w.type}</small><h4>{trainingLabelRu(w.title)}</h4></div><span><b>{clock(w.durationSeconds)}</b><em>Пульс {w.avgHeartRate||"—"}</em></span></summary><form onSubmit={e=>save(e,w)}><div className="history-fields"><label>Дата<input name="date" type="date" required defaultValue={w.date}/></label><label>Тип<select name="type" defaultValue={w.type}><option>Силовая</option><option>Кардио</option><option>Плавание</option><option>Восстановление</option></select></label><label>Название<input name="title" required defaultValue={w.title}/></label><label>Круги<input name="rounds" type="number" min="1" max="20" defaultValue={w.rounds}/></label><label>Активное время, мин<input name="durationMinutes" type="number" min="0" step="0.01" defaultValue={((w.durationSeconds||0)/60).toFixed(2)}/></label><label>Отдых, мин<input name="restMinutes" type="number" min="0" step="0.01" defaultValue={((w.restSeconds||0)/60).toFixed(2)}/></label><label>Мин. пульс<input name="minHeartRate" type="number" min="0" max="250" defaultValue={w.minHeartRate||0}/></label><label>Средний пульс<input name="avgHeartRate" type="number" min="0" max="250" defaultValue={w.avgHeartRate||0}/></label><label>Макс. пульс<input name="maxHeartRate" type="number" min="0" max="250" defaultValue={w.maxHeartRate||0}/></label><label>Калории<input name="calories" type="number" min="0" defaultValue={w.calories||0}/></label><label>Расстояние, м<input name="distanceMeters" type="number" min="0" step="0.1" defaultValue={w.distanceMeters||0}/></label><label>Скорость, км/ч<input name="avgSpeed" type="number" min="0" step="0.1" defaultValue={w.avgSpeed||0}/></label></div>{(importedSets?.[w.id]?.length??0)>0&&<div className="imported-sets"><h5>Подходы с часов</h5><div className="imported-sets-list">{(importedSets?.[w.id]??[]).map((set:any,i:number)=><span key={i}><b>{set.repetitions??"—"}</b><small>{set.bodyweight?"вес тела":set.weightKg?`${set.weightKg} кг`:"вес не задан"}</small></span>)}</div></div>}{w.details?.length>0&&<div className="history-exercises"><h5>Фактически выполнено</h5>{w.details.map((x:any,i:number)=><label key={`${x.key}-${i}`}><span>{trainingLabelRu(x.name)}</span><input name={`detail-${i}`} type="number" min="0" defaultValue={x.value}/><em>{x.unit}</em></label>)}</div>}<div className="history-form-actions"><button type="submit">Сохранить изменения</button><button type="button" className="delete-workout" onClick={()=>remove(w.id)}>Удалить тренировку</button></div></form></details>)}</div></section>
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
  <form onSubmit={submit} className="strength-form"><label>Упражнение<select name="exercise" value={exercise} onChange={e=>setExercise(e.target.value)}>{gymExercises.map(x=><option key={x} value={x}>{trainingLabelRu(x)}</option>)}</select></label><label>Дата<input name="date" type="date" required defaultValue={localIso(new Date())}/></label><label>Рабочий вес, кг<input name="weight" type="number" min="0" step="0.5" required/></label><label>Повторы<input name="reps" type="number" min="0"/></label><label>Сложность<select name="difficulty" defaultValue="Нормально"><option>Легко</option><option>Нормально</option><option>Тяжело</option><option>Боль</option></select></label><button>Записать</button></form>
  {history.length>0?<>
   <SeriesChart points={history.map((x:any)=>({id:x.id,date:x.date,value:Number(x.weight)}))} label={trainingLabelRu(exercise)} unit="кг"/>
   {trend!=null&&<p className="detail-lead">{trend>0?`+${trend.toFixed(1)} кг с прошлого раза — прогресс.`:trend<0?`${trend.toFixed(1)} кг с прошлого раза.`:"Вес не изменился с прошлого раза."}</p>}
   <div className="strength-history">{ordered.slice(0,10).map((x:any)=><article key={x.id}><b>{x.date}</b><span>{x.weight} кг{x.reps?` × ${x.reps}`:""}</span><button type="button" onClick={()=>remove(x.id)} aria-label="Удалить запись">×</button></article>)}</div>
  </>:<p className="detail-lead">Пока нет записей по «{trainingLabelRu(exercise)}».</p>}
 </section>
}
function WeeklyDigest({data,weekWorkouts,weekDates,currentWeight}:{data:any;weekWorkouts:any[];weekDates:Set<string>;currentWeight:number}){
 const hrs=weekWorkouts.filter((w:any)=>Number(w.avgHeartRate)>0).map((w:any)=>Number(w.avgHeartRate));
 const avgHr=hrs.length?Math.round(hrs.reduce((a:number,b:number)=>a+b,0)/hrs.length):null;
 const activity=data.activity||[];
 const eveningStats=computeEveningWeeklyStats(activity,weekDates,localIso(new Date()));
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
   <article><b>{eveningStats.betterEveningsCount}</b><span>вечеров лучше среднего</span></article>
   <article><b>{avgSleep!=null?avgSleep.toFixed(1):"—"}</b><span>ч сна в среднем</span></article>
  </div>
 </section>
}


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
// Русская плюрализация «день/дня/дней». Прежние варианты давали «0 дня»
// и «11 дня» — теперь 0 → дней, 1 → день, 2–4 → дня, 5–20 → дней, 21 → день.
function daysLabel(n:number){
 const mod10=n%10, mod100=n%100;
 if(mod10===1&&mod100!==11)return "день";
 if(mod10>=2&&mod10<=4&&(mod100<12||mod100>14))return "дня";
 return "дней";
}
function pct(value:any,goal:number){return Math.max(0,Math.min(100,Math.round((Number(value)||0)/goal*100)))}
function fmt(value:any){return Number(value||0).toLocaleString("ru-RU")}
function makeWeek(logs:any[]){const now=new Date(),today=localIso(now), monday=new Date(now);monday.setDate(now.getDate()-((now.getDay()+6)%7));const labels=["ПН","ВТ","СР","ЧТ","ПТ","СБ","ВС"];return labels.map((short,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);const iso=localIso(d),count=logs.filter(x=>x.date===iso).length;return{short,date:String(d.getDate()),iso,count,state:count?"done":iso===today?"active":iso<today?"missed":"future"}})}
