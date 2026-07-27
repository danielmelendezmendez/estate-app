/**
 * Deep pass system prompt — runs only on items the triage pass flagged as
 * "high" or "medium" value tier, on Sonnet. Job: precise identification,
 * condition assessment, and listing copy. This is the expensive pass —
 * keep it scoped to items that earned it.
 *
 * v2 change: instead of asking generically "what's unclear", the prompt
 * now checks against a category-specific list of known price-differentiator
 * fields (CATEGORY_ATTRIBUTES in @estate-app/schema) — e.g. for
 * electronics: brand, size, panel type, age. This came from a real Phase 0
 * finding: a TV's price swings drastically on screen size + panel type
 * (45" LED vs 55" QLED), and a generic uncertainty sentence doesn't tell
 * the Review tab or the user WHICH fact to go get.
 *
 * Each unresolved field now comes back with a specific resolution: either
 * "take a photo of X" or "answer this question" — those are genuinely
 * different UI flows (Review tab photo request vs. manual-entry form), not
 * two phrasings of the same thing.
 *
 * v3 addition (below, buildTargetedDeepPassPrompt): a variant that can
 * point Sonnet at ONE specific item within a whole-room photo, ignoring
 * the rest — the fix for the "why did it only analyze the PC tower, not
 * the monitors" gap found during first real UI use. Uses the SAME
 * whole-room photo already captured, no image-cropping infrastructure
 * needed — just tells the model which item, by name, to focus on. This
 * is new/additive: nothing currently wired into the live app calls it
 * yet, so it's safe to ship without risk to the working demo. Real
 * integration (looping over triage items, calling this once per
 * above-threshold item, wiring results into the Review UI) is Phase 2
 * work — see docs/architecture.md "Review tab v2."
 */

import { CATEGORY_ATTRIBUTES } from "@estate-app/schema";

/**
 * Builds the deep-pass system prompt for a specific category, injecting
 * that category's known price-differentiator fields so the model checks
 * against a concrete list instead of guessing generically.
 *
 * Falls back to a generic prompt (no field list) if the category isn't in
 * CATEGORY_ATTRIBUTES yet — that's a signal to add it, not a crash.
 */
export function buildDeepPassPrompt(category: string): string {
  const fields = CATEGORY_ATTRIBUTES[category];

  const fieldChecklist = fields
    ? `For this category (${category}), specifically check for these known price-differentiator fields:\n\n${fields
        .map(
          (f) =>
            `- ${f.field} (price impact: ${f.priceImpact}) — ${f.hint || "no specific hint"}. Default resolution if unclear: ${f.defaultResolution}.`
        )
        .join("\n")}\n\nFor each of these fields you cannot confidently determine from the photo(s) provided, include it in unresolvedAttributes with the specific reason and how to resolve it (a specific photo angle, or a direct yes/no or short-answer question for the user).`
    : `No predefined field checklist exists yet for category "${category}" — use judgment to identify what's unclear about brand, materials, age, condition, and anything else that would meaningfully change resale value, and include each in unresolvedAttributes.`;

  return `You are assessing a single item from a household clearance for resale, using one or more photos.

Identify:
- brand and model, if determinable from what's visible
- category and subcategory
- condition (new / like-new / good / fair / poor), with a one-line reason
- confidence in this identification overall: "high" | "medium" | "low"

${fieldChecklist}

Do not guess a specific value for an unresolved field and present it as fact
— e.g. if screen size isn't confirmed, don't silently assume 55" in your
price estimate. Instead, price using the full plausible range given the
uncertainty, and let the unresolved field list explain why the range is wide.

Then produce a second-hand resale value range (low/high, not a single
number) appropriate for the DACH market and the specified marketplace.

Finally, draft:
- a listing title
- a short listing description
- a suggested asking price within the value range

Respond only in the requested structured format, no preamble.`;
}

// Kept for reference/backwards compatibility with anything still importing
// the old constant name — prefer buildDeepPassPrompt(category) going forward.
export const DEEP_PASS_SYSTEM_PROMPT = buildDeepPassPrompt("electronics");

export interface DeepPassUnresolvedAttribute {
  field: string;
  reason: string;
  resolution:
    | { type: "photo"; angleHint: string }
    | { type: "question"; prompt: string };
}

export interface DeepPassResult {
  brand?: string;
  model?: string;
  category: string;
  subcategory?: string;
  condition: "new" | "like-new" | "good" | "fair" | "poor";
  conditionReason: string;
  confidence: "high" | "medium" | "low";
  unresolvedAttributes: DeepPassUnresolvedAttribute[];
  valueRangeLow: number;
  valueRangeHigh: number;
  listingTitle: string;
  listingDescription: string;
  suggestedPrice: number;
}

/**
 * Targeted variant of buildDeepPassPrompt — points Sonnet at ONE specific
 * item within a photo that may contain several, instead of assuming the
 * photo already shows a single item. Reuses the same category-specific
 * field checklist logic as buildDeepPassPrompt.
 *
 * @param category - matches CATEGORY_ATTRIBUTES keys, same as buildDeepPassPrompt
 * @param targetItemDescription - the exact item name/description triage
 *   already produced for this item (e.g. "Second monitor, grey, upper
 *   left of desk") — reusing triage's own wording, not re-describing it,
 *   keeps the two passes talking about the same thing unambiguously.
 */
export function buildTargetedDeepPassPrompt(
  category: string,
  targetItemDescription: string
): string {
  const basePrompt = buildDeepPassPrompt(category);

  return `${basePrompt}

IMPORTANT — this photo may show MULTIPLE items. You are assessing ONLY
the following specific item, identified during an earlier triage pass:

  "${targetItemDescription}"

Ignore every other item visible in this photo, even if some are more
visually prominent. If you cannot clearly locate the described item in
the photo, say so explicitly in your condition assessment rather than
guessing at a different item instead.`;
}

/**
 * Batched variant of the deep-pass prompt — analyzes ALL given items from
 * one photo in a single call, instead of one call per item. Chosen as the
 * cost-efficient default: pays image-token cost once regardless of item
 * count, and cross-item context (this monitor vs. that monitor) may
 * actually help disambiguation rather than hurt it. See
 * docs/architecture.md for the full pros/cons against per-item repeat
 * calls and real image cropping.
 */
export function buildBatchedDeepPassPrompt(
  items: { itemName: string; category: string }[]
): string {
  const itemsList = items
    .map((item, i) => {
      const fields = CATEGORY_ATTRIBUTES[item.category];
      const checklist = fields
        ? fields
            .map((f) => `${f.field} (${f.priceImpact} impact, default resolution: ${f.defaultResolution})`)
            .join(", ")
        : "no predefined checklist for this category — use judgment";
      return `${i + 1}. "${item.itemName}" — category: ${item.category}\n   Check for: ${checklist}`;
    })
    .join("\n\n");

  return `You are assessing MULTIPLE distinct items from ONE photo, taken during a household clearance. Each item below was already identified in an earlier triage pass — use those exact names to keep results correlated correctly.

Items to assess:

${itemsList}

For EACH item above, provide a full assessment: brand/model if determinable, category/subcategory, condition (new/like-new/good/fair/poor) with a one-line reason, and overall confidence.

Critical: these are DIFFERENT items in the SAME photo. Do not blend
details from one item into another — if two items look visually similar
(e.g. two monitors), use their described position/size/color to tell
them apart, and say so explicitly if you genuinely cannot distinguish
which is which for a given field.

For each item, check specifically against the field checklist given for
its category above. Do not guess a specific value for an unresolved field
and present it as fact — price using the full plausible range given the
uncertainty, and list the field in unresolvedAttributes with a specific
resolution: either a photo (state exactly where/what to photograph) or a
question (state the exact question to ask).

For each item, also draft a listing title, a short listing description,
and a suggested asking price within its value range, appropriate for the
DACH market.

Respond only in the requested structured format, no preamble. Return
exactly one result per item listed above, in the same order, with
itemName matching exactly.`;
}
