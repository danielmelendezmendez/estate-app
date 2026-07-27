/**
 * Generalized version of the Sandbox listing test. Instead of one
 * hardcoded item (Lamps), this takes an item definition and:
 *   1. Looks up a real category for it
 *   2. Asks eBay which fields THAT category actually requires (Taxonomy
 *      API get_item_aspects_for_category) instead of guessing one field
 *      at a time via trial-and-error publish failures (how the Lamps
 *      version was built) — meaningfully more robust for an unfamiliar
 *      category we haven't tested yet, like electronics/PCs.
 *   3. Runs the same proven policy/location/item/offer/publish chain.
 *
 * Usage:
 *   pnpm --filter ebay-sandbox-cli create-test-listing lamp   (known-good, proven earlier)
 *   pnpm --filter ebay-sandbox-cli create-test-listing pc     (new — testing ahead of Saturday's demo)
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: "../../.env" });

const USER_TOKEN = process.env.EBAY_SANDBOX_USER_TOKEN;
const BASE = "https://api.sandbox.ebay.com";
const MARKETPLACE_ID = "EBAY_US";
const MERCHANT_LOCATION_KEY = "estate-app-test-location";
const PLACEHOLDER_IMAGE = "https://placehold.co/500x500.png";

interface DemoItem {
  sku: string;
  title: string;
  description: string;
  categoryQuery: string;
  price: string;
  condition: string;
}

const DEMO_ITEMS: Record<string, DemoItem> = {
  lamp: {
    sku: "estate-app-test-001",
    title: "Test Desk Lamp — Estate App Sandbox Test",
    description: "This is a test listing created by Estate App to validate the eBay Sandbox integration. Not a real item.",
    categoryQuery: "desk lamp",
    price: "25.00",
    condition: "USED_EXCELLENT",
  },
  pc: {
    sku: "estate-app-pc-001",
    title: "Custom Gaming PC — White ATX Case with RGB Lighting",
    description: "Used custom-built desktop PC in a white ATX case with RGB lighting. Powers on with lighting active. Brand, internal specs, and full functionality not confirmed — sold as-is. From Estate App's Sandbox test pipeline, not a real item for sale.",
    categoryQuery: "gaming desktop pc",
    price: "550.00",
    condition: "USED_EXCELLENT",
  },
};

if (!USER_TOKEN) {
  console.error("Missing EBAY_SANDBOX_USER_TOKEN in .env — run the OAuth flow first.");
  process.exit(1);
}

const itemKey = process.argv[2] ?? "lamp";
const item = DEMO_ITEMS[itemKey];
if (!item) {
  console.error(`Unknown item "${itemKey}". Available: ${Object.keys(DEMO_ITEMS).join(", ")}`);
  process.exit(1);
}

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

function logStep(n: number, total: number, label: string) {
  console.log(`\n[${n}/${total}] ${label}...`);
}

function logError(err: any) {
  console.error("\n✗ FAILED:", err.message);
  if (err.body) console.error(JSON.stringify(err.body, null, 2));
  if (err.rawText) console.error("Raw response:", err.rawText);
}

/**
 * Ask eBay what this category actually requires, instead of guessing one
 * field at a time via failed publish attempts. Returns a ready-to-use
 * aspects object for the inventory item's product.aspects field.
 */
async function resolveRequiredAspects(
  treeId: string,
  categoryId: string
): Promise<Record<string, string[]>> {
  const resp = await ebayFetch(
    "GET",
    `/commerce/taxonomy/v1/category_tree/${treeId}/get_item_aspects_for_category?category_id=${categoryId}`
  );

  const aspects: Record<string, string[]> = {};
  const requiredAspects = (resp.aspects ?? []).filter(
    (a: any) => a.aspectConstraint?.aspectRequired
  );

  for (const aspect of requiredAspects) {
    const name = aspect.localizedAspectName;
    if (name === "Brand") {
      // eBay's own standard value for genuinely unknown/generic brand —
      // see chat and docs/architecture.md.
      aspects[name] = ["Unbranded"];
    } else if (aspect.aspectValues?.length > 0) {
      // Use the category's own first suggested value — safest choice for
      // fields we can't determine from the item itself, and avoids
      // sending an invalid free-text value on a selection-only field.
      aspects[name] = [aspect.aspectValues[0].localizedValue];
    } else {
      // No suggested values and not Brand — best-effort generic fallback.
      aspects[name] = ["Not Specified"];
    }
  }

  return aspects;
}

async function main() {
  const TOTAL_STEPS = 7;
  try {
    console.log(`Publishing demo item: "${item.title}"\n`);

    // --- Step 1: category + required aspects ---
    logStep(1, TOTAL_STEPS, "Looking up category and required fields");
    const treeResp = await ebayFetch(
      "GET",
      `/commerce/taxonomy/v1/get_default_category_tree_id?marketplace_id=${MARKETPLACE_ID}`
    );
    const treeId = treeResp.categoryTreeId;

    const suggestResp = await ebayFetch(
      "GET",
      `/commerce/taxonomy/v1/category_tree/${treeId}/get_category_suggestions?q=${encodeURIComponent(item.categoryQuery)}`
    );
    const categoryId = suggestResp.categorySuggestions?.[0]?.category?.categoryId;
    if (!categoryId) throw new Error("No category suggestions returned — check the response body above.");
    console.log("  Category:", categoryId, suggestResp.categorySuggestions[0].category.categoryName);

    const aspects = await resolveRequiredAspects(treeId, categoryId);
    console.log("  Required fields resolved:", JSON.stringify(aspects));

    // --- Step 2: opt in ---
    logStep(2, TOTAL_STEPS, "Opting in to Business Policies (safe to re-run)");
    try {
      await ebayFetch("POST", "/sell/account/v1/program/opt_in", {
        programType: "SELLING_POLICY_MANAGEMENT",
      });
      console.log("  Opted in.");
    } catch (e: any) {
      if (e.message.includes("HTTP 409")) {
        console.log("  Already opted in — continuing.");
      } else throw e;
    }

    // --- Step 3: policies ---
    logStep(3, TOTAL_STEPS, "Creating fulfillment/payment/return policies (reusing if they already exist)");

    async function getOrCreatePolicy(
      kind: "fulfillment_policy" | "payment_policy" | "return_policy",
      name: string,
      body: unknown
    ): Promise<string> {
      const existing = await ebayFetch("GET", `/sell/account/v1/${kind}?marketplace_id=${MARKETPLACE_ID}`);
      const key = kind === "fulfillment_policy" ? "fulfillmentPolicies" : kind === "payment_policy" ? "paymentPolicies" : "returnPolicies";
      const found = existing[key]?.find((p: any) => p.name === name);
      if (found) {
        const id = found.fulfillmentPolicyId ?? found.paymentPolicyId ?? found.returnPolicyId;
        console.log(`  Reusing existing ${kind}:`, id);
        return id;
      }
      const created = await ebayFetch("POST", `/sell/account/v1/${kind}`, body);
      const idField = kind === "fulfillment_policy" ? "fulfillmentPolicyId" : kind === "payment_policy" ? "paymentPolicyId" : "returnPolicyId";
      console.log(`  Created ${kind}:`, created[idField]);
      return created[idField];
    }

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
            {
              sortOrder: 1,
              shippingCarrierCode: "USPS",
              shippingServiceCode: "USPSPriority",
              shippingCost: { value: "5.00", currency: "USD" },
              freeShipping: false,
            },
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

    // --- Step 4: location ---
    logStep(4, TOTAL_STEPS, "Creating merchant inventory location (safe to re-run)");
    try {
      await ebayFetch("POST", `/sell/inventory/v1/location/${MERCHANT_LOCATION_KEY}`, {
        location: {
          address: {
            addressLine1: "123 Test Street",
            city: "San Jose",
            stateOrProvince: "CA",
            postalCode: "95125",
            country: "US",
          },
        },
        locationTypes: ["WAREHOUSE"],
        name: "Estate App Test Location",
      });
      console.log("  Created location.");
    } catch (e: any) {
      if (e.message.includes("HTTP 409") || JSON.stringify(e.body).includes("already exists")) {
        console.log("  Location already exists — continuing.");
      } else throw e;
    }

    // --- Step 5: inventory item ---
    logStep(5, TOTAL_STEPS, "Creating the inventory item");
    await ebayFetch("PUT", `/sell/inventory/v1/inventory_item/${item.sku}`, {
      condition: item.condition,
      product: {
        title: item.title,
        description: item.description,
        aspects,
        imageUrls: [PLACEHOLDER_IMAGE],
      },
      availability: {
        shipToLocationAvailability: { quantity: 1 },
      },
    });
    console.log("  Inventory item created, SKU:", item.sku);

    // --- Step 6: offer (get-or-create) ---
    logStep(6, TOTAL_STEPS, "Creating the offer (reusing if one already exists for this SKU)");
    let existingOffers: any;
    try {
      existingOffers = await ebayFetch(
        "GET",
        `/sell/inventory/v1/offer?sku=${item.sku}&marketplace_id=${MARKETPLACE_ID}`
      );
    } catch (e: any) {
      // eBay returns a 404 here (not an empty 200 list) when no offer
      // exists yet for this SKU — that's the normal "nothing to reuse"
      // case, not a real failure.
      if (e.message.includes("HTTP 404")) {
        existingOffers = { offers: [] };
      } else throw e;
    }
    let offerId = existingOffers.offers?.[0]?.offerId;

    if (offerId) {
      console.log("  Reusing existing offer, offerId:", offerId);
    } else {
      const offer = await ebayFetch("POST", "/sell/inventory/v1/offer", {
        sku: item.sku,
        marketplaceId: MARKETPLACE_ID,
        format: "FIXED_PRICE",
        availableQuantity: 1,
        categoryId,
        listingDescription: item.description,
        listingPolicies: { fulfillmentPolicyId, paymentPolicyId, returnPolicyId },
        pricingSummary: { price: { value: item.price, currency: "USD" } },
        merchantLocationKey: MERCHANT_LOCATION_KEY,
      });
      offerId = offer.offerId;
      console.log("  Offer created, offerId:", offerId);
    }

    // --- Step 7: publish ---
    logStep(7, TOTAL_STEPS, "Publishing the offer — this makes it a real (Sandbox) listing");
    const published = await ebayFetch("POST", `/sell/inventory/v1/offer/${offerId}/publish`, {});

    console.log("\n✓ SUCCESS. Listing is live in Sandbox.");
    console.log("  Listing ID:", published.listingId);
    console.log(`\n  View it (Sandbox site): https://sandbox.ebay.com/itm/${published.listingId}`);
  } catch (err: any) {
    logError(err);
    process.exit(1);
  }
}

main();
