"use client";

import { useState } from "react";

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
  { type: "Силовая", icon: "↗", title: "Верх тела · Power", meta: "8 упражнений  •  45 мин", tag: "Грудь · Спина", image: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=900&q=88" },
  { type: "Кардио", icon: "⌁", title: "Темповый бег", meta: "6,2 км  •  34 мин", tag: "Кардио · Ноги", image: "https://images.unsplash.com/photo-1552674605-db6ffd4facb5?auto=format&fit=crop&w=900&q=88" },
  { type: "Растяжка", icon: "◌", title: "Mobility Flow", meta: "12 упражнений  •  20 мин", tag: "Всё тело", image: "https://images.unsplash.com/photo-1599447421416-3414500d18a5?auto=format&fit=crop&w=900&q=88" },
];

const filters = ["Все", "Силовые", "Бег", "Велосипед", "Плавание", "Растяжка"];

export default function Home() {
  const [filter, setFilter] = useState("Все");
  const [started, setStarted] = useState(false);
  const [nav, setNav] = useState("Сегодня");

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#top" aria-label="VOLT — на главную"><span className="brand-mark">V</span><b>VOLT</b></a>
        <nav className="side-nav" aria-label="Основная навигация">
          {[
            ["Сегодня", "⌂"], ["План", "▦"], ["Аналитика", "⌁"], ["Цели", "◎"]
          ].map(([label, icon]) => (
            <button key={label} className={nav === label ? "active" : ""} onClick={() => setNav(label)}><span>{icon}</span>{label}</button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="streak"><span>⚡</span><div><b>12 дней</b><small>серия активности</small></div></div>
          <button className="profile"><span className="avatar">AK</span><span><b>Алексей</b><small>Level 14</small></span><i>•••</i></button>
        </div>
      </aside>

      <section className="content" id="top">
        <header className="topbar">
          <div><p className="eyebrow">СРЕДА, 22 ИЮЛЯ</p><h1>Доброе утро, Алексей</h1></div>
          <div className="header-actions"><button aria-label="Уведомления" className="icon-btn">◔<span></span></button><button className="mini-avatar">AK</button></div>
        </header>

        <section className="hero">
          <div className="hero-photo" role="img" aria-label="Атлет выполняет упражнение с гирей" />
          <div className="hero-shade" />
          <div className="hero-content">
            <span className="pill lime">ТРЕНИРОВКА ДНЯ</span>
            <h2>FULL BODY<br /><em>IGNITION</em></h2>
            <div className="hero-meta"><span>◷ 45 мин</span><span>◫ Средняя</span><span>◉ 420 ккал</span></div>
            <button className="start-btn" onClick={() => setStarted(!started)}><span>{started ? "✓" : "▶"}</span>{started ? "Тренировка запущена" : "Начать тренировку"}</button>
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
            <div className="weight-ring"><div><b>78,4</b><span>кг сейчас</span></div></div>
            <div className="weight-row"><div><small>Старт</small><b>82,0 кг</b></div><span>−3,6 кг</span><div className="right"><small>Цель</small><b>74,0 кг</b></div></div>
            <div className="goal-progress"><i /></div>
            <p>43% пути пройдено · осталось 4,4 кг</p>
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
        </section>
      </section>

      <nav className="mobile-nav" aria-label="Мобильная навигация">{[["Сегодня","⌂"],["План","▦"],["Аналитика","⌁"],["Цели","◎"]].map(([label,icon])=><button key={label} className={nav===label?"active":""} onClick={()=>setNav(label)}><span>{icon}</span>{label}</button>)}</nav>
    </main>
  );
}

function Metric({ icon, color, label, value, unit, pct }: {icon:string;color:string;label:string;value:string;unit:string;pct:number}) {
  return <article className="metric card"><div className={`metric-icon ${color}`}>{icon}</div><div className="metric-copy"><small>{label}</small><p><b>{value}</b> <span>{unit}</span></p><div className="progress"><i className={color} style={{width:`${pct}%`}} /></div></div><strong>{pct}%</strong></article>;
}
