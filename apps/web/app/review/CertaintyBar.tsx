type Confidence = "high" | "medium" | "low";

const CONFIG: Record<
  Confidence,
  { segments: number; color: string; label: string }
> = {
  high: { segments: 3, color: "bg-confidence-high", label: "High confidence" },
  medium: {
    segments: 2,
    color: "bg-confidence-medium",
    label: "Medium confidence",
  },
  low: { segments: 1, color: "bg-confidence-low", label: "Low confidence" },
};

/**
 * Signature UI element: shows AI certainty as a filled segment count, not a
 * percentage or a colored dot. The point of this app is calibrated
 * confidence, not just identification — this makes that visible at a
 * glance, and reads clearly even without color (segment count carries
 * the meaning too, not color alone).
 */
export function CertaintyBar({ confidence }: { confidence: Confidence }) {
  const { segments, color, label } = CONFIG[confidence];
  return (
    <div className="flex items-center gap-2" role="img" aria-label={label}>
      <div className="flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-[6px] w-[14px] rounded-[1px] ${
              i < segments ? color : "bg-ink/10"
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-[11px] uppercase tracking-wide text-ink-muted">
        {label}
      </span>
    </div>
  );
}
