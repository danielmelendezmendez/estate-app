/**
 * Price-comp lookup — STUB. Data source is still an open Phase 0 question
 * (see docs/architecture.md). Candidates: eBay Browse API, licensed
 * price-comp provider. Do not build the real pipeline against this until
 * that's resolved.
 *
 * Two call shapes are needed:
 * - bulk: called from the deep pass for every flagged item
 * - single: called on-demand from manual entry ("quick search")
 */

import type { ValueRange } from "@estate-app/schema";

export interface PriceLookupQuery {
  itemName: string;
  brand?: string;
  model?: string;
  category: string;
  condition?: string;
}

export async function lookupPriceRange(
  _query: PriceLookupQuery
): Promise<ValueRange> {
  throw new Error(
    "Not implemented — price-comp data source not yet chosen. See docs/architecture.md Phase 0 tasks."
  );
}
