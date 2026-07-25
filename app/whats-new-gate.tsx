"use client";

import { useEffect, useState } from "react";
import { pendingReleases } from "./whats-new";

// Rejects elements pushed off-canvas horizontally (e.g. the mobile drawer sidebar,
// which stays display:flex but is translateX()'d away) without rejecting elements
// that are simply below the fold and still reachable by scrolling.
function isReachable(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < window.innerWidth;
}

function resolveVisibleTarget(selector: string): HTMLElement | null {
  const candidates = selector.split(",").map((s) => s.trim());
  for (const c of candidates) {
    const el = document.querySelector(c) as HTMLElement | null;
    if (el && el.offsetParent && isReachable(el)) return el;
  }
  return (document.querySelector(candidates[0]) as HTMLElement | null) || null;
}

export function WhatsNewGate({ seenVersion, onSeen }: { seenVersion: number; onSeen: (version: number) => void }) {
  const releases = pendingReleases(seenVersion);
  const release = releases[0];
  const [phase, setPhase] = useState<"summary" | "tour">("summary");
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (phase !== "tour" || !release) return;
    const step = release.highlights[stepIndex];
    if (!step) return;
    for (const selector of step.activate || []) resolveVisibleTarget(selector)?.click();
    let trackTimer = 0;
    const timer = window.setTimeout(() => {
      const el = resolveVisibleTarget(step.target);
      if (!el) { setRect(null); return; }
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const start = Date.now();
      const track = () => {
        setRect(el.getBoundingClientRect());
        if (Date.now() - start < 500) trackTimer = window.setTimeout(track, 50);
      };
      track();
    }, 80);
    return () => { window.clearTimeout(timer); window.clearTimeout(trackTimer); };
  }, [phase, stepIndex, release]);

  if (!release) return null;

  const finish = () => onSeen(release.version);
  const step = release.highlights[stepIndex];

  if (phase === "summary")
    return (
      <div className="modal-backdrop whats-new-backdrop">
        <div className="whats-new-card">
          <p className="eyebrow">ЧТО НОВОГО · {release.label}</p>
          <h2>Изменения за последние спринты</h2>
          <ul>
            {release.summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <div className="whats-new-actions">
            <button type="button" className="ghost-btn" onClick={finish}>Пропустить</button>
            <button type="button" className="whats-new-primary" onClick={() => setPhase("tour")}>Показать на странице</button>
          </div>
        </div>
      </div>
    );

  return (
    <>
      <div className="whats-new-tour-backdrop" />
      {rect && <div className="whats-new-ring" style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }} />}
      <div className="whats-new-tooltip" style={rect ? { top: Math.min(window.innerHeight - 170, rect.bottom + 14), left: Math.max(16, Math.min(window.innerWidth - 320, rect.left)) } : { top: "50%", left: "50%", transform: "translate(-50%,-50%)" }}>
        <small>{stepIndex + 1} из {release.highlights.length}</small>
        <b>{step.title}</b>
        <p>{step.text}</p>
        <div className="whats-new-actions">
          <button type="button" className="ghost-btn" onClick={finish}>Пропустить тур</button>
          <button type="button" className="whats-new-primary" onClick={() => (stepIndex + 1 < release.highlights.length ? setStepIndex((i) => i + 1) : finish())}>
            {stepIndex + 1 < release.highlights.length ? "Дальше" : "Готово"}
          </button>
        </div>
      </div>
    </>
  );
}
