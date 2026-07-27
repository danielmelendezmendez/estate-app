"use client";

import { useState } from "react";
import { CertaintyBar } from "./CertaintyBar";
import { PublishButton } from "./PublishButton";

type Confidence = "high" | "medium" | "low";

interface UnresolvedAttribute {
  field: string;
  reason: string;
  resolution:
    | { type: "photo"; angleHint: string }
    | { type: "question"; prompt: string };
}

export interface DeepDiveCardProps {
  photoId: number;
  itemKey: string; // unique per item, used for SKU
  itemName: string;
  filename: string;
  thumbnailUrl: string | null;
  category: string;
  subcategory: string | null;
  condition: string;
  confidence: Confidence;
  unresolvedAttributes: UnresolvedAttribute[];
  valueRangeLow: number;
  valueRangeHigh: number;
  listingTitle: string;
  listingDescription: string;
  suggestedPrice: number;
}

// Threshold for the "this range is wide, worth a closer look" visibility
// note — non-blocking, per the corrected confidence-gating decision in
// docs/architecture.md (visibility, not friction; publish never gated).
const HIGH_STAKES_THRESHOLD = 300;

export function DeepDiveCard(props: DeepDiveCardProps) {
  const [unresolved, setUnresolved] = useState(props.unresolvedAttributes);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [range, setRange] = useState({ low: props.valueRangeLow, high: props.valueRangeHigh });
  const [price, setPrice] = useState(props.suggestedPrice);
  const [confidence, setConfidence] = useState<Confidence>(props.confidence);
  const [recalcStatus, setRecalcStatus] = useState<"idle" | "loading" | "error">("idle");
  const [recalcError, setRecalcError] = useState("");
  const [recalcDetail, setRecalcDetail] = useState<unknown>(null);

  const hasChanges = Object.values(fieldValues).some((v) => v.trim() !== "");
  const isHighStakes = confidence !== "high" && range.high >= HIGH_STAKES_THRESHOLD;

  async function handleRecalculate() {
    const confirmedFields = Object.fromEntries(
      Object.entries(fieldValues).filter(([, v]) => v.trim() !== "")
    );
    if (Object.keys(confirmedFields).length === 0) return;

    setRecalcStatus("loading");
    setRecalcError("");
    setRecalcDetail(null);
    try {
      const res = await fetch("/api/recalculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: props.category,
          subcategory: props.subcategory,
          condition: props.condition,
          currentValueRangeLow: range.low,
          currentValueRangeHigh: range.high,
          previouslyUnresolved: unresolved,
          confirmedFields,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRecalcError(data.error ?? "Recalculate failed.");
        setRecalcDetail(data.detail);
        setRecalcStatus("error");
        return;
      }

      setRange({ low: data.valueRangeLow, high: data.valueRangeHigh });
      setPrice(data.suggestedPrice);
      setConfidence(data.confidence);
      setUnresolved(data.unresolvedAttributes ?? []);
      setFieldValues({});
      setRecalcStatus("idle");
    } catch (err: any) {
      setRecalcError(err.message);
      setRecalcStatus("error");
    }
  }

  return (
    <div className="rounded-md border border-ink/10 bg-surface px-5 py-4">
      {props.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.thumbnailUrl}
          alt={props.filename}
          className="mb-3 h-40 w-full rounded object-cover"
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <p className="font-body font-medium text-ink">{props.listingTitle}</p>
        <CertaintyBar confidence={confidence} />
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {props.itemName} · {props.filename} · {props.category}
        {props.subcategory ? ` (${props.subcategory})` : ""}
      </p>

      <p className="mt-3 font-mono text-sm text-ink">
        €{range.low}–€{range.high}
      </p>
      {isHighStakes && (
        <p className="mt-1 text-xs text-confidence-medium">
          This range is wide — confirming a detail below could change the price a lot.
        </p>
      )}

      {/* Editable unresolved fields */}
      {unresolved.length > 0 && (
        <div className="mt-3 space-y-2">
          {unresolved.map((u) => (
            <div key={u.field}>
              <label className="text-xs font-medium text-confidence-low">
                {u.field}
                <span className="ml-1 font-normal text-ink-muted">— {u.reason}</span>
              </label>
              <input
                type="text"
                value={fieldValues[u.field] ?? ""}
                onChange={(e) =>
                  setFieldValues((prev) => ({ ...prev, [u.field]: e.target.value }))
                }
                placeholder={
                  u.resolution.type === "question" ? u.resolution.prompt : u.resolution.angleHint
                }
                className="mt-1 w-full rounded border border-ink/20 bg-stone px-2 py-1 text-sm text-ink placeholder:text-ink-muted/60"
              />
            </div>
          ))}
          <button
            onClick={handleRecalculate}
            disabled={!hasChanges || recalcStatus === "loading"}
            className="rounded-md border border-ink/20 px-3 py-1.5 text-xs font-medium text-ink transition disabled:cursor-not-allowed disabled:opacity-40"
          >
            {recalcStatus === "loading" ? "Recalculating..." : "Recalculate estimate"}
          </button>
          {recalcStatus === "error" && (
            <div>
              <p className="text-xs text-confidence-low">{recalcError}</p>
              {recalcDetail ? (
                <pre className="mt-1 max-w-lg overflow-x-auto rounded bg-ink/5 p-2 text-[10px] text-ink-muted">
                  {JSON.stringify(recalcDetail, null, 2)}
                </pre>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Editable price — always present, always overridable, no cap */}
      <div className="mt-4">
        <label className="text-xs font-medium text-ink-muted">Asking price (€)</label>
        <input
          type="number"
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="mt-1 w-32 rounded border border-ink/20 bg-stone px-2 py-1 font-mono text-sm text-ink"
        />
      </div>

      <PublishButton
        sku={`estate-app-${props.itemKey}`}
        title={props.listingTitle}
        description={props.listingDescription || `${props.condition} condition.`}
        price={price}
        categoryQuery={props.subcategory || props.category}
        condition={props.condition}
      />
    </div>
  );
}
