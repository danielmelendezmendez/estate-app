/**
 * Shared types used across the AI pipeline, extension, and (eventually)
 * web/mobile clients. Keep this package dependency-free — it's the
 * contract, not the implementation.
 *
 * Consolidated after the Phase 0 design session — see docs/architecture.md
 * for the reasoning behind each of these. Two entities now exist where
 * there used to be one:
 *   - IdentifiedItem: the AI's per-item analysis (unchanged in spirit)
 *   - Listing: the confirmed, priced, published unit — may wrap ONE item
 *     or MULTIPLE bundled items (see themed bundling in architecture.md).
 * Splitting these out was necessary once bundling became a real design
 * decision: a "5 yoga books" bundle is one Listing with one price, one
 * commission, one publish action — but five separate IdentifiedItems.
 */

export type ConfidenceLevel = "high" | "medium" | "low";

/** v1 launch scope is eBay-only (see docs/roadmap.md) — Kleinanzeigen and
 * others are modeled here so the schema doesn't need to change shape when
 * they're picked back up, but nothing outside eBay is actively built yet. */
export type Marketplace = "ebay" | "kleinanzeigen" | "willhaben" | "tutti";

/** Only eBay gives us real transaction data via API for v1. Everything
 * else depends on self-reporting — this drives both the sale.verified
 * field below and the monetization split in docs/architecture.md. */
export const API_VERIFIED_MARKETPLACES: readonly Marketplace[] = ["ebay"];

export interface ValueRange {
  currency: "EUR" | "CHF";
  low: number;
  high: number;
  /** Where this estimate came from, for traceability/debugging. */
  source: "price-comp-lookup" | "model-estimate" | "manual";
}

export type ItemRouting =
  | "auto-approve" // high confidence -> straight to review-and-publish
  | "needs-review" // medium confidence -> review tab, confirm/correct
  | "needs-more-info" // low confidence -> review tab, needs photo or manual entry
  | "bundle" // below value threshold -> grouped with similar low-value items
  | "donate-or-dispose"; // below value threshold, not worth bundling either

/**
 * How an unresolved attribute can actually be resolved. Two different
 * things, not one — a maker's mark needs a PHOTO of a specific spot; an
 * appliance's functional status needs the user to answer a QUESTION no
 * photo can answer ("does it still turn on?").
 */
export type ResolutionHint =
  | { type: "photo"; angleHint: string } // e.g. "close-up of model label, bottom-right of bezel"
  | { type: "question"; prompt: string }; // e.g. "Does this still power on?"

export interface UnresolvedAttribute {
  /** Matches a field name from CATEGORY_ATTRIBUTES for this item's category. */
  field: string;
  reason: string;
  resolution: ResolutionHint;
}

export interface IdentifiedItem {
  id: string;
  projectId: string;
  sourcePhotoIds: string[];

  /** What the model thinks this is. Empty/uncertain fields are allowed. */
  identification: {
    name: string;
    brand?: string;
    model?: string;
    category: string;
  };

  confidence: ConfidenceLevel;
  /**
   * Specific fields the model couldn't resolve, each with why and how to
   * fix it — drives Review tab routing AND the manual-entry quick-search
   * form (only the unresolved fields get asked for, not a full re-describe).
   * Only populated when confidence is "medium" or "low".
   */
  unresolvedAttributes?: UnresolvedAttribute[];

  valueRange: ValueRange;
  routing: ItemRouting;

  /** Set once a human has reviewed/corrected the item in the Review tab. */
  reviewedByUser: boolean;

  /**
   * Set once this item has been confirmed into a real Listing (single-item
   * or as part of a bundle). Absent until then. Price, marketplace, sale,
   * and commission all live on the Listing, not here — an item doesn't
   * have its own price once it's part of a bundle.
   */
  listingId?: string;
}

export type ListingStatus =
  | "draft" // items confirmed into a listing but not yet published
  | "published" // live on the marketplace
  | "sold"
  | "unsold-needs-decision" // ~2-week nudge fired, awaiting price-drop or donate choice
  | "price-dropped" // still live, at a lower price
  | "routed-to-donation"
  | "cancelled";

/**
 * The confirmed, priced, publishable unit. One IdentifiedItem = one
 * Listing in the common case; a themed bundle = several IdentifiedItems
 * under one Listing. Nothing here exists until a human has confirmed it —
 * see docs/architecture.md on why that confirmation step matters for
 * liability, not just UX.
 */
export interface Listing {
  id: string;
  projectId: string;
  itemIds: string[]; // one entry = single item; multiple = bundle
  marketplace: Marketplace;

  title: string;
  description: string;

  /** The price the human confirmed — never auto-set from valueRange without explicit confirmation. */
  confirmedPrice: number;
  /**
   * Walk-away minimum, captured at the same moment as confirmedPrice.
   * Negotiation itself happens on the native marketplace (see
   * docs/architecture.md) — this is just the seller's own bound to
   * negotiate against, not something the app acts on automatically.
   */
  floorPrice?: number;
  currency: "EUR" | "CHF";

  status: ListingStatus;
  confirmedByUserAt?: string;
  publishedAt?: string;
  /** The marketplace's own ID for this listing, once published — needed to look up sale status via API where available. */
  externalListingId?: string;

  /**
   * Populated once sold. `verified` is true only for API-backed
   * marketplaces (see API_VERIFIED_MARKETPLACES) where eBay itself
   * confirmed the transaction — false means self-reported and should be
   * treated as less certain (relevant to commission timing, see
   * docs/architecture.md).
   */
  sale?: {
    soldPrice: number;
    soldAt: string; // ISO date
    verified: boolean;
  };

  /**
   * Only applies to API-verified marketplaces (eBay in v1) — commission
   * charged after sale confirmation, with a buffer window for reversals.
   * Non-API marketplaces use an upfront listing fee instead, tracked
   * separately at the project/billing level, not per listing.
   */
  commission?: {
    amount: number;
    currency: "EUR" | "CHF";
    status: "pending" | "invoiced" | "paid" | "refunded";
    chargedAt?: string;
  };
}

export interface Project {
  id: string;
  ownerId: string; // the single designated person who owns this project
  country: "DE" | "AT" | "CH";
  createdAt: string;
  /** Read-only share tokens for other heirs/viewers. No proceeds-split logic. */
  shareLinks: string[];
  /**
   * Safeguard against tipping into commercial-seller legal status (see
   * docs/architecture.md) — a per-project cap, not a lifetime account cap,
   * since a single large estate clearance is normal and one account
   * running many large unrelated projects is the actual risk signal.
   */
  itemCountCap?: number;
}

export interface Photo {
  id: string;
  projectId: string;
  storageKey: string; // R2 object key
  uploadedAt: string;
  /** Set after the triage pass runs. */
  triagedAt?: string;
}

/**
 * Per-category price-differentiator fields. The deep pass prompt uses this
 * to know WHAT to actively check for per item type, instead of guessing
 * generically at "what's unclear". `priceImpact` is a rough relative
 * weight (not a hard number) to help the model prioritize which unresolved
 * field matters most when it can only ask for one more photo.
 *
 * This list is a starting point from Phase 0 findings (see the TV example:
 * screen size + panel type swing price drastically) — expect to refine it
 * as more real items get tested.
 */
export interface CategoryAttribute {
  field: string;
  priceImpact: "high" | "medium" | "low";
  /** Default resolution approach for this field, when the model doesn't have a more specific one. */
  defaultResolution: "photo" | "question";
  hint: string; // e.g. where to look, or what to ask
}

export const CATEGORY_ATTRIBUTES: Record<string, CategoryAttribute[]> = {
  electronics: [
    { field: "brand", priceImpact: "high", defaultResolution: "photo", hint: "logo or label, usually front-bottom or rear" },
    { field: "model", priceImpact: "high", defaultResolution: "photo", hint: "model number sticker, usually on the back/underside" },
    { field: "sizeOrCapacity", priceImpact: "high", defaultResolution: "question", hint: "screen size, storage size, RAM, etc." },
    { field: "panelOrTech", priceImpact: "high", defaultResolution: "question", hint: "e.g. OLED/QLED/LED for displays" },
    { field: "ageOrYear", priceImpact: "medium", defaultResolution: "question", hint: "purchase year or model year" },
    { field: "functionalStatus", priceImpact: "high", defaultResolution: "question", hint: "does it power on and work correctly?" },
    { field: "includedAccessories", priceImpact: "medium", defaultResolution: "question", hint: "original box, remote, cables, charger" },
  ],
  furniture: [
    { field: "brandOrDesigner", priceImpact: "high", defaultResolution: "photo", hint: "maker's label, often underside or inside a drawer" },
    { field: "material", priceImpact: "high", defaultResolution: "photo", hint: "solid wood vs veneer vs particleboard — close-up of an edge or unfinished surface" },
    { field: "styleOrEra", priceImpact: "medium", defaultResolution: "question", hint: "mid-century, antique, contemporary, etc." },
    { field: "dimensions", priceImpact: "medium", defaultResolution: "question", hint: "buyers filter by fit before anything else" },
    { field: "structuralCondition", priceImpact: "high", defaultResolution: "photo", hint: "joints, legs, any damage or wear" },
  ],
  appliances: [
    { field: "brand", priceImpact: "high", defaultResolution: "photo", hint: "nameplate, usually front or rear" },
    { field: "model", priceImpact: "medium", defaultResolution: "photo", hint: "model/serial sticker, usually rear or inside door" },
    { field: "ageOrYear", priceImpact: "high", defaultResolution: "question", hint: "affects remaining expected lifespan" },
    { field: "functionalStatus", priceImpact: "high", defaultResolution: "question", hint: "single biggest price swing — does it work?" },
    { field: "capacity", priceImpact: "medium", defaultResolution: "question", hint: "liters, kg load, etc." },
    { field: "energyRating", priceImpact: "medium", defaultResolution: "photo", hint: "energy label sticker, if still attached" },
  ],
  jewelryAndWatches: [
    { field: "materialPurity", priceImpact: "high", defaultResolution: "photo", hint: "hallmark/purity stamp, often tiny — needs a macro close-up" },
    { field: "brand", priceImpact: "high", defaultResolution: "photo", hint: "engraved brand mark or dial signature" },
    { field: "gemstones", priceImpact: "high", defaultResolution: "photo", hint: "macro photo of the stone itself, plus any certificate" },
    { field: "hallmarks", priceImpact: "high", defaultResolution: "photo", hint: "often the only proof of authenticity — easy to miss" },
    { field: "functionalStatus", priceImpact: "medium", defaultResolution: "question", hint: "for watches — does it run and keep time?" },
  ],
  artAndAntiques: [
    { field: "artistOrMaker", priceImpact: "high", defaultResolution: "photo", hint: "signature, usually bottom corner or reverse" },
    { field: "medium", priceImpact: "high", defaultResolution: "question", hint: "original vs print vs reproduction — easy to conflate" },
    { field: "provenance", priceImpact: "medium", defaultResolution: "question", hint: "certificates, gallery labels, family history" },
    { field: "eraOrPeriod", priceImpact: "medium", defaultResolution: "question", hint: "" },
    { field: "conditionOrRestoration", priceImpact: "medium", defaultResolution: "photo", hint: "damage, restoration history, framing" },
  ],
  musicalInstruments: [
    { field: "brand", priceImpact: "high", defaultResolution: "photo", hint: "headstock logo or label inside the body" },
    { field: "material", priceImpact: "high", defaultResolution: "question", hint: "solid wood vs laminate for strings" },
    { field: "serialOrYear", priceImpact: "medium", defaultResolution: "photo", hint: "often stamped on headstock or inside soundhole" },
    { field: "playableCondition", priceImpact: "high", defaultResolution: "question", hint: "cracks, action, playability" },
    { field: "includedAccessories", priceImpact: "low", defaultResolution: "question", hint: "case, bow, amp" },
  ],
  collectibles: [
    { field: "franchiseOrSeries", priceImpact: "high", defaultResolution: "photo", hint: "packaging or item markings" },
    { field: "editionOrRarity", priceImpact: "high", defaultResolution: "photo", hint: "edition markings, print numbers" },
    { field: "conditionGrade", priceImpact: "high", defaultResolution: "photo", hint: "mint vs played — close-up of any wear" },
    { field: "authentication", priceImpact: "medium", defaultResolution: "question", hint: "graded/certified vs ungraded" },
    { field: "completeness", priceImpact: "high", defaultResolution: "question", hint: "full set vs partial — non-linear value" },
  ],
  toolsAndEquipment: [
    { field: "brand", priceImpact: "high", defaultResolution: "photo", hint: "logo/label on the body" },
    { field: "powerSource", priceImpact: "medium", defaultResolution: "question", hint: "corded / cordless / battery" },
    { field: "ageOrCondition", priceImpact: "medium", defaultResolution: "question", hint: "" },
    { field: "includedAccessories", priceImpact: "low", defaultResolution: "question", hint: "bits, cases, chargers" },
  ],
};
