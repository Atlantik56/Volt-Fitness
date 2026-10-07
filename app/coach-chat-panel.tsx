"use client";

// Sprint 6.11 — компактная панель чата с VOLT Coach.
// Не отдельный полноэкранный чат: узкая панель поверх текущего экрана.
// Использует уже существующий /api/coach-chat (Sprint 6.8) и его персистентную
// историю (lib/db.ts coach_conversation). ИИ здесь только отвечает на вопросы —
// решение дня (CoachDecision) не пересчитывает и не переопределяет.

import { useEffect, useRef, useState } from "react";
import { useToast } from "./toast";
import { canSubmitCoachQuestion, coachErrorMessage, coachRequestForQuestion, type CoachChatRequest } from "@/lib/coach-chat-client";

type FoodItem={name:string;calories:number;protein:number;fat:number;carbs:number};
type ChatMessage = { role: "user" | "assistant"; text: string; recommendation?: string | null; food?: FoodItem[] | null; foodSaved?: boolean };
type HubSettings={anthropicKeySet:boolean;anthropicEnabled?:boolean;mwsKeySet:boolean;mwsProject:string;mwsModel:string};

type QuickAction={label:string;icon?:string;onClick:()=>void};

export function CoachChatPanel({ open, onClose, plan, today, quickActions=[], suggestedQuestions=[], embedded=false, onFoodSaved, originalPlan=null, planChanged=false, changeReasonCode="" }: { open: boolean; onClose: () => void; plan: { title: string; type: string } | null; today: string; quickActions?: QuickAction[]; suggestedQuestions?: string[]; embedded?: boolean; onFoodSaved?: () => void; originalPlan?: { title: string; type: string } | null; planChanged?: boolean; changeReasonCode?: string }) {
  const notify = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [savingFood, setSavingFood] = useState<number|null>(null);
  const [loaded, setLoaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [provider,setProvider]=useState<"anthropic"|"mws"|"anthropic+mws"|null>(null);
  const [providerChoice,setProviderChoice]=useState<"auto"|"anthropic"|"mws"|"consensus">("auto");
  const [hubSettings,setHubSettings]=useState<HubSettings|null>(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [error,setError]=useState<{message:string;code?:string;provider?:string}|null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const sendingRef=useRef(false);
  const requestRef=useRef<CoachChatRequest|null>(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/coach-chat", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setMessages(Array.isArray(j.messages) ? j.messages : []))
      .catch(() => setError({message:"Не удалось загрузить историю Coach. Повторите после проверки соединения.",code:"network"}))
      .finally(() => setLoaded(true));
    fetch("/api/settings",{cache:"no-store"}).then(r=>r.json()).then(setHubSettings).catch(()=>{});
  }, [open, loaded]);

  useEffect(() => {
    const list=listRef.current;
    if(!list)return;
    const reduceMotion=window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    list.scrollTo({ top:list.scrollHeight, behavior:reduceMotion?"auto":"smooth" });
  }, [messages, sending]);

  if (!open) return null;

  const sendQuestion = async (text: string) => {
    text = text.trim();
    if (!canSubmitCoachQuestion(text,sendingRef.current)) return;
    const request=coachRequestForQuestion(requestRef.current,text,()=>crypto.randomUUID());
    requestRef.current=request;
    sendingRef.current=true;
    setError(null);
    setQuestion("");
    setMessages((current) => [...current, { role: "user", text }]);
    setSending(true);
    try {
      const r = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: today, plan, originalPlan, planChanged, changeReasonCode, question: text,provider:providerChoice,requestId:request.id }),
      });
      const j = await r.json().catch(()=>({error:"Сервер VOLT вернул некорректный ответ",code:"invalid_json"}));
      if (!r.ok) {
        const message=coachErrorMessage(j,r.status);
        setError({message,code:typeof j.code==="string"?j.code:undefined,provider:typeof j.provider==="string"?j.provider:undefined});
        notify(message, "warn");
        setMessages((current) => current.slice(0, -1));
        setQuestion(text);
        return;
      }
      requestRef.current=null;
      setProvider(j.provider==="anthropic+mws"?"anthropic+mws":j.provider==="mws"?"mws":"anthropic");
      setMessages((current) => [...current, { role: "assistant", text: j.answer, recommendation: j.mainRecommendation, food: j.food }]);
    } catch {
      const message=coachErrorMessage({code:"network"});
      setError({message,code:"network"});
      notify(message, "warn");
      setMessages((current) => current.slice(0, -1));
      setQuestion(text);
    } finally {
      sendingRef.current=false;
      setSending(false);
    }
  };

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendQuestion(question);
  };

  const saveFood = async (index: number, items: FoodItem[]) => {
    setSavingFood(index);
    const rawText = items.map(f => `${f.name} — ${f.calories} ккал (Б ${f.protein} / Ж ${f.fat} / У ${f.carbs})`).join("\n");
    try {
      const r = await fetch("/api/fitness", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "food", date: today, mealType: "Перекус", rawText }) });
      const j = await r.json();
      if (!r.ok) { notify(j.error || "Не удалось сохранить в дневник", "warn"); return }
      setMessages(current => current.map((m, i) => i === index ? { ...m, foodSaved: true } : m));
      notify("Добавлено в дневник питания", "good");
      onFoodSaved?.();
    } catch {
      notify("Не удалось сохранить в дневник", "warn");
    } finally {
      setSavingFood(null);
    }
  };

  return (
    <div className={`coach-chat-panel card${embedded?" coach-chat-embedded":""}`} role={embedded?"region":"dialog"} aria-label="Чат с VOLT Coach">
      <header className="coach-chat-head">
        <div><p className="eyebrow">VOLT COACH · AI HUB</p><small>{provider?`Последний ответ: ${provider==="anthropic+mws"?"Консилиум":provider==="mws"?"MWS GPT":"Anthropic"}`:hubSettings?.anthropicEnabled===false?"Anthropic отключён · Auto использует MWS":"Anthropic основной · MWS резервный"}</small></div>
        <div className="coach-chat-head-actions"><button type="button" aria-label="Настроить AI Hub" title="Настроить AI Hub" onClick={()=>setSettingsOpen(v=>!v)}>⚙</button>{embedded?<button type="button" className="coach-chat-close-embedded" aria-label="Закрыть AI Coach" onClick={onClose}>×</button>:<button type="button" aria-label="Закрыть чат" onClick={onClose}>×</button>}</div>
      </header>
      {settingsOpen&&<MwsSetup settings={hubSettings} onSaved={(next)=>{setHubSettings(next);setSettingsOpen(false);notify("MWS GPT подключён как резерв","good")}}/>}
      {suggestedQuestions.length>0&&<div className="coach-suggested-questions" role="group" aria-label="Популярные вопросы">
        <small>Популярные вопросы</small>
        {suggestedQuestions.map(text=><button key={text} type="button" disabled={sending} onClick={()=>sendQuestion(text)}>{text}<span aria-hidden="true">›</span></button>)}
      </div>}
      {quickActions.length>0&&<div className="coach-quick-actions" role="group" aria-label="Быстрые действия без ИИ">
        <small>Без ИИ, сразу:</small>
        {quickActions.map(a=><button key={a.label} type="button" onClick={a.onClick}>{a.icon&&<span aria-hidden="true">{a.icon} </span>}{a.label}</button>)}
      </div>}
      <div className="coach-provider-choice" role="group" aria-label="Выбор AI-модели">
        <button type="button" aria-pressed={providerChoice==="auto"} className={providerChoice==="auto"?"active":""} onClick={()=>setProviderChoice("auto")}>Авто</button>
        <button type="button" aria-pressed={providerChoice==="anthropic"} className={providerChoice==="anthropic"?"active":""} onClick={()=>setProviderChoice("anthropic")}>Anthropic</button>
        <button type="button" aria-pressed={providerChoice==="mws"} className={providerChoice==="mws"?"active":""} onClick={()=>setProviderChoice("mws")} disabled={hubSettings?.mwsKeySet===false}>MWS GPT</button>
        <button type="button" aria-pressed={providerChoice==="consensus"} className={providerChoice==="consensus"?"active":""} onClick={()=>setProviderChoice("consensus")} disabled={hubSettings?.mwsKeySet===false||hubSettings?.anthropicKeySet===false||hubSettings?.anthropicEnabled===false}>Консилиум</button>
      </div>
      <div className="coach-chat-list" ref={listRef}>
        {!loaded && <p className="coach-chat-empty">Загружаю историю…</p>}
        {loaded && messages.length === 0 && <p className="coach-chat-empty">Спроси что-нибудь про сегодняшний план, питание или прогресс.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`coach-chat-bubble ${m.role}`}>
            <p>{m.text}</p>
            {m.recommendation && <b className="coach-chat-recommendation">→ {m.recommendation}</b>}
            {m.food&&m.food.length>0&&(
              <div className="coach-chat-food">
                {m.food.map((f,fi)=><p key={fi}><span>{f.name}</span><b>{f.calories} ккал</b></p>)}
                <button type="button" disabled={m.foodSaved||savingFood===i} onClick={()=>saveFood(i,m.food!)}>
                  {m.foodSaved?"Добавлено ✓":savingFood===i?"Сохраняю…":"Добавить в дневник"}
                </button>
              </div>
            )}
          </div>
        ))}
        {sending && <div className="coach-chat-bubble assistant pending"><p>Думаю…</p></div>}
      </div>
      {error&&<div className="coach-chat-error" role="alert" id="coach-chat-error"><b>Ответ не получен</b><span>{error.message}</span>{error.code&&<small>Код: {error.code}{error.provider?` · ${error.provider}`:""}</small>}</div>}
      <form className="coach-chat-form" onSubmit={ask}>
        <input aria-label="Вопрос VOLT Coach" aria-describedby={error?"coach-chat-error":undefined} value={question} onChange={(e) => {setQuestion(e.target.value);if(requestRef.current?.text!==e.target.value.trim())requestRef.current=null}} onKeyDown={(e)=>{if(e.key==="Enter"){e.preventDefault();void sendQuestion(question)}}} placeholder="Например: сколько калорий осталось?" maxLength={1000} disabled={sending} />
        <button type="submit" disabled={!canSubmitCoachQuestion(question,sending)}>{sending?"Думаю…":"Спросить"}</button>
      </form>
    </div>
  );
}

function MwsSetup({settings,onSaved}:{settings:HubSettings|null;onSaved:(value:HubSettings)=>void}){
  const [key,setKey]=useState("");
  const [project,setProject]=useState(settings?.mwsProject||"project-avatar-aang5615");
  const [model,setModel]=useState(settings?.mwsModel||"qwen3-6-35b-a3b");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const save=async(e:React.FormEvent)=>{
    e.preventDefault();setError("");setBusy(true);
    const r=await fetch("/api/settings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"mws",mwsKey:key,mwsProject:project,mwsModel:model})});
    const j=await r.json().catch(()=>({}));setBusy(false);
    if(!r.ok)return setError(j.error||"Не удалось сохранить MWS");
    const fresh=await fetch("/api/settings",{cache:"no-store"}).then(x=>x.json());
    setKey("");onSaved(fresh);
  };
  return <form className="mws-setup" onSubmit={save}>
    <b>MWS GPT — резервный AI</b>
    <p>{settings?.anthropicEnabled===false?"Anthropic отключён на сервере. Auto отправляет запрос сразу в MWS.":"Anthropic остаётся основным. MWS получит запрос только при допустимом сбое Anthropic."}</p>
    <label>Проект<input value={project} onChange={e=>setProject(e.target.value.trim())}/></label>
    <label>Модель<input value={model} onChange={e=>setModel(e.target.value.trim())}/></label>
    <label>API-ключ<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value.trim())} placeholder={settings?.mwsKeySet?"Ключ сохранён — оставьте пустым, чтобы не менять":"Вставьте ключ MWS"}/></label>
    <small>Ключ сохраняется только в базе на вашем сервере и никогда не возвращается в браузер.</small>
    {error&&<span className="mws-setup-error">{error}</span>}
    <button disabled={busy}>{busy?"Сохраняю…":"Подключить MWS"}</button>
  </form>;
}
