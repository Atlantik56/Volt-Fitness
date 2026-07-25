"use client";

// Единая стилизованная под приложение нотификация для любого действия,
// которое отправляет данные на сервер (сохранение/удаление/обновление).
// Подключается один раз в корневом layout — дальше вызывается через useToast().

import { createContext, useCallback, useContext, useRef, useState } from "react";

export type ToastTone = "good" | "warn" | "info";
type ToastItem = { id: number; tone: ToastTone; text: string };

const TONE_ICON: Record<ToastTone, string> = { good: "✓", warn: "⚠", info: "◆" };
const AUTO_DISMISS_MS = 3200;

const ToastContext = createContext<((text: string, tone?: ToastTone) => void) | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const notify = useCallback((text: string, tone: ToastTone = "good") => {
    const id = ++nextId.current;
    setItems((current) => [...current, { id, tone, text }]);
    window.setTimeout(() => setItems((current) => current.filter((x) => x.id !== id)), AUTO_DISMISS_MS);
  }, []);

  const dismiss = useCallback((id: number) => setItems((current) => current.filter((x) => x.id !== id)), []);

  return (
    <ToastContext.Provider value={notify}>
      {children}
      <div className="toast-stack" aria-live="polite" role="status">
        {items.map((item) => (
          <div key={item.id} className={`toast-item ${item.tone}`} onClick={() => dismiss(item.id)}>
            <span className="toast-icon" aria-hidden="true">{TONE_ICON[item.tone]}</span>
            <span>{item.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Вне ToastProvider (не должно случаться в этом приложении) тихо не делает ничего,
// а не бросает исключение — так проще безопасно вызывать из любого места.
export function useToast() {
  const notify = useContext(ToastContext);
  return notify ?? (() => {});
}
