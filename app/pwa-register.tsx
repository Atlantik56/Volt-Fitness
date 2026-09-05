"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type PwaState = { ready: boolean; installed: boolean; busy: boolean; message: string; install: () => Promise<void> };
const PwaContext = createContext<PwaState | null>(null);

export default function PwaRegister({ children }: { children: ReactNode }) {
  const pending = useRef<InstallEvent | null>(null);
  const [ready, setReady] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const mode = window.matchMedia("(display-mode: standalone)");
    const syncMode = () => setInstalled(mode.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    syncMode();
    const onPrompt = (event: Event) => {
      event.preventDefault(); pending.current = event as InstallEvent;
      setReady(true); setMessage("");
    };
    const onInstalled = () => { pending.current = null; setReady(false); setInstalled(true); setMessage("Приложение установлено."); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    mode.addEventListener("change", syncMode);
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch(() => {
        setMessage("Не удалось подготовить приложение. Проверьте интернет и обновите страницу.");
      });
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      mode.removeEventListener("change", syncMode);
    };
  }, []);
  const install = async () => {
    const event = pending.current;
    if (!event || busy) return;
    pending.current = null; setReady(false); setBusy(true);
    try {
      await event.prompt();
      const { outcome } = await event.userChoice;
      setMessage(outcome === "accepted" ? "Запрос принят Chrome. Дождитесь завершения установки." : "Установка отменена. Её можно повторить через меню браузера.");
    } catch { setMessage("Chrome не смог открыть установку. Обновите страницу и попробуйте ещё раз."); }
    finally { setBusy(false); }
  };
  return <PwaContext.Provider value={{ ready, installed, busy, message, install }}>
    {children}
    {ready && !installed && !hidden && <aside className="pwa-promotion" aria-label="Установка RITMOVIS">
      <div><b>RITMOVIS на вашем телефоне</b><p>Открывайте приложение с главного экрана.</p></div>
      <button type="button" onClick={install}>Установить</button>
      <button type="button" className="pwa-dismiss" onClick={() => setHidden(true)} aria-label="Закрыть предложение установки">×</button>
    </aside>}
  </PwaContext.Provider>;
}

export function PwaInstall() {
  const pwa = useContext(PwaContext);
  if (!pwa) return null;
  return <div className="pwa-install">
    <b>Приложение RITMOVIS</b>
    {pwa.installed ? <p role="status">Приложение установлено.</p> : <>
      <p>Велосипед, бассейн и силовые — с главного экрана телефона.</p>
      {pwa.ready ? <button type="button" onClick={pwa.install}>Установить RITMOVIS</button> : <p>{pwa.busy ? "Ожидаем ответ Chrome…" : "Браузер пока не предложил установку приложения."}</p>}
      <details><summary>Как установить</summary><p>Android: откройте этот сайт в обычной вкладке Chrome по HTTPS. В меню ⋮ выберите «Добавить на главный экран», затем «Установить». Если доступно только создание ярлыка, установка приложения сейчас не предложена браузером.</p><p>iPhone: в Safari выберите «Поделиться» → «На экран Домой».</p></details>
    </>}
    {pwa.message && <p role="status">{pwa.message}</p>}
  </div>;
}
