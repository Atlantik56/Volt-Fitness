"use client";

// Sprint 6.11 — компактная панель чата с VOLT Coach.
// Не отдельный полноэкранный чат: узкая панель поверх текущего экрана.
// Использует уже существующий /api/coach-chat (Sprint 6.8) и его персистентную
// историю (lib/db.ts coach_conversation). ИИ здесь только отвечает на вопросы —
// решение дня (CoachDecision) не пересчитывает и не переопределяет.

import { useEffect, useRef, useState } from "react";
import { useToast } from "./toast";

type ChatMessage = { role: "user" | "assistant"; text: string; recommendation?: string | null };

export function CoachChatPanel({ open, onClose, plan, today }: { open: boolean; onClose: () => void; plan: { title: string; type: string } | null; today: string }) {
  const notify = useToast();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [question, setQuestion] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || loaded) return;
    fetch("/api/coach-chat", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setMessages(Array.isArray(j.messages) ? j.messages : []))
      .catch(() => {})
      .finally(() => setLoaded(true));
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
        body: JSON.stringify({ date: today, plan, question: text }),
      });
      const j = await r.json();
      if (!r.ok) {
        notify(j.error || "Не удалось получить ответ тренера", "warn");
        setMessages((current) => current.slice(0, -1));
        setQuestion(text);
        return;
      }
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
        <div><p className="eyebrow">VOLT COACH · ЧАТ</p><small>Отвечает на основе твоих сохранённых данных</small></div>
        <button type="button" aria-label="Закрыть чат" onClick={onClose}>×</button>
      </header>
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
