export function WorkoutControls({
  canGoBack,
  canGoNext,
  onBack,
  onNext,
  onFinish,
  busy,
}: {
  canGoBack: boolean;
  canGoNext: boolean;
  onBack: () => void;
  onNext: () => void;
  onFinish: () => void;
  busy: boolean;
}) {
  return (
    <div className="swim-quick-actions" style={{ marginTop: 20 }}>
      <button type="button" className="swim-btn secondary" onClick={onBack} disabled={!canGoBack || busy}>
        Назад
      </button>
      {canGoNext ? (
        <button type="button" className="swim-btn primary" onClick={onNext} disabled={busy}>
          Далее
        </button>
      ) : null}
      <button type="button" className="swim-btn ghost" onClick={onFinish} disabled={busy}>
        Завершить тренировку
      </button>
    </div>
  );
}
