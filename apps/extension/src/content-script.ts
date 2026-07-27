/**
 * Phase 0 prototype content script.
 *
 * GOAL: answer one question — can we reliably find and fill every field
 * Kleinanzeigen's "create listing" form requires, from our generated item
 * data? This is the single riskiest technical assumption in the whole
 * project (see docs/architecture.md) — validate it here, by hand, against
 * the real page, before building anything downstream of it (Phase 3).
 *
 * Explicitly NOT doing in this prototype:
 *   - auto-submitting the form (assisted only — human clicks publish)
 *   - handling every category-specific field variant (start with one
 *     category, e.g. furniture, and see how much the form shape changes
 *     across categories before generalizing)
 *   - error recovery / retry logic
 *
 * TODO once you're looking at the real page in devtools: replace these
 * placeholder selectors with the actual field selectors. They WILL change
 * over time without notice — that's the maintenance burden noted in
 * docs/architecture.md, not a bug in this prototype.
 */

interface PrefillData {
  title: string;
  description: string;
  price: number;
  category: string;
}

// TODO: replace with real selectors once inspecting the live form
const FIELD_SELECTORS = {
  title: "#postad-title",
  description: "#pstad-descrptn",
  price: "#pstad-price",
} as const;

function fillField(selector: string, value: string) {
  const el = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    selector
  );
  if (!el) {
    console.warn(`[estate-app] field not found: ${selector} — form markup may have changed`);
    return false;
  }
  el.value = value;
  // Dispatch input event so the page's own JS (React/whatever they use)
  // registers the change — a plain .value assignment is often silently
  // ignored by frameworks listening for 'input'.
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function prefillListing(data: PrefillData) {
  const results = {
    title: fillField(FIELD_SELECTORS.title, data.title),
    description: fillField(FIELD_SELECTORS.description, data.description),
    price: fillField(FIELD_SELECTORS.price, String(data.price)),
  };
  console.log("[estate-app] prefill results:", results);
  // Human reviews and clicks publish themselves — this script never
  // submits the form.
}

// Phase 0: trigger manually from the extension popup or devtools console
// with test data, e.g.:
//   prefillListing({ title: "IKEA Poäng Chair", description: "...", price: 45, category: "furniture" })
(window as any).__estateAppPrefillTest = prefillListing;
