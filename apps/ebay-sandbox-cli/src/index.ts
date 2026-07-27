/**
 * Phase 0-style smoke test: can we actually authenticate against eBay's
 * Sandbox at all? This mints an "Application access token" via the
 * client_credentials grant — the simplest possible eBay auth flow, using
 * only App ID + Cert ID (Dev ID is NOT used here — that's only relevant
 * to eBay's older Trading API, not this one).
 *
 * This token can call eBay's public/read-only endpoints. It CANNOT create
 * or manage listings — that needs a "User access token" via a different
 * flow (authorization_code grant, requiring a RuName redirect and the
 * seller's own consent) — deliberately not built yet. This script's only
 * job is proving basic connectivity before tackling that bigger step.
 *
 * Usage: pnpm --filter ebay-sandbox-cli dev
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: "../../.env" });

const APP_ID = process.env.EBAY_SANDBOX_APP_ID;
const CERT_ID = process.env.EBAY_SANDBOX_CERT_ID;

const TOKEN_URL = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";

async function main() {
  if (!APP_ID || !CERT_ID) {
    console.error(
      "Missing EBAY_SANDBOX_APP_ID or EBAY_SANDBOX_CERT_ID in .env (repo root)."
    );
    process.exit(1);
  }

  const credentials = Buffer.from(`${APP_ID}:${CERT_ID}`).toString("base64");

  console.log("Requesting an Application access token from eBay Sandbox...");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      scope: "https://api.ebay.com/oauth/api_scope",
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    console.error(`\nRequest failed — HTTP ${response.status}`);
    console.error(body);
    console.error(
      "\nMost common causes: App ID/Cert ID typo'd or swapped, or using Production keys against the Sandbox URL (or vice versa)."
    );
    process.exit(1);
  }

  console.log("\nSuccess. eBay Sandbox returned a real token.");
  console.log("  token_type:", body.token_type);
  console.log("  expires_in:", body.expires_in, "seconds");
  console.log(
    "  access_token (truncated):",
    body.access_token.slice(0, 20) + "..."
  );
  console.log(
    "\nThis confirms basic connectivity. Creating real listings needs a " +
      "User access token (different flow, seller consent required) — next step."
  );
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});