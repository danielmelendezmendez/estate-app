"use client";

import { useState } from "react";
import { CertaintyBar } from "./CertaintyBar";
import { PublishButton } from "./PublishButton";
import { AlertTriangle, Camera, HelpCircle, RefreshCw, Sparkles } from "lucide-react";

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
  resultId: number; // the deep_pass_results row id, needed to persist publish status
  published: boolean;
  ebayListingUrl: string | null;
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
  onPublished?: () => void;
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
  const [justRecalculated, setJustRecalculated] = useState(false);

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
      setJustRecalculated(true);
      setTimeout(() => setJustRecalculated(false), 2500);
    } catch (err: any) {
      setRecalcError(err.message);
      setRecalcStatus("error");
    }
  }

  return (
    <div className="rounded-2xl border border-ink/5 bg-surface p-5 shadow-card transition hover:shadow-card-hover">
      {props.thumbnailUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={props.thumbnailUrl}
          alt={props.filename}
          className="mb-4 h-40 w-full rounded-xl object-cover"
        />
      )}
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-base font-semibold text-ink">{props.listingTitle}</p>
        <CertaintyBar confidence={confidence} />
      </div>
      <p className="mt-1 text-xs text-ink-muted">
        {props.itemName} · {props.category}
        {props.subcategory ? ` (${props.subcategory})` : ""}
      </p>

      <div className="mt-3 flex items-center gap-2">
        <p className="font-mono text-lg font-semibold text-ink">
          €{range.low}–€{range.high}
        </p>
        {justRecalculated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-medium text-accent">
            <Sparkles className="h-3 w-3" /> Updated
          </span>
        )}
      </div>
      {isHighStakes && (
        <p className="mt-1.5 flex items-start gap-1.5 text-xs text-confidence-medium">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          This range is wide — confirming a detail below could change the price a lot.
        </p>
      )}

      {/* Editable unresolved fields */}
      {unresolved.length > 0 && (
        <div className="mt-4 space-y-3 rounded-xl bg-canvas p-3">
          {unresolved.map((u) => (
            <div key={u.field}>
              <label className="flex items-center gap-1.5 text-xs font-medium text-ink">
                {u.resolution.type === "photo" ? (
                  <Camera className="h-3.5 w-3.5 text-ink-muted" />
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-ink-muted" />
                )}
                {u.field}
                <span className="font-normal text-ink-muted">— {u.reason}</span>
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
                className="mt-1.5 w-full rounded-lg border border-ink/10 bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/60 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          ))}
          <button
            onClick={handleRecalculate}
            disabled={!hasChanges || recalcStatus === "loading"}
            className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-surface px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-accent-soft disabled:cursor-not-allowed disabled:border-ink/10 disabled:text-ink-muted disabled:hover:bg-surface"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${recalcStatus === "loading" ? "animate-spin" : ""}`} />
            {recalcStatus === "loading" ? "Recalculating..." : "Recalculate estimate"}
          </button>
          {recalcStatus === "error" && (
            <div>
              <p className="text-xs text-confidence-low">{recalcError}</p>
              {recalcDetail ? (
                <pre className="mt-1 max-w-lg overflow-x-auto rounded-lg bg-ink/5 p-2 text-[10px] text-ink-muted">
                  {JSON.stringify(recalcDetail, null, 2)}
                </pre>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Editable price — always present, always overridable, no cap */}
      <div className="mt-4">
        <label className="text-xs font-medium text-ink-muted">Asking price</label>
        <div className="mt-1 flex items-center gap-1 rounded-lg border border-ink/10 bg-canvas px-3 py-2 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent">
          <span className="font-mono text-sm text-ink-muted">€</span>
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(Number(e.target.value))}
            className="w-24 bg-transparent font-mono text-sm text-ink focus:outline-none"
          />
        </div>
      </div>

      <PublishButton
        sku={`estate-app-${props.itemKey}`}
        title={props.listingTitle}
        description={props.listingDescription || `${props.condition} condition.`}
        price={price}
        categoryQuery={props.subcategory || props.category}
        condition={props.condition}
        deepPassResultId={props.resultId}
        onPublished={props.onPublished}
        alreadyPublished={props.published}
        publishedUrl={props.ebayListingUrl}
      />
    </div>
  );
}
