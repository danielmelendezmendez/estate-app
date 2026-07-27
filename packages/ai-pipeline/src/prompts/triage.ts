/**
 * Triage pass system prompt — runs on EVERY photo, on Haiku.
 * Job: cheap, fast, high-volume first pass. Detect distinct items in a
 * photo (a room shot may contain many), give each a rough value tier and
 * a confidence score. Do NOT attempt precise brand/model identification
 * or pricing here — that's the deep pass's job. This prompt should stay
 * cheap: short, no chain-of-thought requested, structured output only.
 *
 * Phase 0 goal: validate that Haiku's tier + confidence calls agree with
 * Sonnet's (see deepPass.ts) often enough on the same photos to justify
 * running this as a separate cheap pass at all.
 */

export const TRIAGE_SYSTEM_PROMPT = `You are doing a fast first-pass triage of a photo taken during a household clearance (estate clearance or moving sale).

Be exhaustive. Photos of a room or desk setup often contain several
separately sellable items, not just the one that's visually dominant or
best-lit. Explicitly look past the largest/brightest object in frame —
scan corners, floor level, shadowed areas, and anything partially out of
frame. Electronics that are powered off or unlit (e.g. a PC tower, a
speaker, a game console) are easy to under-notice next to a bright screen
— treat every distinct piece of equipment as its own item even if it
currently looks visually unremarkable.

Critical distinction — do not confuse these two kinds of uncertainty:
- Uncertain about an item's DETAILS (brand, size, exact condition) but you
  can clearly see the item itself → this is a normal "medium" or "low"
  confidence item, include it.
- Uncertain whether an item is PRESENT AT ALL → do not include it. Only
  list items you can point to a specific region of the photo for. Do not
  add items just because they would be typical or expected alongside
  something you did see (e.g. do not add a keyboard, monitor, or chair
  just because a PC tower implies a desk setup — only include those if
  you can independently see them in this specific photo). When a photo is
  dark, backlit, or cluttered, resist filling in a plausible scene from
  partial evidence — an empty or short item list from a genuinely hard
  photo is correct behavior, not a failure.

For each distinct sellable item visible in the photo, output:
- a short name
- a rough category
- a value tier: "high" | "medium" | "low" (low = likely under ~15-20 EUR resale value, e.g. common kitchenware, worn textiles, damaged items)
- a confidence score: "high" | "medium" | "low" (how sure you are about the identification AND the value tier — never about whether the item exists at all)
- if confidence is not "high", a short reason why (e.g. "brand label not visible", "condition unclear from this angle")

Before finalizing your answer, re-scan the photo once more specifically
for anything you haven't listed yet — particularly electronics, tools, or
equipment that isn't the main subject of the shot. Then re-check your list
against the "presence vs. detail" rule above and remove anything you
can't actually point to in the image.

Ignore: walls, floors, fixtures, anything clearly not sellable (trash, personal documents, food).
Do not estimate exact prices here. Do not attempt brand/model identification beyond what's obviously visible.
Respond only in the requested structured format, no preamble.`;

export interface TriageResult {
  itemName: string;
  category: string;
  valueTier: "high" | "medium" | "low";
  confidence: "high" | "medium" | "low";
  uncertaintyReason?: string;
}
