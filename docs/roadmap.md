# Roadmap

Sequenced to retire the biggest unknowns first, cheaply, before investing in
anything that depends on them.

**v1 launch strategy: eBay only.** Every hard problem this project hit
during design (sale verification, commission collection, fraud/duplicate
detection, buyer-seller liability, negotiation handling) had a clean
answer on eBay because its API gives real transaction data — and no clean
answer on Kleinanzeigen, because it doesn't. Rather than build both at
once and inherit Kleinanzeigen's unresolved trust gaps into v1, prove the
core AI/listing/review loop on eBay first — commission-on-sale as
originally intended, collected via a lightweight invoice/payment-link
flow (not a fully automated billing pipeline — that's premature before
the core product is validated). Kleinanzeigen becomes a fast-follow once
the pipeline and UX are proven, using the paced-automation design already
documented in docs/architecture.md.

## Phase 0 — De-risk (current phase)
- [x] Prototype browser extension against a real Kleinanzeigen listing form —
      can we detect + reliably fill every required field? YES — validated
      live against the real form (see docs/architecture.md). Real selectors
      required inspecting the live page; none of the initial guesses were
      right. Also confirmed content scripts run in an isolated JS world,
      relevant for the queue/background-worker design in Phase 3 (Kleinanzeigen,
      deferred — see v1 launch strategy above).
- [ ] Run ~100 real test photos through the AI pipeline by hand; check
      identification accuracy and whether Haiku triage decisions agree with
      Sonnet deep-pass decisions often enough to justify the two-tier design
- [ ] Confirm eBay Browse API is usable as the price-comp data source for v1
      (no longer "eBay or alternative" — eBay is the only marketplace in
      scope for v1, so this is now a direct check, not an open-ended search)
- [x] Submit eBay developer application — APPROVED. Sandbox keyset created,
      Application access token (client_credentials) validated live, and
      the full User access token flow (RuName setup, OAuth consent via a
      Sandbox test user, authorization code exchange) also validated live
      end-to-end — this is the token that can actually create listings on
      a seller's behalf. Real gotchas hit along the way, worth knowing for
      next time: the authorization code is short-lived (~5 min) and
      single-use; it must be percent-decoded before exchanging (pasting
      it raw from the browser address bar double-encodes otherwise); Dev
      ID is unused for this OAuth flow entirely (only relevant to eBay's
      legacy Trading API).

## Phase 1 — Core AI pipeline (no UI yet)
- [ ] Finalize item output schema (identification, confidence score, value
      range, category) — informed by real Phase 0 data
- [ ] Ingestion: photo upload → storage → triage pass (Haiku) → deep pass
      (Sonnet) → structured output
- [ ] Price-comp lookup as a standalone service (bulk + single-item modes)

## Phase 2 — Review & listing generation
- [ ] Review tab v2 — per-item deep-pass (not one focus item per photo),
      editable unresolved-attribute fields + "Recalculate estimate"
      action, editable/overridable price field before publish, actually
      creates a `Listing` record at confirmation rather than publishing
      straight from raw deep-pass data. Real requirements captured in
      docs/architecture.md from first hands-on use of the v1 UI — next
      priority after the Saturday demo, not before it.
- [ ] Review tab: photo + identification + confidence + value range;
      routing (auto-approve / needs review / needs another photo)
- [ ] Manual entry + quick search
- [ ] Listing generation (title/description/price per marketplace format)

## Phase 3 — Publishing (eBay only for v1)
- [ ] eBay API integration — fully automated publish on confirmation, no
      human click needed beyond confirming item/price
- [ ] Kleinanzeigen publishing (queue + background service worker, paced
      automation) — DEFERRED to a fast-follow after v1 validates on eBay,
      not built alongside it. Design already documented in
      docs/architecture.md so it's ready to pick up when the time comes.

## Phase 4 — Commerce loop
- [ ] Sale self-confirmation + reminder nudges
- [ ] Commission calculation, collected via a lightweight invoice/payment-link
      flow for v1 (e.g. Stripe Payment Links) — not a fully automated
      charge-on-detection billing pipeline; that's worth building only once
      commission volume justifies the engineering investment
- [ ] Progress dashboard

## Phase 5 — Growth layer
- [ ] Donation/disposal referral partnerships
- [ ] Paid photographer upsell
- [ ] Read-only share links for other heirs

## Phase 6 — Scale
- [ ] Austria/Switzerland marketplace variants
- [ ] Native mobile app (deliberately last — web/CLI prototypes are faster
      to iterate on while the pipeline underneath is still changing)
- [ ] Cost optimization, polish

## Explicitly out of scope
- Heir/proceeds-splitting — a single designated person owns each project;
  how proceeds get divided is not this app's problem.
- Server-side/headless automation of marketplace posting — deliberately
  not pursued (see docs/architecture.md); browser-extension-based paced
  automation is the current approach for Kleinanzeigen.
