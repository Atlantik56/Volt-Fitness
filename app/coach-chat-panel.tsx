"use client";

// Sprint 6.11 — компактная панель чата с VOLT Coach.
// Не отдельный полноэкранный чат: узкая панель поверх текущего экрана.
// Использует уже существующий /api/coach-chat (Sprint 6.8) и его персистентную
// историю (lib/db.ts coach_conversation). ИИ здесь только отвечает на вопросы —
// решение дня (CoachDecision) не пересчитывает и не переопределяет.

import { useEffect, useRef, useState } from "react";
import { useToast } from "./toast";

type ChatMessage = { role: "user" | "assistant"; text: string; recommendation?: string | null };
type HubSettings={anthropicKeySet:boolean;mwsKeySet:boolean;mwsProject:string;mwsModel:string};

export function CoachChatPanel({ open, onClose, plan, today }: { open: boolean; onClose: () => void; plan: { title: string; type: string } | null; today: string }) {
  const notify = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const [provider,setProvider]=useState<"anthropic"|"mws"|"anthropic+mws"|null>(null);
  const [providerChoice,setProviderChoice]=useState<"auto"|"anthropic"|"mws"|"consensus">("auto");
  const [hubSettings,setHubSettings]=useState<HubSettings|null>(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/coach-chat", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setMessages(Array.isArray(j.messages) ? j.messages : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
    fetch("/api/settings",{cache:"no-store"}).then(r=>r.json()).then(setHubSettings).catch(()=>{});
  }, [open, loaded]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  if (!open) return null;

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = question.trim();
    if (!text || sending) return;
    setQuestion("");
    setMessages((current) => [...current, { role: "user", text }]);
    setSending(true);
    try {
      const r = await fetch("/api/coach-chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date: today, plan, question: text,provider:providerChoice }),
      });
      const j = await r.json();
      if (!r.ok) {
        notify(j.error || "Не удалось получить ответ тренера", "warn");
        setMessages((current) => current.slice(0, -1));
        setQuestion(text);
        return;
      }
      setProvider(j.provider==="anthropic+mws"?"anthropic+mws":j.provider==="mws"?"mws":"anthropic");
      setMessages((current) => [...current, { role: "assistant", text: j.answer, recommendation: j.mainRecommendation }]);
    } catch {
      notify("Тренер не ответил — проверьте соединение", "warn");
      setMessages((current) => current.slice(0, -1));
      setQuestion(text);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="coach-chat-panel card" role="dialog" aria-label="Чат с VOLT Coach">
      <header className="coach-chat-head">
        <div><p className="eyebrow">VOLT COACH · AI HUB</p><small>{provider?`Последний ответ: ${provider==="anthropic+mws"?"Консилиум":provider==="mws"?"MWS GPT":"Anthropic"}`:"Anthropic основной · MWS резервный"}</small></div>
        <div className="coach-chat-head-actions"><button type="button" aria-label="Настроить AI Hub" title="Настроить AI Hub" onClick={()=>setSettingsOpen(v=>!v)}>⚙</button><button type="button" aria-label="Закрыть чат" onClick={onClose}>×</button></div>
      </header>
      {settingsOpen&&<MwsSetup settings={hubSettings} onSaved={(next)=>{setHubSettings(next);setSettingsOpen(false);notify("MWS GPT подключён как резерв","good")}}/>}
      <div className="coach-provider-choice" role="group" aria-label="Выбор AI-модели">
        <button type="button" className={providerChoice==="auto"?"active":""} onClick={()=>setProviderChoice("auto")}>Авто</button>
        <button type="button" className={providerChoice==="anthropic"?"active":""} onClick={()=>setProviderChoice("anthropic")}>Anthropic</button>
        <button type="button" className={providerChoice==="mws"?"active":""} onClick={()=>setProviderChoice("mws")} disabled={hubSettings?.mwsKeySet===false}>MWS GPT</button>
        <button type="button" className={providerChoice==="consensus"?"active":""} onClick={()=>setProviderChoice("consensus")} disabled={hubSettings?.mwsKeySet===false||hubSettings?.anthropicKeySet===false}>Консилиум</button>
      </div>
      <div className="coach-chat-list" ref={listRef}>
        {!loaded && <p className="coach-chat-empty">Загружаю историю…</p>}
        {loaded && messages.length === 0 && <p className="coach-chat-empty">Спроси что-нибудь про сегодняшний план, питание или прогресс.</p>}
        {messages.map((m, i) => (
          <div key={i} className={`coach-chat-bubble ${m.role}`}>
            <p>{m.text}</p>
            {m.recommendation && <b className="coach-chat-recommendation">→ {m.recommendation}</b>}
          </div>
        ))}
        {sending && <div className="coach-chat-bubble assistant pending"><p>Думаю…</p></div>}
      </div>
      <form className="coach-chat-form" onSubmit={ask}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Например: сколько калорий осталось?" maxLength={1000} disabled={sending} />
        <button type="submit" disabled={sending || !question.trim()}>Спросить</button>
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
    <p>Anthropic остаётся основным. MWS получит запрос только при сбое Anthropic.</p>
    <label>Проект<input value={project} onChange={e=>setProject(e.target.value.trim())}/></label>
    <label>Модель<input value={model} onChange={e=>setModel(e.target.value.trim())}/></label>
    <label>API-ключ<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value.trim())} placeholder={settings?.mwsKeySet?"Ключ сохранён — оставьте пустым, чтобы не менять":"Вставьте ключ MWS"}/></label>
    <small>Ключ сохраняется только в базе на вашем сервере и никогда не возвращается в браузер.</small>
    {error&&<span className="mws-setup-error">{error}</span>}
    <button disabled={busy}>{busy?"Сохраняю…":"Подключить MWS"}</button>
  </form>;
}
