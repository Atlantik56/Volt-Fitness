export type StatusBadgeTone = "neutral" | "success" | "warning" | "error" | "synced";

// Статус всегда передан текстом, а не только цветом/иконкой (VOLT_SWIM.md §Accessibility).
export function StatusBadge({ tone = "neutral", children }: { tone?: StatusBadgeTone; children: React.ReactNode }) {
  return <span className={`swim-badge ${tone !== "neutral" ? tone : ""}`.trim()}>{children}</span>;
}
