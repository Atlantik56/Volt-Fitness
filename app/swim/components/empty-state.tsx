import { GlassPanel } from "./glass-panel";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) {
  return (
    <GlassPanel className="swim-empty">
      <h4>{title}</h4>
      <p>{description}</p>
      {action}
    </GlassPanel>
  );
}
