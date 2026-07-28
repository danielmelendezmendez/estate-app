/**
 * The actual bridge from the Review UI to eBay: takes a real item's data
 * (title, description, price, category) and runs the same
 * category-resolution → policies → location → item → offer → publish
 * chain proven in apps/ebay-sandbox-cli/create-test-listing.ts, but
 * driven by real data from the Review tab instead of a hardcoded demo
 * item.
 *
 * Duplicated from create-test-listing.ts rather than shared, given the
 * timeline — consolidating into a shared package is a reasonable
 * fast-follow, not urgent before this needs to work.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: "../../.env" });

import { join } from "path";
import { openDb, markDeepPassPublished } from "@estate-app/db";

const DB_PATH = join(process.cwd(), "..", "phase0-cli", "phase0.db");

const USER_TOKEN = process.env.EBAY_SANDBOX_USER_TOKEN;
const BASE = "https://api.sandbox.ebay.com";
const MARKETPLACE_ID = "EBAY_US";
const MERCHANT_LOCATION_KEY = "estate-app-test-location";
const PLACEHOLDER_IMAGE = "https://placehold.co/500x500.png";

// Different eBay categories accept different subsets of condition values,
// and guessing at granular ones (USED_GOOD, USED_VERY_GOOD, etc.) risks
// hitting "invalid condition for this category" on categories we haven't
// tested. USED_EXCELLENT is the one value proven to work across two
// different categories tonight (Lamps and PC Desktops) — safer to default
// to it than guess at untested granularity, especially this close to a
// live demo. Real per-category condition validation is a fast-follow.
const CONDITION_MAP: Record<string, string> = {
  new: "NEW",
  "like-new": "USED_EXCELLENT",
  good: "USED_EXCELLENT",
  fair: "USED_EXCELLENT",
  poor: "USED_EXCELLENT",
};

async function ebayFetch(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${USER_TOKEN}`,
      "Content-Language": "en-US",
      "Accept-Language": "en-US",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json: any;
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    const err = new Error(`${method} ${path} — response wasn't valid JSON (HTTP ${response.status})`);
    (err as any).rawText = text.slice(0, 500);
    throw err;
  }

  if (!response.ok) {
    const err = new Error(`${method} ${path} failed — HTTP ${response.status}`);
    (err as any).body = json;
    throw err;
  }
  return json;
}

async function resolveRequiredAspects(treeId: string, categoryId: string): Promise<Record<string, string[]>> {
  const resp = await ebayFetch(
    "GET",
    `/commerce/taxonomy/v1/category_tree/${treeId}/get_item_aspects_for_category?category_id=${categoryId}`
  );
  const aspects: Record<string, string[]> = {};
  const requiredAspects = (resp.aspects ?? []).filter((a: any) => a.aspectConstraint?.aspectRequired);
  for (const aspect of requiredAspects) {
    const name = aspect.localizedAspectName;
    if (name === "Brand") {
      aspects[name] = ["Unbranded"];
    } else if (aspect.aspectValues?.length > 0) {
      aspects[name] = [aspect.aspectValues[0].localizedValue];
    } else {
      aspects[name] = ["Not Specified"];
    }
  }
  return aspects;
}

async function getOrCreatePolicy(
  kind: "fulfillment_policy" | "payment_policy" | "return_policy",
  name: string,
  body: unknown
): Promise<string> {
  const existing = await ebayFetch("GET", `/sell/account/v1/${kind}?marketplace_id=${MARKETPLACE_ID}`);
  const key = kind === "fulfillment_policy" ? "fulfillmentPolicies" : kind === "payment_policy" ? "paymentPolicies" : "returnPolicies";
  const found = existing[key]?.find((p: any) => p.name === name);
  if (found) return found.fulfillmentPolicyId ?? found.paymentPolicyId ?? found.returnPolicyId;
  const created = await ebayFetch("POST", `/sell/account/v1/${kind}`, body);
  const idField = kind === "fulfillment_policy" ? "fulfillmentPolicyId" : kind === "payment_policy" ? "paymentPolicyId" : "returnPolicyId";
  return created[idField];
}

export async function POST(request: Request) {
  if (!USER_TOKEN) {
    return Response.json(
      { error: "Missing EBAY_SANDBOX_USER_TOKEN — run the OAuth flow first." },
      { status: 500 }
    );
  }

  try {
    const { sku, title, description, price, categoryQuery, condition, deepPassResultId } = await request.json();

    if (!sku || !title || !price || !categoryQuery) {
      return Response.json(
        { error: "Missing required field: sku, title, price, and categoryQuery are all required." },
        { status: 400 }
      );
    }

    const ebayCondition = CONDITION_MAP[condition] ?? "USED_GOOD";

    // Category + required fields
    const treeResp = await ebayFetch("GET", `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${MARKETPLACE_ID}`);
    const treeId = treeResp.categoryTreeId;
    const suggestResp = await ebayFetch(
      "GET",
      `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(categoryQuery)}`
    );
    const categoryId = suggestResp.categorySuggestions?.[0]?.category?.categoryId;
    if (!categoryId) throw new Error(`No eBay category found for "${categoryQuery}".`);
    const categoryName = suggestResp.categorySuggestions[0].category.categoryName;
    const aspects = await resolveRequiredAspects(treeId, categoryId);

    // Opt in (idempotent)
    try {
      await ebayFetch("POST", "/sell/account/v1/program/opt_in", { programType: "SELLING_POLICY_MANAGEMENT" });
    } catch (e: any) {
      if (!e.message.includes("HTTP 409")) throw e;
    }

    // Policies (get-or-create)
    const fulfillmentPolicyId = await getOrCreatePolicy("fulfillment_policy", "Estate App Test Shipping", {
      name: "Estate App Test Shipping",
      marketplaceId: MARKETPLACE_ID,
      categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
      handlingTime: { value: 3, unit: "DAY" },
      shippingOptions: [
        {
          optionType: "DOMESTIC",
          costType: "FLAT_RATE",
          shippingServices: [
            { sortOrder: 1, shippingCarrierCode: "USPS", shippingServiceCode: "USPSPriority", shippingCost: { value: "5.00", currency: "USD" }, freeShipping: false },
          ],
        },
      ],
    });
    const paymentPolicyId = await getOrCreatePolicy("payment_policy", "Estate App Test Payment", {
      name: "Estate App Test Payment",
      marketplaceId: MARKETPLACE_ID,
      categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
      immediatePay: false,
    });
    const returnPolicyId = await getOrCreatePolicy("return_policy", "Estate App Test Returns", {
      name: "Estate App Test Returns",
      marketplaceId: MARKETPLACE_ID,
      categoryTypes: [{ name: "ALL_EXCLUDING_MOTORS_VEHICLES" }],
      returnsAccepted: true,
      returnPeriod: { value: 30, unit: "DAY" },
      refundMethod: "MONEY_BACK",
      returnShippingCostPayer: "BUYER",
    });

    // Location (idempotent)
    try {
      await ebayFetch("POST", `/sell/inventory/v1/location/${MERCHANT_LOCATION_KEY}`, {
        location: { address: { addressLine1: "123 Test Street", city: "San Jose", stateOrProvince: "CA", postalCode: "95125", country: "US" } },
        locationTypes: ["WAREHOUSE"],
        name: "Estate App Test Location",
      });
    } catch (e: any) {
      if (!e.message.includes("HTTP 409") && !JSON.stringify(e.body).includes("already exists")) throw e;
    }

    // Inventory item
    await ebayFetch("PUT", `/sell/inventory/v1/inventory_item/${sku}`, {
      condition: ebayCondition,
      product: { title, description, aspects, imageUrls: [PLACEHOLDER_IMAGE] },
      availability: { shipToLocationAvailability: { quantity: 1 } },
    });

    // Offer (get-or-create — 404 means none exists yet, that's expected)
    let existingOffers: any;
    try {
      existingOffers = await ebayFetch("GET", `/sell/inventory/v1/offer?sku=${sku}&marketplace_id=${MARKETPLACE_ID}`);
    } catch (e: any) {
      if (e.message.includes("HTTP 404")) existingOffers = { offers: [] };
      else throw e;
    }
    let offerId = existingOffers.offers?.[0]?.offerId;
    if (!offerId) {
      const offer = await ebayFetch("POST", "/sell/inventory/v1/offer", {
        sku,
        marketplaceId: MARKETPLACE_ID,
        format: "FIXED_PRICE",
        availableQuantity: 1,
        categoryId,
        listingDescription: description,
        listingPolicies: { fulfillmentPolicyId, paymentPolicyId, returnPolicyId },
        pricingSummary: { price: { value: String(price), currency: "USD" } },
        merchantLocationKey: MERCHANT_LOCATION_KEY,
      });
      offerId = offer.offerId;
    }

    // Publish
    const published = await ebayFetch("POST", `/sell/inventory/v1/offer/${offerId}/publish`, {});

    const listingUrl = `https://sandbox.ebay.com/itm/${published.listingId}`;

    // Record this durably — without this, "published" only ever lived in
    // transient client state, which is why there was no real running
    // total before. deepPassResultId is optional so this route still
    // works if called without it (e.g. from the CLI test scripts).
    if (deepPassResultId) {
      const db = openDb(DB_PATH);
      markDeepPassPublished(db, deepPassResultId, {
        price,
        ebayListingId: published.listingId,
        ebayListingUrl: listingUrl,
      });
    }

    return Response.json({
      success: true,
      listingId: published.listingId,
      url: listingUrl,
      category: categoryName,
    });
  } catch (err: any) {
    console.error("Publish error:", err);
    return Response.json(
      { error: err.message ?? "Unknown error", body: err.body ?? null },
      { status: 500 }
    );
  }
}
