"use client";

import { useEffect, useId } from "react";
import { createPortal } from "react-dom";

export function WorkoutCancelDialog({
  open,
  busy,
  onClose,
  onConfirm,
}: {
  open: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="swim-plan-start-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <section className="swim-home-card swim-plan-start-dialog swim-cancel-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId}>
        <h2 id={titleId}>Отмена тренировки</h2>
        <p id={descriptionId}>Отменить эту тренировку? Результат не будет сохранён в истории.</p>
        <div className="swim-plan-start-actions">
          <button type="button" className="swim-plan-secondary-action" onClick={onClose} disabled={busy} autoFocus>Вернуться</button>
          <button type="button" className="swim-btn danger" onClick={onConfirm} disabled={busy}>
            {busy ? "Отменяем…" : "Отменить тренировку"}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
