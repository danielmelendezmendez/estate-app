/**
 * Tool for the recalculate step — deliberately lightweight compared to
 * the deep-pass tool. This runs on Haiku, text-only (no image), per the
 * tiering decision in docs/architecture.md: once specifics are confirmed
 * by the user rather than inferred from a photo, pricing them doesn't
 * need Sonnet's vision/reasoning power.
 *
 * NOTE: the ideal primary path here is a real price-comp lookup
 * (packages/pricing — eBay Browse API or similar), not a model guess at
 * all. That's still a stub (data source not yet chosen — see
 * docs/architecture.md). This tool is the fallback tier, used directly
 * for now since the primary tier isn't built yet — swap in the real
 * lookup as the first attempt once it exists, keeping this as the
 * fallback when comp data is thin.
 */
export const RECALCULATE_TOOL = {
  name: "record_recalculated_estimate",
  description:
    "Record an updated resale value estimate given newly confirmed item specifics.",
  input_schema: {
    type: "object" as const,
    properties: {
      valueRangeLow: { type: "number" },
      valueRangeHigh: { type: "number" },
      suggestedPrice: { type: "number" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      unresolvedAttributes: {
        type: "array",
        description:
          "Fields still unresolved after accounting for the newly confirmed facts — empty array if everything relevant is now known.",
        items: {
          type: "object",
          properties: {
            field: { type: "string" },
            reason: { type: "string" },
            resolution: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    type: { const: "photo" },
                    angleHint: { type: "string" },
                  },
                  required: ["type", "angleHint"],
                },
                {
                  type: "object",
                  properties: {
                    type: { const: "question" },
                    prompt: { type: "string" },
                  },
                  required: ["type", "prompt"],
                },
              ],
            },
          },
          required: ["field", "reason", "resolution"],
        },
      },
    },
    required: ["valueRangeLow", "valueRangeHigh", "suggestedPrice", "confidence", "unresolvedAttributes"],
  },
} as const;
