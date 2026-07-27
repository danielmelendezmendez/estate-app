/**
 * Step 2 of eBay User-token setup: exchange the one-time authorization
 * code (captured from the browser redirect after a seller consents) for
 * a real User access token — the one that can actually create listings.
 *
 * Usage: pnpm --filter ebay-sandbox-cli exchange-code "<code>"
 *
 * The code comes from the browser address bar after completing the
 * consent flow (see chat for the full walkthrough) — it's the value of
 * the `code` query parameter, URL-decoded.
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: "../../.env" });

const APP_ID = process.env.EBAY_SANDBOX_APP_ID;
const CERT_ID = process.env.EBAY_SANDBOX_CERT_ID;
const RUNAME = process.env.EBAY_SANDBOX_RUNAME;

const TOKEN_URL = "https://api.sandbox.ebay.com/identity/v1/oauth2/token";

async function main() {
  const code = process.argv[2];

  if (!APP_ID || !CERT_ID || !RUNAME) {
    console.error(
      "Missing EBAY_SANDBOX_APP_ID, EBAY_SANDBOX_CERT_ID, or EBAY_SANDBOX_RUNAME in .env."
    );
    process.exit(1);
  }
  if (!code) {
    console.error(
      'Usage: pnpm --filter ebay-sandbox-cli exchange-code "<authorization-code>"'
    );
    process.exit(1);
  }

  // The code copied from the browser address bar is percent-encoded
  // (e.g. %5E for ^, %23 for #). Decode it here so URLSearchParams below
  // encodes it correctly once, instead of double-encoding an
  // already-encoded string — that would silently produce an invalid code
  // and eBay would reject it with a confusing error otherwise.
  const decodedCode = decodeURIComponent(code);

  const credentials = Buffer.from(`${APP_ID}:${CERT_ID}`).toString("base64");

  console.log("Exchanging authorization code for a User access token...");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: decodedCode,
      redirect_uri: RUNAME, // yes, the RuName string itself, not a real URL — eBay's convention
    }),
  });

  const body = await response.json();

  if (!response.ok) {
    console.error(`\nRequest failed — HTTP ${response.status}`);
    console.error(body);
    console.error(
      "\nCommon causes: the code was already used (they're single-use, get a fresh one if this happens), " +
        "the code expired (they're short-lived — exchange it quickly after copying), " +
        "or EBAY_SANDBOX_RUNAME doesn't exactly match the RuName used to generate the consent URL."
    );
    process.exit(1);
  }

  console.log("\nSuccess. Got a real User access token.");
  console.log("  expires_in:", body.expires_in, "seconds");
  console.log("  refresh_token_expires_in:", body.refresh_token_expires_in, "seconds (~547 days)");
  console.log(
    "\nAdd these to your .env so future scripts can use them without repeating this flow.\n" +
      "IMPORTANT: keep the quotes — eBay tokens contain # characters that some .env " +
      "parsers treat as a comment marker, silently truncating an unquoted value:\n"
  );
  console.log(`EBAY_SANDBOX_USER_TOKEN="${body.access_token}"`);
  console.log(`EBAY_SANDBOX_REFRESH_TOKEN="${body.refresh_token}"`);
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
