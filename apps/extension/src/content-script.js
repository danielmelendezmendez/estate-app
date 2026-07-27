/**
 * Phase 0 prototype content script.
 *
 * GOAL: answer one question — can we reliably find and fill every field
 * Kleinanzeigen's "create listing" form requires, from our generated item
 * data? Validate here, by hand, against the real page, before building
 * anything downstream of it (Phase 3).
 *
 * TODO: replace these placeholder selectors with the real ones once
 * you've inspected the live form — see the chat for how.
 */

const FIELD_SELECTORS = {
  title: "#ad-title",
  description: "#ad-description",
  price: "#ad-price-amount",
};

function fillField(selector, value) {
  const el = document.querySelector(selector);
  if (!el) {
    console.warn(`[estate-app] field not found: ${selector} — form markup may have changed`);
    return false;
  }
  el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function prefillListing(data) {
  const results = {
    title: fillField(FIELD_SELECTORS.title, data.title),
    description: fillField(FIELD_SELECTORS.description, data.description),
    price: fillField(FIELD_SELECTORS.price, String(data.price)),
  };
  console.log("[estate-app] prefill results:", results);
}

// Trigger manually from the DevTools console with test data, e.g.:
//   __estateAppPrefillTest({ title: "IKEA Poäng Chair", description: "test", price: 45 })
window.__estateAppPrefillTest = prefillListing;