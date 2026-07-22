"use client";

import { useEffect, useMemo, useState } from "react";
import { home, meals, phases, rules, safety, week } from "./personal-data";

const days = [
  { short: "ПН", date: "20", state: "done" },
  { short: "ВТ", date: "21", state: "done" },
  { short: "СР", date: "22", state: "active" },
  { short: "ЧТ", date: "23", state: "future" },
  { short: "ПТ", date: "24", state: "future" },
  { short: "СБ", date: "25", state: "rest" },
  { short: "ВС", date: "26", state: "future" },
];

const workouts = [
  { type: "Силовая", icon: "↗", title: "Гантели по кругу", meta: "7 упражнений  •  2 круга", tag: "Дом · 20 минут", image: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=900&q=88" },
  { type: "Кардио", icon: "⌁", title: "Велосипед", meta: "Разговорный темп  •  40–60 мин", tag: "Без ударной нагрузки", image: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=900&q=88" },
  { type: "Кардио", icon: "◌", title: "Бассейн", meta: "Кроль или спина  •  30–40 мин", tag: "Без брасса", image: "https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=900&q=88" },
];

const filters = ["Все", "Силовые", "Велосипед", "Плавание"];

export default function Home() {
  const [filter, setFilter] = useState("Все");
  const [nav, setNav] = useState("Сегодня");
  const [data,setData]=useState<any>({profile:{name:"Илья",height:167,startWeight:86,targetWeight:67},workouts:[{date:"2026-07-21"}],measurements:[{date:"2026-07-21",weight:85.9}],photos:[]});
  const [workoutOpen,setWorkoutOpen]=useState(false);
  const load=()=>fetch("/api/fitness").then(r=>r.json()).then(setData).catch(()=>{});
  useEffect(()=>{load()},[]);
  const streak=useMemo(()=>calcStreak(data.workouts||[]),[data.workouts]);

  return (
    <main className="app-shell">
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
          <button className="profile" onClick={()=>setNav("Прогресс")}><span className="avatar">И</span><span><b>{data.profile?.name||"Илья"}</b><small>Неделя 1</small></span><i>•••</i></button>
        </div>
      </aside>

      <section className="content" id="top">
        <header className="topbar">
          <div><p className="eyebrow">СРЕДА, 22 ИЮЛЯ</p><h1>Доброе утро, {data.profile?.name||"Илья"}</h1></div>
          <div className="header-actions"><button aria-label="Уведомления" className="icon-btn">◔<span></span></button><button className="mini-avatar" onClick={()=>setNav("Прогресс")}>И</button></div>
        </header>

        {nav === "Сегодня" ? <><section className="hero">
          <div className="hero-photo" role="img" aria-label="Атлет выполняет упражнение с гирей" />
          <div className="hero-shade" />
          <div className="hero-content">
            <span className="pill lime">ДЕНЬ 2 · НЕДЕЛЯ 1</span>
            <h2>ГАНТЕЛИ<br /><em>ПО КРУГУ</em></h2>
            <div className="hero-meta"><span>◷ 20 мин</span><span>◫ 7 упражнений</span><span>◉ 2 круга</span></div>
            <button className="start-btn" onClick={() => setWorkoutOpen(true)}><span>▶</span>Начать тренировку</button>
          </div>
          <div className="coach-note"><span className="coach-avatar">M</span><div><small>СОВЕТ ТРЕНЕРА</small><b>Держи темп. Сегодня ты сильнее.</b></div></div>
        </section>

        <section className="metrics" aria-label="Дневной прогресс">
          <Metric icon="◉" color="orange" label="Активные калории" value="684" unit="/ 900 ккал" pct={76} />
          <Metric icon="◷" color="blue" label="Время активности" value="58" unit="/ 75 мин" pct={77} />
          <Metric icon="↟" color="lime" label="Шаги" value="8 420" unit="/ 10 000" pct={84} />
          <Metric icon="✓" color="violet" label="Тренировки" value="1" unit="/ 2 сегодня" pct={50} />
        </section>

        <div className="grid-main">
          <section className="week-card card">
            <div className="section-head"><div><p className="eyebrow">ЭТА НЕДЕЛЯ</p><h3>Ритм тренировок</h3></div><button>Подробнее ↗</button></div>
            <div className="week-days">
              {days.map((day) => <div key={day.short} className={`day ${day.state}`}><small>{day.short}</small><b>{day.date}</b><span>{day.state === "done" ? "✓" : day.state === "rest" ? "—" : day.state === "active" ? "•" : ""}</span></div>)}
            </div>
            <div className="chart-wrap">
              <div className="chart-labels"><span>100</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
              <div className="bars" aria-label="График нагрузки за неделю">
                {[68, 82, 56, 0, 0, 18, 0].map((h, i) => <div className="bar-slot" key={i}><i style={{height:`${h}%`}} className={i === 2 ? "today" : i === 5 ? "restbar" : ""} /></div>)}
              </div>
            </div>
            <div className="week-footer"><div><small>Нагрузка</small><b><span className="trend">↗ 14%</span> выше прошлой недели</b></div><div><small>Активных дней</small><b>3 <span>/ 5</span></b></div><div><small>Калории</small><b>2 840 <span>ккал</span></b></div></div>
          </section>

          <section className="goal-card card">
            <div className="section-head"><div><p className="eyebrow">ГЛАВНАЯ ЦЕЛЬ</p><h3>Снизить вес</h3></div><button className="dots">•••</button></div>
            <div className="weight-ring"><div><b>85,9</b><span>кг сейчас</span></div></div>
            <div className="weight-row"><div><small>Старт</small><b>86,0 кг</b></div><span>−0,1 кг</span><div className="right"><small>Цель</small><b>67,0 кг</b></div></div>
            <div className="goal-progress"><i style={{width:"1%"}} /></div>
            <p>Старт программы · осталось 18,9 кг</p>
          </section>
        </div>

        <section className="plan-section">
          <div className="section-head plan-title"><div><p className="eyebrow">ПЛАН ТРЕНИРОВОК</p><h3>Следующие занятия</h3></div><button>Весь план →</button></div>
          <div className="filters" role="group" aria-label="Фильтр тренировок">{filters.map((f) => <button key={f} className={filter === f ? "active" : ""} onClick={() => setFilter(f)}>{f}</button>)}</div>
          <div className="workouts">
            {workouts.filter(w => filter === "Все" || w.type.startsWith(filter.replace("ые", "ая")) || (filter === "Бег" && w.type === "Кардио")).map((w) => (
              <article className="workout" key={w.title}>
                <div className="workout-img" style={{backgroundImage:`url(${w.image})`}}><span>{w.type}</span><button aria-label={`Открыть ${w.title}`}>↗</button></div>
                <div className="workout-copy"><small>{w.tag}</small><h4>{w.title}</h4><p>{w.meta}</p></div>
              </article>
            ))}
          </div>
        </section></> : <Personal section={nav} data={data} refresh={load} />}
      </section>

      {workoutOpen&&<WorkoutModal close={()=>setWorkoutOpen(false)} done={()=>{setWorkoutOpen(false);load()}}/>}

      <nav className="mobile-nav" aria-label="Мобильная навигация">{[["Сегодня","⌂"],["План","▦"],["Дорожная карта","⌁"],["Питание","◒"],["Прогресс","◎"]].map(([label,icon])=><button key={label} className={nav===label?"active":""} onClick={()=>setNav(label)}><span>{icon}</span>{label}</button>)}</nav>
    </main>
  );
}

function Metric({ icon, color, label, value, unit, pct }: {icon:string;color:string;label:string;value:string;unit:string;pct:number}) {
  return <article className="metric card"><div className={`metric-icon ${color}`}>{icon}</div><div className="metric-copy"><small>{label}</small><p><b>{value}</b> <span>{unit}</span></p><div className="progress"><i className={color} style={{width:`${pct}%`}} /></div></div><strong>{pct}%</strong></article>;
}

function Intro({k,t,p}:{k:string;t:string;p:string}){return <header className="detail-intro"><p className="eyebrow">{k}</p><h2>{t}</h2><p>{p}</p></header>}
function Personal({section,data,refresh}:{section:string;data:any;refresh:()=>void}){
 if(section==="План") return <div className="detail-page"><Intro k="ПЕРСОНАЛЬНАЯ ПРОГРАММА" t="Тренировки без ударной нагрузки" p="Недели 1–3 — дома. С 4-й недели основным становится расписание зала, бассейна и велосипеда."/><Notice/><h3 className="detail-title">Дом · гантели по кругу</h3><p className="detail-lead">Пн / Ср / Пт · ~20 минут. Неделя 1 — 2 круга; неделя 2 — 3; неделя 3 — прибавка веса или повторов.</p><div className="exercise-list">{home.map((x,i)=><article key={x[0]}><span>{String(i+1).padStart(2,"0")}</span><div><h4>{x[0]}</h4><p>{x[1]}</p></div><b>{x[2]}</b></article>)}</div><h3 className="detail-title">С недели 4 · зал + кардио</h3><div className="day-plan">{week.map(d=><details key={d.d} open={d.d==="Понедельник"}><summary><span>{d.d}</span><div><i>{d.t}</i><h4>{d.n}</h4></div><b>{d.time}</b></summary><div className="mini-exercises">{d.x.map(x=><div key={x}>{x}</div>)}</div></details>)}</div></div>;
 if(section==="Дорожная карта") return <div className="detail-page"><Intro k="ЛИЧНАЯ ДОРОЖНАЯ КАРТА · 5–7 МЕСЯЦЕВ" t="86 → 67 кг" p="Рост 167 см. Быстро, но без потери мышц: до 1 кг в неделю на старте, после 75 кг — 0,5–0,7 кг."/><div className="road-stats">{[["0,8–1,0","кг в неделю"],["3","силовых"],["3–4","кардио"],["5–7","месяцев"]].map(x=><article key={x[1]}><b>{x[0]}</b><span>{x[1]}</span></article>)}</div><Notice/><div className="phases">{phases.map((p,i)=><article key={p.p}><span>{String(i+1).padStart(2,"0")}</span><div><small>{p.p}</small><h3>{p.n}</h3><p>{p.g}</p><ul>{p.x.map(x=><li key={x}>{x}</li>)}</ul></div></article>)}</div><h3 className="detail-title">Правила тяжёлых дней</h3><div className="motivation-grid">{rules.map((r,i)=><article key={r}><span>{String(i+1).padStart(2,"0")}</span><p>{r}</p></article>)}</div></div>;
 if(section==="Питание") return <div className="detail-page"><Intro k="ПИТАНИЕ · БЕЗ ЗАПРЕТОВ" t="≈ 1700 ккал · 150 г белка" p="Белок в каждом приёме пищи, овощи в обед и ужин, вода перед едой. Готовь курицу и крупу на 2–3 дня."/><div className="meal-list">{meals.map((m,i)=><article key={m[0]}><span>{String(i+1).padStart(2,"0")}</span><div><small>{m[0]}</small><h3>{m[1]}</h3></div><b>{m[2]}</b></article>)}</div><div className="nutrition-grid"><article><small>БЕЛОК</small><h3>Чередуй источники</h3><p>Курица, индейка, постная говядина, рыба, яйца, творог 5%, греческий йогурт и протеин.</p></article><article><small>ПИВО</small><h3>До 2 × 0,5 л в неделю</h3><p>≈ 450–500 ккал. Убрать хлеб на завтрак и гарнир на ужин. Не пить в день силовой и сразу после.</p></article><article><small>ПЕРЕДЫШКА</small><h3>Каждые 6–8 недель</h3><p>Неделя поддержки около 2300 ккал. Не опускаться ниже 1600 и не голодать после «плохого» дня.</p></article></div></div>;
 return <ProgressPage data={data} refresh={refresh}/>
}
function Notice(){return <div className="safety">✦ <span><b>Суставы под защитой</b>{safety}</span></div>}

function ProgressPage({data,refresh}:{data:any;refresh:()=>void}){
 const latest=data.measurements?.[0]||{}; const first=data.photos?.[0]; const last=data.photos?.[data.photos.length-1];
 const submit=async(e:any,action:string)=>{e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,...b})});e.currentTarget.reset();refresh()};
 const photo=async(e:any)=>{e.preventDefault();await fetch("/api/photos",{method:"POST",body:new FormData(e.currentTarget)});e.currentTarget.reset();refresh()};
 return <div className="detail-page"><Intro k="ПРОФИЛЬ И ПРОГРЕСС" t={data.profile?.name||"Илья"} p="Тренировки, замеры и фотографии сохраняются в персональном профиле."/>
 <div className="progress-hero"><div className="big-ring"><div><b>{latest.weight||85.9}</b><span>кг сейчас</span></div></div><div><small>ЦЕЛЬ</small><h3>{data.profile?.startWeight||86} → {data.profile?.targetWeight||67} кг</h3><p>Старт: 21 июля 2026 · рост {data.profile?.height||167} см</p><div className="goal-progress"><i style={{width:"1%"}}/></div><b>{data.workouts?.length||1} тренировка отмечена</b></div></div>
 <h3 className="detail-title">Профиль</h3><form className="data-form" onSubmit={e=>submit(e,"profile")}><label>Имя<input name="name" defaultValue={data.profile?.name||"Илья"}/></label><label>Рост<input name="height" type="number" defaultValue={data.profile?.height||167}/></label><label>Стартовый вес<input name="startWeight" type="number" step="0.1" defaultValue={data.profile?.startWeight||86}/></label><label>Цель<input name="targetWeight" type="number" step="0.1" defaultValue={data.profile?.targetWeight||67}/></label><button>Сохранить профиль</button></form>
 <h3 className="detail-title">Новый замер</h3><form className="data-form measures" onSubmit={e=>submit(e,"measurement")}><label>Дата<input required name="date" type="date" defaultValue="2026-07-22"/></label>{[["weight","Вес, кг"],["waist","Талия, см"],["chest","Грудь, см"],["biceps","Бицепс, см"],["thigh","Бедро, см"],["neck","Шея, см"]].map(x=><label key={x[0]}>{x[1]}<input name={x[0]} type="number" step="0.1"/></label>)}<button>Сохранить замер</button></form>
 <div className="measure-table">{data.measurements?.map((m:any)=><article key={m.id}><b>{m.date}</b><span>{m.weight||"—"} кг</span><span>Талия {m.waist||"—"}</span><span>Грудь {m.chest||"—"}</span><span>Бицепс {m.biceps||"—"}</span><span>Бедро {m.thigh||"—"}</span><span>Шея {m.neck||"—"}</span></article>)}</div>
 <h3 className="detail-title">Фото · до и после</h3><p className="detail-lead">«До» — самая первая фотография. «После» автоматически обновляется на последнюю загруженную.</p><div className="photo-compare"><Photo item={first} title="ДО"/><Photo item={last} title="ПОСЛЕ"/></div><form className="photo-form" onSubmit={photo}><input name="date" type="date" defaultValue="2026-07-22"/><input required name="photo" type="file" accept="image/*"/><button>+ Добавить фото</button></form><Notice/></div>
}
function Photo({item,title}:{item:any;title:string}){return <article><span>{title}</span>{item?<img src={item.url} alt={`Фото ${title.toLowerCase()}`}/>:<div>Фото ещё не загружено</div>}<small>{item?.date||"—"}</small></article>}

function WorkoutModal({close,done}:{close:()=>void;done:()=>void}){
 const [round,setRound]=useState(0); const [checks,setChecks]=useState<Record<string,boolean>>({}); const rounds=2;
 const total=home.length*rounds, complete=Object.values(checks).filter(Boolean).length;
 const finish=async()=>{await fetch("/api/fitness",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"workout",date:new Date().toISOString().slice(0,10),type:"Силовая",title:"Гантели по кругу",rounds,completed:Object.keys(checks).filter(k=>checks[k])})});done()};
 return <div className="modal-backdrop"><section className="workout-modal"><header><div><p className="eyebrow">ТРЕНИРОВКА · ~20 МИН</p><h2>Гантели по кругу</h2></div><button onClick={close}>×</button></header><div className="round-tabs">{Array.from({length:rounds},(_,i)=><button key={i} className={round===i?"active":""} onClick={()=>setRound(i)}>Круг {i+1}<span>{home.filter((_,j)=>checks[`${i}-${j}`]).length}/{home.length}</span></button>)}</div><div className="workout-checks">{home.map((x,i)=>{const k=`${round}-${i}`;return <label key={k} className={checks[k]?"done":""}><input type="checkbox" checked={!!checks[k]} onChange={e=>setChecks({...checks,[k]:e.target.checked})}/><span>{i+1}</span><div><b>{x[0]}</b><small>{x[2]} · {x[1]}</small></div></label>})}</div><footer><div><b>{complete}/{total}</b><span>выполнено</span></div><button disabled={complete<total} onClick={finish}>{complete===total?"Завершить тренировку":"Отметь все подходы"}</button></footer></section></div>
}
function calcStreak(logs:any[]){const set=new Set(logs.map(x=>x.date));let d=new Date();const iso=(x:Date)=>x.toISOString().slice(0,10);if(!set.has(iso(d)))d.setDate(d.getDate()-1);let n=0;while(set.has(iso(d))){n++;d.setDate(d.getDate()-1)}return n}
