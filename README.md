# Estate Liquidation App (working name)

AI-assisted photo-to-listing app for estate clearance and fast moves across
DACH (Germany, Austria, Switzerland). Point a camera at a house full of
things; the app triages what's worth selling, drafts marketplace listings,
and hands off to an assisted (human-in-the-loop) publishing flow.

See `docs/roadmap.md` for the phased build plan and `docs/architecture.md`
for the technical decisions and why they were made.

## Current phase

**Phase 0 — de-risking.** Nothing here is production code yet. The goal
right now is to answer three questions as cheaply as possible:

1. Can we reliably detect + confidence-score items from photos, and does a
   cheap model (Haiku) agree with an expensive one (Sonnet) often enough to
   justify a two-tier pipeline? → `apps/phase0-cli`
2. Can a browser extension reliably fill a Kleinanzeigen listing form? →
   `apps/extension`
3. Is there a usable price-comp data source? → `packages/pricing`

Nothing downstream of these three (mobile app, review UI, publishing
pipeline, commerce/commission logic) gets built until they're answered.

## Repo layout

```
estate-app/
├── docs/                  Roadmap, architecture decisions, research notes
├── packages/
│   ├── schema/            Shared TypeScript types (Item, Confidence, ValueRange, ...)
│   ├── ai-pipeline/       Triage pass + deep pass logic, prompts
│   └── pricing/           Price-comp lookup (bulk + single-item "quick search")
└── apps/
    ├── phase0-cli/        Standalone script: run test photos through the AI, report accuracy
    ├── extension/         Browser extension prototype (Kleinanzeigen form-fill)
    └── web/                (placeholder) web MVP upload form — comes after Phase 0
```

Native mobile app is deliberately not scaffolded yet — see `docs/roadmap.md`
for why (Phase 6, not Phase 0).

## Stack

- TypeScript everywhere (shared types between pipeline, extension, and
  eventual web/mobile clients)
- pnpm workspaces (monorepo, no need for anything heavier yet)
- Claude API (Haiku 4.5 for triage, Sonnet 5 for deep pass) — see
  `docs/architecture.md` for the cost reasoning
- Cloudflare R2 (object storage) + Workers, Supabase/Neon (Postgres) — for
  when we get past Phase 0

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in your Anthropic API key
pnpm --filter phase0-cli dev
```
