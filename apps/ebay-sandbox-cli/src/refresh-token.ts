/**
 * Mints a fresh Access token from the Refresh token — no need to repeat
 * the RuName/consent/authorization-code dance every 2 hours. The refresh
 * token itself is good for ~547 days.
 *
 * Usage: pnpm --filter ebay-sandbox-cli refresh-token
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: "../../.env" });

const APP_ID = process.env.EBAY_SANDBOX_APP_ID;
const CERT_ID = process.env.EBAY_SANDBOX_CERT_ID;
const REFRESH_TOKEN = process.env.EBAY_SANDBOX_REFRESH_TOKEN;

const TOKEN_URL = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";

// Scopes needed for what we're testing: Inventory API + Account API
// (business policies). If eBay rejects this with an "invalid_scope"
// error, it means the ORIGINAL consent didn't grant one of these scopes
// at all — that's a different problem than an expired token, and would
// mean re-doing the consent flow with these scopes explicitly requested.
const SCOPES = [
  "https://api.ebay.com/oauth/api_scope",
  "https://api.ebay.com/oauth/api_scope/sell.inventory",
  "https://api.ebay.com/oauth/api_scope/sell.account",
].join(" ");

async function main() {
  if (!APP_ID || !CERT_ID || !REFRESH_TOKEN) {
    console.error(
      "Missing EBAY_SANDBOX_APP_ID, EBAY_SANDBOX_CERT_ID, or EBAY_SANDBOX_REFRESH_TOKEN in .env."
    );
    process.exit(1);
  }

  const credentials = Buffer.from(`${APP_ID}:${CERT_ID}`).toString("base64");

  console.log("Refreshing access token...");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: REFRESH_TOKEN,
      scope: SCOPES,
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    console.error(`\nRequest failed — HTTP ${response.status}`);
    console.error(JSON.stringify(body, null, 2));
    if (body.error === "invalid_grant") {
      console.error(
        "\nThe refresh token itself may be corrupted/truncated (check quoting in .env — see chat) or genuinely invalid."
      );
    }
    if (body.error === "invalid_scope") {
      console.error(
        "\nThe original consent didn't grant one of the scopes requested here — this needs a fresh consent flow with these scopes explicitly requested, not just a refresh."
      );
    }
    process.exit(1);
  }

  console.log("\nSuccess. New access token minted.");
  console.log("  expires_in:", body.expires_in, "seconds");
  console.log("\nUpdate .env with this (replace the old EBAY_SANDBOX_USER_TOKEN line, keep it quoted):\n");
  console.log(`EBAY_SANDBOX_USER_TOKEN="${body.access_token}"`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
