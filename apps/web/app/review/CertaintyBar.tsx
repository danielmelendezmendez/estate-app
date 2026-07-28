type Confidence = "high" | "medium" | "low";

const CONFIG: Record<
  Confidence,
  { segments: number; color: string; bg: string; label: string }
> = {
  high: {
    segments: 3,
    color: "bg-confidence-high",
    bg: "bg-confidence-high-bg",
    label: "High confidence",
  },
  medium: {
    segments: 2,
    color: "bg-confidence-medium",
    bg: "bg-confidence-medium-bg",
    label: "Medium confidence",
  },
  low: {
    segments: 1,
    color: "bg-confidence-low",
    bg: "bg-confidence-low-bg",
    label: "Low confidence",
  },
};

/**
 * Signature UI element: shows AI certainty as a filled segment count, not
 * a percentage or a colored dot. The point of this app is calibrated
 * confidence, not just identification — this makes that visible at a
 * glance, and reads clearly even without color (segment count carries
 * the meaning too, not color alone).
 *
 * v2: given a pill/badge treatment (rounded-full, soft background) to
 * match the more considered visual language — this is the one element
 * allowed to carry real visual weight, per "spend your boldness in one
 * place." Everything else around it stays quiet.
 */
export function CertaintyBar({ confidence }: { confidence: Confidence }) {
  const { segments, color, bg, label } = CONFIG[confidence];
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full ${bg} px-2.5 py-1`}
      role="img"
      aria-label={label}
    >
      <div className="flex gap-[3px]">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`h-[7px] w-[7px] rounded-full ${
              i < segments ? color : "bg-ink/15"
            }`}
          />
        ))}
      </div>
      <span className="font-mono text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        {label}
      </span>
    </div>
  );
}
