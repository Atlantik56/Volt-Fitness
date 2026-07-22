"use client";

import { useEffect, useMemo, useState } from "react";
import { homeWeek, meals, phases, rules, safety, week } from "./personal-data";
import AuthGate from "./auth-gate";

const filters = ["Все", "Силовые", "Велосипед", "Плавание"];

export default function Home() {
  const [filter, setFilter] = useState("Все");
  const [nav, setNav] = useState("Сегодня");
  const [data,setData]=useState<any>({profile:{name:"Илья",height:167,startWeight:86,targetWeight:67},workouts:[],measurements:[],activity:[],photos:[]});
  const [activeWorkout,setActiveWorkout]=useState<any>(null);
  const load=()=>fetch("/api/fitness").then(r=>r.json()).then(setData).catch(()=>{});
  useEffect(()=>{load()},[]);
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
  const todayPlan=homeWeek.find(x=>x.day===(new Date().getDay()||7))||homeWeek[0];
  const upcoming=orderedPlans(homeWeek,new Date().getDay()||7).filter(x=>x.type!=="Отдых").slice(0,3);
  const saveActivity=async(e:any)=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"activity",date:today,...b})});load()};

  return (
    <AuthGate><main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="VOLT — на главную"><span className="brand-mark">V</span><b>VOLT</b></a>
        <nav className="side-nav" aria-label="Основная навигация">
          {[
            ["Сегодня", "⌂"], ["План", "▦"], ["Дорожная карта", "⌁"], ["Питание", "◒"], ["Прогресс", "◎"]
          ].map(([label, icon]) => (
            <button key={label} className={nav === label ? "active" : ""} onClick={() => setNav(label)}><span>{icon}</span>{label}</button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="streak"><span>⚡</span><div><b>{streak} {streak===1?"день":"дня"}</b><small>серия активности</small></div></div>
          <div className="streak dry"><span>🌿</span><div><b>{dryStreak} {dryStreak===1?"день":"дня"}</b><small>без пива</small></div></div>
          <PushToggle/>
          <button className="profile" onClick={()=>setNav("Прогресс")}><span className="avatar">И</span><span><b>{data.profile?.name||"Илья"}</b><small>Неделя 1</small></span><i>•••</i></button>
          <button className="logout" onClick={async()=>{await fetch("/api/auth/logout",{method:"POST"});location.reload()}}>Выйти</button>
        </div>
      </aside>

      <section className="content" id="top">
        <header className="topbar">
          <div><p className="eyebrow">СРЕДА, 22 ИЮЛЯ</p><h1>Доброе утро, {data.profile?.name||"Илья"}</h1></div>
          <div className="header-actions"><button aria-label="Уведомления" className="icon-btn">◔<span></span></button><button className="mini-avatar" onClick={()=>setNav("Прогресс")}>И</button></div>
        </header>

        {nav === "Сегодня" ? <><section className="hero">
          <div className="hero-photo" style={{backgroundImage:`url(${todayPlan.image})`}} role="img" aria-label={todayPlan.title} />
          <div className="hero-shade" />
          <div className="hero-content">
            <span className="pill lime">{todayPlan.d.toUpperCase()} · НЕДЕЛЯ 1</span>
            <h2>{todayPlan.title.toUpperCase()}</h2>
            <div className="hero-meta"><span>◷ {todayPlan.time}</span><span>◫ {todayPlan.exercises.length} упражнений</span>{todayPlan.rounds>1&&<span>◉ {todayPlan.rounds} круга</span>}</div>
            <button className="start-btn" onClick={() => setActiveWorkout(todayPlan)}><span>▶</span>{todayPlan.type==="Отдых"?"Открыть план дня":"Начать тренировку"}</button>
          </div>
          <div className="coach-note"><span className="coach-avatar">M</span><div><small>СОВЕТ ТРЕНЕРА</small><b>Держи темп. Сегодня ты сильнее.</b></div></div>
        </section>

        <section className="metrics" aria-label="Дневной прогресс">
          <Metric icon="◉" color="orange" label="Активные калории" value={fmt(todayActivity.calories||0)} unit="/ 900 ккал" pct={pct(todayActivity.calories,900)} />
          <Metric icon="◷" color="blue" label="Время активности" value={fmt(todayActivity.activeMinutes||0)} unit="/ 75 мин" pct={pct(todayActivity.activeMinutes,75)} />
          <Metric icon="↟" color="lime" label="Шаги" value={fmt(todayActivity.steps||0)} unit="/ 10 000" pct={pct(todayActivity.steps,10000)} />
          <Metric icon="✓" color="violet" label="Тренировки" value={String(todayWorkouts)} unit="/ 1 сегодня" pct={pct(todayWorkouts,1)} />
        </section>

        <form className="activity-entry card" onSubmit={saveActivity}><div><p className="eyebrow">ДАННЫЕ ЗА СЕГОДНЯ</p><h3>Обновить активность</h3></div><label>Калории<input name="calories" type="number" min="0" defaultValue={todayActivity.calories||0}/></label><label>Активность, мин<input name="activeMinutes" type="number" min="0" defaultValue={todayActivity.activeMinutes||0}/></label><label>Шаги<input name="steps" type="number" min="0" defaultValue={todayActivity.steps||0}/></label><label>Пиво, банки<input name="beers" type="number" min="0" defaultValue={todayActivity.beers||0}/></label><button>Сохранить</button></form>

        <MoodCheckin data={data} refresh={load}/>

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
        </section></> : <Personal section={nav} data={data} refresh={load} />}
      </section>

      {activeWorkout&&<WorkoutModal plan={activeWorkout} close={()=>setActiveWorkout(null)} done={()=>{setActiveWorkout(null);load()}}/>}

      <nav className="mobile-nav" aria-label="Мобильная навигация">{[["Сегодня","⌂"],["План","▦"],["Дорожная карта","⌁"],["Питание","◒"],["Прогресс","◎"]].map(([label,icon])=><button key={label} className={nav===label?"active":""} onClick={()=>setNav(label)}><span>{icon}</span>{label}</button>)}</nav>
    </main></AuthGate>
  );
}

function Metric({ icon, color, label, value, unit, pct }: {icon:string;color:string;label:string;value:string;unit:string;pct:number}) {
  return <article className="metric card"><div className={`metric-icon ${color}`}>{icon}</div><div className="metric-copy"><small>{label}</small><p><b>{value}</b> <span>{unit}</span></p><div className="progress"><i className={color} style={{width:`${pct}%`}} /></div></div><strong>{pct}%</strong></article>;
}

function Intro({k,t,p}:{k:string;t:string;p:string}){return <header className="detail-intro"><p className="eyebrow">{k}</p><h2>{t}</h2><p>{p}</p></header>}
function Personal({section,data,refresh}:{section:string;data:any;refresh:()=>void}){
 if(section==="План") return <div className="detail-page"><Intro k="ПЕРСОНАЛЬНАЯ ПРОГРАММА" t="Тренировки без ударной нагрузки" p="Недели 1–3 — дома. С 4-й недели основным становится расписание зала, бассейна и велосипеда."/><Notice/><h3 className="detail-title">Недели 1–3 · домашний план по дням</h3><p className="detail-lead">Неделя 1 — 2 круга; неделя 2 — 3; неделя 3 — прибавка веса или повторов.</p><div className="day-plan">{homeWeek.map(d=><details key={d.d} open={d.day===(new Date().getDay()||7)}><summary><span>{d.d}</span><div><i>{d.type}</i><h4>{d.title}</h4></div><b>{d.time}</b></summary><PlanExercises items={d.exercises}/></details>)}</div><h3 className="detail-title">С недели 4 · зал + кардио</h3><p className="detail-lead">Открой нужный день: внутри — полный список, техника и фотопримеры.</p><div className="day-plan">{week.map(d=><details key={d.d}><summary><span>{d.d}</span><div><i>{d.t}</i><h4>{d.n}</h4></div><b>{d.time}</b></summary><PlanExercises items={d.x}/></details>)}</div></div>;
 if(section==="Дорожная карта") return <div className="detail-page"><Intro k="ЛИЧНАЯ ДОРОЖНАЯ КАРТА · 5–7 МЕСЯЦЕВ" t="86 → 67 кг" p="Рост 167 см. Быстро, но без потери мышц: до 1 кг в неделю на старте, после 75 кг — 0,5–0,7 кг."/><div className="road-stats">{[["0,8–1,0","кг в неделю"],["3","силовых"],["3–4","кардио"],["5–7","месяцев"]].map(x=><article key={x[1]}><b>{x[0]}</b><span>{x[1]}</span></article>)}</div><Notice/><div className="phases">{phases.map((p,i)=><article key={p.p}><span>{String(i+1).padStart(2,"0")}</span><div><small>{p.p}</small><h3>{p.n}</h3><p>{p.g}</p><ul>{p.x.map(x=><li key={x}>{x}</li>)}</ul></div></article>)}</div><h3 className="detail-title">Правила тяжёлых дней</h3><div className="motivation-grid">{rules.map((r,i)=><article key={r}><span>{String(i+1).padStart(2,"0")}</span><p>{r}</p></article>)}</div></div>;
 if(section==="Питание") return <div className="detail-page"><Intro k="ПИТАНИЕ · БЕЗ ЗАПРЕТОВ" t="≈ 1700 ккал · 150 г белка" p="Белок в каждом приёме пищи, овощи в обед и ужин, вода перед едой. Готовь курицу и крупу на 2–3 дня."/><NutritionDiary data={data} refresh={refresh}/><div className="meal-list">{meals.map((m,i)=><article key={m[0]}><span>{String(i+1).padStart(2,"0")}</span><div><small>{m[0]}</small><h3>{m[1]}</h3></div><b>{m[2]}</b></article>)}</div><div className="nutrition-grid"><article><small>БЕЛОК</small><h3>Чередуй источники</h3><p>Курица, индейка, постная говядина, рыба, яйца, творог 5%, греческий йогурт и протеин.</p></article><article><small>ПИВО</small><h3>До 2 × 0,5 л в неделю</h3><p>≈ 450–500 ккал. Убрать хлеб на завтрак и гарнир на ужин. Не пить в день силовой и сразу после.</p></article><article><small>ПЕРЕДЫШКА</small><h3>Каждые 6–8 недель</h3><p>Неделя поддержки около 2300 ккал. Не опускаться ниже 1600 и не голодать после «плохого» дня.</p></article></div></div>;
 return <ProgressPage data={data} refresh={refresh}/>
}
function Notice(){return <div className="safety">✦ <span><b>Суставы под защитой</b>{safety}</span></div>}
function PlanExercises({items}:{items:any[]}){return <div className="plan-exercises">{items.map((x:any)=><article key={x[0]}>{x[3]&&<img src={x[3]} alt={`Пример: ${x[0]}`}/>}<div><h4>{x[0]}</h4><p>{x[1]}</p><b>{x[2]}</b></div></article>)}</div>}

function NutritionDiary({data,refresh}:{data:any;refresh:()=>void}){
 const [error,setError]=useState(""),[saving,setSaving]=useState(false);const today=localIso(new Date()),logs=data.foodLogs||[],todayLogs=logs.filter((x:any)=>x.date===today),sum=todayLogs.reduce((t:any,x:any)=>({calories:t.calories+x.calories,protein:t.protein+x.protein,fat:t.fat+x.fat,carbs:t.carbs+x.carbs}),{calories:0,protein:0,fat:0,carbs:0});
 const submit=async(e:any)=>{e.preventDefault();setError("");setSaving(true);const form=e.currentTarget,body=Object.fromEntries(new FormData(form));const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"food",...body})}),j=await r.json();setSaving(false);if(!r.ok)return setError(j.error||"Не удалось сохранить");form.reset();refresh()};
 const remove=async(id:number)=>{if(!confirm("Удалить этот приём пищи? Дневные показатели будут пересчитаны."))return;const r=await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"deleteFood",id})});if(r.ok)refresh();else setError("Не удалось удалить запись")};
 return <section className="food-diary"><div className="section-head"><div><p className="eyebrow">ДНЕВНИК ПИТАНИЯ</p><h3>Сегодня</h3></div><b>{Math.round(sum.calories)} / 1700 ккал</b></div><div className="macro-scales"><Macro label="Калории" value={sum.calories} goal={1700} unit="ккал"/><Macro label="Белки" value={sum.protein} goal={150} unit="г"/><Macro label="Жиры" value={sum.fat} goal={60} unit="г"/><Macro label="Углеводы" value={sum.carbs} goal={170} unit="г"/></div><form onSubmit={submit}><label className="food-date">Дата<input name="date" type="date" defaultValue={today} required/></label><label className="food-kind">Приём пищи<select name="mealType" defaultValue="Завтрак"><option>Завтрак</option><option>Обед</option><option>Ужин</option><option>Перекус</option></select></label><label className="food-text">Вставьте описание приёма пищи<textarea name="rawText" rows={8} required placeholder={'🍲 Бульон говяжий с яйцом — 130 ккал (Б 10 / Ж 8 / У 2)\n🦃 Индейка запечённая — 350 ккал (Б 58 / Ж 11 / У 3)'}/></label>{error&&<div className="food-error">{error}</div>}<button type="submit" disabled={saving}><span>＋</span>{saving?"Обрабатываю…":"Отправить и рассчитать"}</button></form>{todayLogs.length>0&&<div className="food-log-list">{todayLogs.map((log:any)=><article key={log.id} className={`meal-${String(log.mealType).toLowerCase()}`}><header><div><em>{log.mealType}</em><b>{log.items.length} блюда</b></div><span>{Math.round(log.calories)} ккал · Б {log.protein} / Ж {log.fat} / У {log.carbs}</span><button onClick={()=>remove(log.id)} aria-label={`Удалить ${log.mealType}`} title="Удалить запись">×</button></header>{log.items.map((x:any)=><p key={x.name}><span>{x.name}</span><b>{x.calories} ккал</b></p>)}</article>)}</div>}</section>
}
function Macro({label,value,goal,unit}:{label:string;value:number;goal:number;unit:string}){const p=Math.min(100,Math.round(value/goal*100));return <article><div><span>{label}</span><b>{Math.round(value)} / {goal} {unit}</b></div><div className="macro-bar"><i style={{width:`${p}%`}}/></div><small>{p}%</small></article>}

function ProgressPage({data,refresh}:{data:any;refresh:()=>void}){
 const latest=data.measurements?.[0]||{}; const first=data.photos?.[0]; const last=data.photos?.[data.photos.length-1];
 const startWeight=Number(data.profile?.startWeight??86), targetWeight=Number(data.profile?.targetWeight??67), currentWeight=Number(latest.weight??startWeight);
 const goalPct=Math.max(0,Math.min(100,((startWeight-currentWeight)/(startWeight-targetWeight||1))*100));
 const submit=async(e:any,action:string)=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...b})});e.currentTarget.reset();refresh()};
 const photo=async(e:any)=>{e.preventDefault();await fetch("/api/photos",{method:"POST",body:new FormData(e.currentTarget)});e.currentTarget.reset();refresh()};
 const deletePhoto=async(id:number)=>{if(!confirm("Удалить это фото? Действие необратимо."))return;await fetch(`/api/photos?id=${id}`,{method:"DELETE"});refresh()};
 return <div className="detail-page"><Intro k="ПРОФИЛЬ И ПРОГРЕСС" t={data.profile?.name||"Илья"} p="Тренировки, замеры и фотографии сохраняются в персональном профиле."/>
 <div className="progress-hero"><div className="big-ring"><div><b>{latest.weight||85.9}</b><span>кг сейчас</span></div></div><div><small>ЦЕЛЬ</small><h3>{data.profile?.startWeight||86} → {data.profile?.targetWeight||67} кг</h3><p>Старт: 21 июля 2026 · рост {data.profile?.height||167} см</p><div className="goal-progress"><i style={{width:`${goalPct}%`}}/></div><b>{data.workouts?.length||1} тренировка отмечена</b></div></div>
 <h3 className="detail-title">Профиль</h3><form className="data-form" onSubmit={e=>submit(e,"profile")}><label>Имя<input name="name" defaultValue={data.profile?.name||"Илья"}/></label><label>Рост<input name="height" type="number" defaultValue={data.profile?.height||167}/></label><label>Стартовый вес<input name="startWeight" type="number" step="0.1" defaultValue={data.profile?.startWeight||86}/></label><label>Цель<input name="targetWeight" type="number" step="0.1" defaultValue={data.profile?.targetWeight||67}/></label><button>Сохранить профиль</button></form>
 <h3 className="detail-title">Динамика веса</h3><WeightChart measurements={data.measurements||[]} target={targetWeight}/>
 <h3 className="detail-title">Новый замер</h3><form className="data-form measures" onSubmit={e=>submit(e,"measurement")}><label>Дата<input required name="date" type="date" defaultValue="2026-07-22"/></label>{[["weight","Вес, кг"],["waist","Талия, см"],["chest","Грудь, см"],["biceps","Бицепс, см"],["thigh","Бедро, см"],["neck","Шея, см"]].map(x=><label key={x[0]}>{x[1]}<input name={x[0]} type="number" step="0.1"/></label>)}<button>Сохранить замер</button></form>
 <div className="measure-table">{data.measurements?.map((m:any)=><article key={m.id}><b>{m.date}</b><span>{m.weight||"—"} кг</span><span>Талия {m.waist||"—"}</span><span>Грудь {m.chest||"—"}</span><span>Бицепс {m.biceps||"—"}</span><span>Бедро {m.thigh||"—"}</span><span>Шея {m.neck||"—"}</span></article>)}</div>
 <h3 className="detail-title">Фото · до и после</h3><p className="detail-lead">«До» — самая первая фотография. «После» автоматически обновляется на последнюю загруженную. Фото скрыты по умолчанию — нажми, чтобы показать.</p><div className="photo-compare"><Photo item={first} title="ДО" onDelete={deletePhoto}/><Photo item={last} title="ПОСЛЕ" onDelete={deletePhoto}/></div><form className="photo-form" onSubmit={photo}><input name="date" type="date" defaultValue="2026-07-22"/><input required name="photo" type="file" accept="image/*"/><button>+ Добавить фото</button></form><Notice/></div>
}
function Photo({item,title,onDelete}:{item:any;title:string;onDelete?:(id:number)=>void}){
 const [revealed,setRevealed]=useState(false);
 if(!item) return <article><span>{title}</span><div>Фото ещё не загружено</div></article>;
 return <article className={`priv-wrap${revealed?" revealed":""}`}>
  <span>{title}</span>
  <img className="priv-photo" src={item.url} alt={`Фото ${title.toLowerCase()}`}/>
  {!revealed&&<button type="button" className="priv-reveal" onClick={()=>setRevealed(true)}>👁 Показать фото</button>}
  {onDelete&&<button type="button" className="photo-delete" aria-label="Удалить фото" title="Удалить фото" onClick={()=>onDelete(item.id)}>×</button>}
  <small>{item.date}</small>
 </article>
}

function WorkoutModal({plan,close,done}:{plan:any;close:()=>void;done:()=>void}){
 const [round,setRound]=useState(0); const [checks,setChecks]=useState<Record<string,boolean>>({}); const rounds=Math.max(1,plan.rounds);
 const total=plan.exercises.length*rounds, complete=Object.values(checks).filter(Boolean).length;
 const finish=async()=>{await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"workout",date:localIso(new Date()),type:plan.type,title:plan.title,rounds,completed:Object.keys(checks).filter(k=>checks[k])})});done()};
 return <div className="modal-backdrop"><section className="workout-modal"><header><div><p className="eyebrow">{plan.d.toUpperCase()} · {plan.time}</p><h2>{plan.title}</h2></div><button onClick={close}>×</button></header>{rounds>1&&<div className="round-tabs">{Array.from({length:rounds},(_,i)=><button key={i} className={round===i?"active":""} onClick={()=>setRound(i)}>Круг {i+1}<span>{plan.exercises.filter((_:any,j:number)=>checks[`${i}-${j}`]).length}/{plan.exercises.length}</span></button>)}</div>}<div className="workout-checks visual">{plan.exercises.map((x:any,i:number)=>{const k=`${round}-${i}`;return <label key={k} className={checks[k]?"done":""}><input type="checkbox" checked={!!checks[k]} onChange={e=>setChecks({...checks,[k]:e.target.checked})}/>{x[3]?<img src={x[3]} alt={`Техника: ${x[0]}`}/>:<span>{i+1}</span>}<div><b>{x[0]}</b><small><strong>{x[2]}</strong>{x[1]}</small></div></label>})}</div><footer><div><b>{complete}/{total}</b><span>выполнено</span></div><button disabled={complete<total} onClick={finish}>{complete===total?"Завершить тренировку":"Отметь все упражнения"}</button></footer></section></div>
}
function WeightChart({measurements,target}:{measurements:any[];target:number}){
 const points=[...measurements].filter((m:any)=>m.weight!=null).sort((a:any,b:any)=>a.date.localeCompare(b.date));
 if(points.length<2)return <p className="detail-lead">Добавь ещё один замер веса, чтобы увидеть график.</p>;
 const weights=points.map((p:any)=>Number(p.weight)), min=Math.min(...weights,target)-1, max=Math.max(...weights)+1;
 const w=680,h=180,pad=10;
 const x=(i:number)=>pad+(i/(points.length-1))*(w-2*pad), y=(v:number)=>h-pad-((v-min)/(max-min||1))*(h-2*pad);
 const path=points.map((p:any,i:number)=>`${i===0?"M":"L"}${x(i).toFixed(1)},${y(Number(p.weight)).toFixed(1)}`).join(" ");
 return <div className="weight-chart"><svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="График веса по замерам">
  <line x1={pad} y1={y(target)} x2={w-pad} y2={y(target)} stroke="var(--line)" strokeDasharray="4 4"/>
  <path d={path} fill="none" stroke="var(--lime)" strokeWidth="2.5"/>
  {points.map((p:any,i:number)=><circle key={p.id} cx={x(i)} cy={y(Number(p.weight))} r="3.5" fill="var(--lime)"/>)}
 </svg><div className="weight-chart-labels"><span>{points[0].date}</span><span>Цель {target} кг</span><span>{points[points.length-1].date}</span></div></div>
}

function MoodCheckin({data,refresh}:{data:any;refresh:()=>void}){
 const [note,setNote]=useState(""), [saving,setSaving]=useState(false), today=localIso(new Date());
 const moods=["😊","🙂","😐","😔","😢","😡"];
 const log=async(mood:string)=>{setSaving(true);await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"mood",date:today,mood,note})});setNote("");setSaving(false);refresh()};
 const remove=async(id:number)=>{await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"deleteMood",id})});refresh()};
 const recent=(data.moodLogs||[]).slice(0,5);
 return <section className="mood-card card"><div className="section-head"><div><p className="eyebrow">КАК ТЫ СЕЙЧАС</p><h3>Отметь состояние</h3></div></div>
  <div className="mood-picker">{moods.map(m=><button key={m} type="button" disabled={saving} onClick={()=>log(m)}>{m}</button>)}</div>
  <input className="mood-note" placeholder="Коротко, если хочешь (необязательно)" value={note} onChange={e=>setNote(e.target.value)} maxLength={300}/>
  {recent.length>0&&<div className="mood-log">{recent.map((m:any)=><div key={m.id} className="mood-entry"><span>{m.mood}</span><small>{m.date}{m.note?` · ${m.note}`:""}</small><button type="button" onClick={()=>remove(m.id)} aria-label="Удалить запись">×</button></div>)}</div>}
 </section>
}

function urlBase64ToUint8Array(base64:string){const padding="=".repeat((4-base64.length%4)%4);const b64=(base64+padding).replace(/-/g,"+").replace(/_/g,"/");const raw=atob(b64);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;++i)out[i]=raw.charCodeAt(i);return out}
function PushToggle(){
 const [enabled,setEnabled]=useState(false), [busy,setBusy]=useState(false), [supported,setSupported]=useState(true);
 useEffect(()=>{if(!("serviceWorker" in navigator)||!("PushManager" in window)){setSupported(false);return}navigator.serviceWorker.ready.then(reg=>reg.pushManager.getSubscription()).then(sub=>setEnabled(!!sub)).catch(()=>{})},[]);
 if(!supported)return null;
 const toggle=async()=>{
  setBusy(true);
  try{
   const reg=await navigator.serviceWorker.ready;
   if(enabled){
    const sub=await reg.pushManager.getSubscription();
    if(sub){await fetch("/api/push",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({endpoint:sub.endpoint})});await sub.unsubscribe()}
    setEnabled(false);
   }else{
    const perm=await Notification.requestPermission();
    if(perm!=="granted")return;
    const key=process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY||"";
    const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(key)});
    await fetch("/api/push",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(sub.toJSON())});
    setEnabled(true);
   }
  }finally{setBusy(false)}
 };
 return <button type="button" className="push-toggle" onClick={toggle} disabled={busy}>{enabled?"🔔 Напоминание включено":"🔕 Включить напоминание"}</button>
}

function calcDryStreak(activity:any[]){const map=new Map(activity.map((x:any)=>[x.date,Number(x.beers)||0]));const d=new Date();const iso=(x:Date)=>localIso(x);if(!map.has(iso(d)))d.setDate(d.getDate()-1);let n=0;while(map.has(iso(d))&&map.get(iso(d))===0){n++;d.setDate(d.getDate()-1)}return n}
function calcStreak(logs:any[]){const set=new Set(logs.map(x=>x.date));const d=new Date();const iso=(x:Date)=>x.toISOString().slice(0,10);if(!set.has(iso(d)))d.setDate(d.getDate()-1);let n=0;while(set.has(iso(d))){n++;d.setDate(d.getDate()-1)}return n}
function localIso(d:Date){const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);return z.toISOString().slice(0,10)}
function pct(value:any,goal:number){return Math.max(0,Math.min(100,Math.round((Number(value)||0)/goal*100)))}
function fmt(value:any){return Number(value||0).toLocaleString("ru-RU")}
function makeWeek(logs:any[]){const now=new Date(),today=localIso(now), monday=new Date(now);monday.setDate(now.getDate()-((now.getDay()+6)%7));const labels=["ПН","ВТ","СР","ЧТ","ПТ","СБ","ВС"];return labels.map((short,i)=>{const d=new Date(monday);d.setDate(monday.getDate()+i);const iso=localIso(d),count=logs.filter(x=>x.date===iso).length;return{short,date:String(d.getDate()),iso,count,state:count?"done":iso===today?"active":iso<today?"missed":"future"}})}
function orderedPlans(plans:any[],today:number){return [...plans].sort((a,b)=>((a.day-today+7)%7)-((b.day-today+7)%7))}
