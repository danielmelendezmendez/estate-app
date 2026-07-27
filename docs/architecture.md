# Architecture decisions

## Model tiering (AI pipeline)

| Pass | Model | Why |
|---|---|---|
| Triage (every photo) | Claude Haiku 4.5 ($1/$5 per MTok) | Runs on hundreds of photos per estate — cost scales with volume, so this needs to be cheap. Built for high-volume classification. |
| Deep pass (flagged high/medium-value items only) | Claude Sonnet 5 ($2/$10 per MTok intro pricing through Aug 31 2026, then $3/$15) | Best price-to-performance for brand/model ID, condition assessment, and listing copywriting. |
| Escalation (held in reserve) | Claude Opus 4.8 | Not built for by default. Only add an escalation path if Phase 0 testing shows a specific pattern of hard cases (illegible marks, suspected antiques) the deep pass can't handle. |

Cost levers once the pipeline is real:
- **Batch API** (50% off) for the triage pass — doesn't need to be instant.
- **Prompt caching** (90% off) for the system prompt, which is identical
  across every call.
- Client-side photo compression before upload (cuts both storage and vision
  token cost — a 1000×1000px image is ~1,300 tokens).

**Phase 0 validation plan:** run the same ~100 test photos through Sonnet 5
across the board first (ground truth), then through Haiku 4.5, and compare.
If Haiku's triage decisions agree with Sonnet's often enough on the
borderline cases, the two-tier design is validated. If not, adjust the
confidence threshold or route more items to the deep pass than planned.

## Marketplace posting: automated where possible, paced where necessary

**Revised from an earlier "assisted, human clicks publish" decision** — the
original framing conflated two different kinds of human-in-the-loop: (1)
the person confirming *which items and prices* go live, and (2) the person
manually clicking publish on every individual listing. Only (1) is the
actual product intent — the point of the app is to spare the person from
doing the posting work themselves, not just from doing the typing.

**eBay:** fully automated, no compromise needed. eBay has an official
listing-creation API (Sell/Trading APIs) — once the person confirms an
item and price in our UI, the backend calls the API directly and the
listing goes live. No browser extension involved for eBay at all.

**Kleinanzeigen:** no official listing-creation API exists (only
unofficial scrapers built for reading data). This is an external
constraint, not a design choice — there is no risk-free version of
"fully automated, zero-touch" posting here the way there is for eBay.

Decision: automate the actual publish click (not just form pre-fill),
but pace it deliberately to reduce account-suspension risk:
- Confirmed items join a **queue**, not published synchronously on
  confirmation.
- **Randomized delays** between individual listings (not a fixed
  interval — should look like human posting behavior, not a bot burst).
- **Daily/hourly caps per account**, calibrated to plausible human
  posting volume.
- A **background service worker with Chrome's alarms API** processes the
  queue over time, without requiring the person to watch the tab.

**Known limitation, stated plainly:** this requires the browser to be
running (can be backgrounded/minimized, not fully closed) for the queue
to keep draining — it is NOT a "confirm everything and walk away for the
day with the laptop off" system. A true walk-away system would mean
server-side automation (a headless browser acting on the person's saved
Kleinanzeigen session) — deliberately not pursued: server-side automation
is generally easier for anti-bot systems to fingerprint than a real
browser extension in a real logged-in session, and it means storing/
managing the person's Kleinanzeigen session credentials on our backend,
a meaningfully larger security surface. Revisit only if the
browser-must-stay-open constraint proves to be a real dealbreaker in
practice, not preemptively.

This still carries real, hard-to-quantify account-suspension risk at
scale (many listings, many customers' accounts, same extension) —
pacing reduces but does not eliminate that risk. Worth monitoring for
account flags in practice once this is live, not just assumed safe
because it's paced.

eBay's official API requires developer approval and business-policy
setup — start the application early, it's slow, and it blocks nothing
else in the meantime.

Amazon SP-API is not a good fit for this use case — it's built around
ASIN/catalog matching, which most one-off used household items don't have.
Deprioritized.

## Storage & infra (cost-optimized for bursty usage)

Estate-clearance usage is bursty — heavy photo upload for a weekend, then
quiet for weeks. This rules out always-on servers.

- **Object storage:** Cloudflare R2 over S3 — zero egress fees matter here
  since photos get re-fetched repeatedly (AI passes, listing generation,
  marketplace posting, user review).
- **Backend:** Serverless (Cloudflare Workers / Fly.io / Vercel functions)
  — no cost for idle time between projects.
- **Database:** Postgres via Supabase or Neon — cheap tiers, and
  Supabase/Neon give auth + realtime out of the box, which covers
  multi-user project sharing without building it from scratch.

## Price-comp data source

Open question — no committed answer yet. Candidates: eBay Browse API
(official, has sold-listing-adjacent data), or a licensed price-comp data
provider. Needs a dedicated Phase 0 research pass before the pricing
package is built for real (see `packages/pricing`).

## Item value/confidence model

Every identified item carries:
- `identification` — what it is, brand/model if visible
- `confidence` — how sure the model is (drives Review tab routing)
- `valueRange` — low/high estimate, never a single number

Routing after triage + confidence:

| Confidence | Routing |
|---|---|
| High | Straight to review-and-publish, value range shown |
| Medium | Review tab — photo + best guess + range, one-tap confirm/correct |
| Low | Review tab — flagged with *why* it's unsure (e.g. "maker's mark not visible"), so the user knows what to photograph next |

Low-value items (below a threshold, exact number TBD from Phase 0 pricing
data) get auto-bundled ("Kitchen lot," "Box of books") or routed to a
donation/disposal referral flow rather than listed individually — the unit
economics of individually listing a €4 item don't work at commission-per-
sale pricing.

### Themed bundling (refinement, Phase 2)

Generic bundles ("assorted books") undersell relative to themed clusters
("5 yoga books", "matching wine glass set of 6") — same items, but a
themed lot reads as curated rather than dumped, and commands a higher
price. Since triage already tags each item's category, a post-triage
clustering step (no extra AI call needed — grouping logic over existing
data) should group same-category/same-theme low-value items together
*before* falling back to a generic catch-all bundle for whatever doesn't
cluster. This is also what makes some low-value items worth listing at all
under commission pricing, rather than defaulting straight to donation — a
themed 5-book bundle can clear enough to be worth listing even though no
single book was. May need triage to capture slightly more specific
sub-theming per item (not just "books" but "yoga books") for the clustering
to be effective — worth testing once real triage data volume exists.

### Known limitation: hallucination on hard photos (dark/backlit/cluttered)

Phase 0 testing found the triage pass sometimes invents plausible-but-
absent items on genuinely hard photos (e.g. inferring a keyboard/monitor/
chair from seeing a PC tower, even when none are in frame). A prompt-only
fix (explicitly distinguishing "uncertain about details" from "uncertain
whether present at all") was tried and did not resolve it — the list got
longer, not shorter, on retest. This appears to be a general VLM
limitation under degraded image input, not something reliably fixable
with negative instructions alone.

Decision: rely on the existing Review-tab human-in-the-loop design as the
actual mitigation — nothing reaches a real listing without a human
confirming it, so a bad photo produces a noisy Review queue, not a wrong
listing. Do not sink further Phase 0 time into prompt iteration on this.

If this becomes a real problem at scale (e.g. Review-tab noise erodes user
trust), the right fix is a different layer: a lightweight photo-quality
pre-check (blur/darkness detection) that flags unusable photos and asks
the user to retake, before triage runs at all — addressing bad input at
the source rather than asking the model to be robust against it. Not
built — noted for Phase 2+ if needed.

## Monetization mechanism: split by platform enforceability, not one model everywhere

The original commission-per-item-sold model assumed we'd know when an item
sold. For platforms with no API (Kleinanzeigen), we don't — self-reporting
is the only signal, and it's unreliable (people forget, or under-report).
Rather than patch that with reminders, the mechanism itself should differ
by what each platform actually gives us:

- **eBay:** true commission-on-sale. eBay's API exposes real transaction/
  payment status, so a sale can be verified without depending on
  self-reporting. Commission is collected by charging the seller
  separately (via our own payment processor, e.g. Stripe — never by
  touching the buyer-seller payment itself) once a sale is confirmed,
  after a short buffer window to let early returns/cancellations resolve
  first, to avoid collecting on a sale that gets reversed.
- **Kleinanzeigen (and any other no-API platform):** charge upfront at
  listing confirmation instead — flat fee, or scaled to the AI's
  estimated value so it still feels proportional. Revenue no longer
  depends on the seller reporting a sale, because payment already
  happened before there's anything to misreport.

### Payment/liability boundary — precise version, not "we never touch payment"

Earlier framing overstated this. The accurate split:

- **Not a party to:** the buyer-seller transaction and payment for the
  item itself. That flows seller ↔ platform ↔ buyer entirely outside our
  systems. Item-not-as-described claims, non-delivery, payment fraud on
  the actual sale are the platform's Buyer/Seller Protection to resolve,
  not ours — this is the real liability shield, and it only holds because
  we genuinely never touch *that* payment.
- **Definitely a party to:** collecting our own commission/fee from the
  seller. That's a separate payment relationship with its own liability
  surface — chargeback risk on our fee (normal cost of doing business,
  handled by a real payment processor, not built in-house), and reversed-
  sale risk (mitigated by the buffer window above; needs an explicit
  refund policy for commission collected on a sale later reversed).
- **Softer point, not fully eliminable:** taking a cut of the sale (vs. a
  flat listing fee fully decoupled from outcome) gives a wronged buyer a
  more plausible, if not necessarily strong, argument that we have some
  stake in the transaction's legitimacy. Staying off the item-payment rail
  limits this but doesn't erase it the way a pure flat-fee model would.

This also resolves the disintermediation risk (seller negotiating a sale
off-platform to dodge commission): for Kleinanzeigen, it's moot, since
revenue was already collected at listing time. For eBay, the platform's
own closed messaging/payment system structurally discourages going
off-platform, and eBay enforces that far more effectively than we could.

## Marketplace scope: one platform per item (v1)

To avoid double-sale risk (an item selling on platform A while still live
on platform B, with no way to know without self-reporting), v1 restricts
each item to a single chosen platform at confirmation time, rather than
cross-posting the same item everywhere. Simple by construction, no sync
logic needed against platforms that give us nothing to sync against.

## Negotiation / buyer messaging

Chat/offer negotiation stays on the native platform — we notify ("new
message on your desk listing") but don't read or auto-respond to message
content. Considered auto-negotiating within a seller-set floor price, but
deferred: an AI agent autonomously committing to sales carries real
liability (tone, mistakes, unwanted auto-accepts) and there's no data yet
on how negotiations actually go on this product. The floor/minimum price
should be captured at the same moment the seller confirms the listing
price in the Review tab — one step, two purposes. The AI-suggested price
is never live without explicit human confirmation.

## Private vs. commercial seller status (Germany)

Item volume alone isn't the legal test — it's closer to regularity and
profit-orientation over time. A one-time clearance of a large inherited
household is generally still private disposal; the same account running
many large, unrelated clearances repeatedly looks commercial regardless of
any single project's size. Mitigation: cap items **per project**, not
per account lifetime, and separately watch for the "many large unrelated
projects, short time span" pattern as the real commercial-seller signal.
This is an operational safeguard, not a legal opinion — needs real legal
review before scaling past a handful of users.

## Fraud/duplicate-listing mitigation

Since every item originates from a real photo the user took (not stock
images or text descriptions), there's more signal available than a
typical listing tool has:
- Perceptual image hashing to flag near-duplicate photos reused across
  multiple "different" item submissions (catches faked volume).
- EXIF metadata checks — a fresh phone photo carries timestamp/camera
  data that downloaded/stock images typically lack.
- Volume + pacing per project — ties to the per-project cap above; a real
  household clearance has a plausible item count and submission cadence
  that a commercial dropshipping pattern would deviate from.

## Handover / pickup logistics

Deliberately out of scope — the seller coordinates viewing/pickup with
the buyer themselves via the platform, same as they would without this
app. Keeps the product positioned as a listing facilitator, not a full
marketplace, and limits liability exposure (no handover-dispute policies
to build or enforce).

## Unsold-item lifecycle

At ~2 weeks with no sale, notify the seller and prompt a choice: drop the
price, or route to the donation/disposal referral flow. Prevents
"confirm and forget" from silently becoming "confirm and it sits there
forever."

## eBay item specifics — a hard publish requirement, not just a nice-to-have

Discovered live while building the Sandbox test listing: eBay requires
category-specific "item specifics" (their term) to be present before an
offer can publish — e.g. the "Lamps" category rejected publish until both
`Type` and `Brand` were supplied. These requirements vary per category and
are enforced at publish time, not before.

This isn't a new problem for the pipeline — it's the SAME field our
`CATEGORY_ATTRIBUTES` map already tracks for pricing reasons (brand is
`high` price-impact for nearly every category we defined). What's new is
that brand (and category-specific fields like a lamp's "Type") are now
confirmed to ALSO be a hard eBay publish requirement, not just a pricing
signal.

Resolution used for the Sandbox test: eBay has a standard, recognized
value for genuinely unknown/generic brand — `"Unbranded"` — not a
workaround, this is eBay's own convention.

**Phase 1 implication:** the publish step needs to map unresolved
CATEGORY_ATTRIBUTES fields to valid eBay aspect values at publish time —
e.g. brand unresolved → send `"Unbranded"` to eBay's structured field,
while the human-facing listing description stays honest ("brand not
visible in photos"). Two representations of the same uncertainty for two
different audiences (the platform's structured data vs. the buyer's
readable description) — worth designing deliberately. Also implies the
pipeline should call eBay's Taxonomy API `get_item_aspects_for_category`
per category to know which fields are actually required before attempting
publish, rather than discovering missing fields one publish-rejection at
a time as this test script did.

## High-value items need a stronger "get another photo" push, not just a flag

Found live during Sandbox demo prep: the desk PC (real item: an AURUMPC
with a GTX 5080) got deep-pass'd at €300–900 with low confidence — an
honest, correctly-uncertain range given the GPU wasn't visible. But the
actual resale value is likely 4-5x the top of that range. The system
correctly detected the uncertainty; it just doesn't yet weight the
*consequence* of guessing wrong.

Current behavior: low confidence → routes to "needs review," same
treatment regardless of the item's potential value. A €10 item guessed
wrong barely matters; a potential €2,000+ item guessed wrong is a real
loss for the seller and for commission.

Proposed refinement (not built yet): when a low/medium-confidence item's
value range upper bound crosses some threshold, escalate the "needs
another photo" ask to be more insistent in the Review tab — e.g. don't
let it glide toward auto-approve or a quiet default price the way a
low-value uncertain item can. The infrastructure for this already
exists (confidence, valueRange, unresolvedAttributes) — this is a
routing/UX weighting change on top of data already being captured, not
new detection logic.

## Condition mapping simplified for demo reliability, not fully accurate yet

The publish route currently maps every non-"new" deep-pass condition to
eBay's `USED_EXCELLENT` value, regardless of whether the item was
actually assessed as good/fair/poor. This is a deliberate simplification,
not an oversight: different eBay categories accept different subsets of
condition values, and a guessed granular mapping (e.g. "fair" →
`USED_ACCEPTABLE`) failed live with "condition id is invalid for the
selected primary category" on a category it hadn't been tested against.
`USED_EXCELLENT` is the one value proven valid across two different
categories tested tonight (Lamps, PC Desktops) — safer to default to it
under demo time pressure than keep guessing at untested values.

Real fix, not urgent: look up which condition values a category actually
accepts (similar to how required aspects are already resolved
dynamically) rather than assuming one value works everywhere.

## Review tab v2 — real requirements from first hands-on use

Found live, using the actual UI for the first time end-to-end (the same
session that got the PC published via the button). This isn't polish —
it's a real gap between what was designed early in this project and what
the v1 UI actually built.

**Root cause of the confusion:** the deep pass only ever analyzes ONE
"focus item" per whole-room photo (documented Phase 0 limitation), but
triage correctly identifies many items per photo. The Review UI shows all
of them in the confidence buckets, but only the one focus item is
actually publishable — with no explanation why the rest aren't. This is
no longer just a known limitation to accept; it's actively blocking
usability. Real fix: per-item deep-pass, not per-photo. Every item above
the value/confidence threshold needs its OWN deep-pass call, own editable
fields, own publish action — not just whichever one item Sonnet happened
to focus on.

**Missing: an editable-fields form using data that already exists.**
`unresolvedAttributes` already specifies exactly which field is missing
per item and how to resolve it (photo vs. question) — but there's no UI
that lets a human actually act on that data. v2 needs: inline editable
fields for each unresolved attribute (e.g. brand, screen size), and a
"Recalculate estimate" action that only re-runs pricing when something
actually changed — not on every keystroke, to avoid wasteful API calls.

**Missing, and this one actually breaks an established principle: an
editable price field before publish.** Currently the publish button fires
with the AI's `suggestedPrice` directly — no review, no override. This
quietly violates the "nothing publishes without explicit human price
confirmation" principle set early in this project specifically because
that confirmation is what makes the SELLER, not the app, responsible for
the listing (see the liability/payment-boundary section above). v2 needs
a real price field, pre-filled with the AI's suggestion but always
user-overridable to ANY value, including an unrealistic one (e.g. €30,000
for something that won't sell at that price) — sanity-checking someone's
own asking price isn't the app's call to make.

**This connects directly to the `Listing` entity already in the schema**
(`packages/schema`) — `confirmedPrice`, `floorPrice`, the whole point of
splitting `Listing` from `IdentifiedItem` months... hours earlier
tonight, was to have exactly this human-confirmed layer. The current web
UI skips straight from deep-pass output to publish, bypassing the
`Listing` concept entirely. v2 should actually create a `Listing` record
at confirmation time, not just call eBay's API directly from raw
deep-pass data.

**Not built tonight, deliberately** — this is real, non-trivial work
(per-item deep-pass architecture, a proper edit/confirm form, wiring the
`Listing` entity through), and touching any of it hours before Saturday's
demo risks breaking what's currently working. Next priority after the
demo, not before it.

### Deep-pass trigger rule (resolved)

Not value tier alone — value UNCERTAINTY. A low-value, low-variance item
(a mug) doesn't need the expensive Sonnet call even if flagged; a
potentially high-value, high-variance item (a PC tower — could be €300 or
€2,500 depending on unseen specs) does, regardless of how "sure" triage
felt about the tier.

- Skip deep-pass automatically when triage's tier is low AND even the
  plausible upper bound stays under the existing bundle floor (~€20-30).
- Trigger deep-pass automatically based on category-level variance —
  reuse `CATEGORY_ATTRIBUTES`: categories with `high priceImpact` fields
  commonly unresolved from a photo (electronics, jewelry, art, tools) get
  it by default; categories that are typically narrow-band (books, basic
  furniture with no visible maker's mark) don't.
- Regardless of automatic tier, the SAME manual "add detail +
  recalculate" action stays available for every item — an auto-approved
  mug can still be manually escalated if the person wants to bother. One
  mechanism, not two separate systems for "auto" vs "manual" deep-pass.

### Confidence gating on publish (resolved, corrected) — visibility, not friction

First pass at this (an explicit affirmative confirmation step for
high-value + low-confidence items) was wrong, corrected after pushback:
it adds real friction specifically on the case where friction hurts most
— a high-value item is often the one the seller cares LEAST about
scrutinizing carefully, since they're mid-clearance and want it gone.
Forcing a click-through people don't want to engage with also rarely
produces genuine informed consent anyway — it just becomes "click past
without reading," costing adoption without reliably protecting anyone.
Ultimately it's the seller's call, same principle as the price field
itself — not the app's to gate.

Corrected decision: publish stays exactly as fast for every item,
regardless of confidence — no extra step, no gate, ever. Instead, spend
the effort on visibility: a wide value range on a potentially high-value
item gets a genuinely prominent visual treatment directly on the item
card already in view (not a separate screen or modal) — e.g. the range
itself calling out that a missing detail could change it substantially.
If the seller notices and cares, recalculating is one easy click away
(the same manual "add detail + recalculate" action from the deep-pass
scope decision above). If they don't, publishing costs nothing extra —
same one-click speed as any other item. The moment they review and
confirm a price at all is already the meaningful consent threshold; more
friction on top of that doesn't add real protection, just adoption cost.

### Recalculate step should be tiered too, not a flat Sonnet call

Two different jobs were being conflated: identifying an ambiguous item
from a photo (needs Sonnet) vs. pricing an item whose specifics are now
KNOWN because the user typed or confirmed them (doesn't). Recalculation
after a user adds detail is the second kind — much lighter.

Tiered plan:
1. Primary: real price-comp lookup (packages/pricing — eBay Browse API or
   similar) using the confirmed specifics. Real market data beats a model
   guess, costs no tokens, and isn't limited by a model's training cutoff
   on fast-moving categories (e.g. GPU pricing).
2. Fallback if comp data is thin: cheap text-only Haiku call using the
   confirmed facts — no image involved if the input was typed text, so
   not even using vision capability, just reasoning.
3. If the user adds a NEW PHOTO rather than typed text: still default to
   Haiku for narrow, well-defined reads (e.g. "read this GPU model off
   this close-up") — only escalate to Sonnet if that narrow read comes
   back low-confidence or genuinely ambiguous. Same two-tier philosophy
   already driving triage/deep-pass, extended one step further.

## Users for Ebay's APIS

Test user for the sandbox: TESTUSER_estate-app-sandbox
Pwd is the same as for my own account login (see screenshot in Yo Para Mi Whatsapp)
