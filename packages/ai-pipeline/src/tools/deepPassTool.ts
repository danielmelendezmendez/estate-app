/**
 * Tool definition that forces the deep pass to return structured JSON
 * matching DeepPassResult, instead of the free-text draft-listing prose
 * we were parsing by hand.
 */
export const DEEP_PASS_TOOL = {
  name: "record_deep_pass_result",
  description:
    "Record the detailed identification, condition, pricing, and listing draft for a single item.",
  input_schema: {
    type: "object" as const,
    properties: {
      brand: { type: "string" },
      model: { type: "string" },
      category: { type: "string" },
      subcategory: { type: "string" },
      condition: {
        type: "string",
        enum: ["new", "like-new", "good", "fair", "poor"],
      },
      conditionReason: { type: "string" },
      confidence: { type: "string", enum: ["high", "medium", "low"] },
      unresolvedAttributes: {
        type: "array",
        description:
          "Specific price-relevant fields that couldn't be confidently determined, each with how to resolve it.",
        items: {
          type: "object",
          properties: {
            field: {
              type: "string",
              description:
                "Field name, matching CATEGORY_ATTRIBUTES for this category where applicable (e.g. 'sizeOrCapacity', 'brand').",
            },
            reason: { type: "string" },
            resolution: {
              anyOf: [
                {
                  type: "object",
                  properties: {
                    type: { const: "photo" },
                    angleHint: {
                      type: "string",
                      description: "Exactly where/what to photograph.",
                    },
                  },
                  required: ["type", "angleHint"],
                },
                {
                  type: "object",
                  properties: {
                    type: { const: "question" },
                    prompt: {
                      type: "string",
                      description: "Exact question to show the user.",
                    },
                  },
                  required: ["type", "prompt"],
                },
              ],
            },
          },
          required: ["field", "reason", "resolution"],
        },
      },
      valueRangeLow: { type: "number" },
      valueRangeHigh: { type: "number" },
      listingTitle: { type: "string" },
      listingDescription: { type: "string" },
      suggestedPrice: { type: "number" },
    },
    required: [
      "category",
      "condition",
      "conditionReason",
      "confidence",
      "unresolvedAttributes",
      "valueRangeLow",
      "valueRangeHigh",
      "listingTitle",
      "listingDescription",
      "suggestedPrice",
    ],
  },
} as const;

/**
 * Batched variant — analyzes MULTIPLE items from one photo in a single
 * call, instead of one call per item. This is the cost-efficient default
 * (pays the image-token cost once, not N times) chosen over per-item
 * repeat calls after weighing the cost/reliability trade-offs — see
 * docs/architecture.md. Falls back to targeted per-item calls (see
 * buildTargetedDeepPassPrompt) only for items that come out shallow or
 * low-confidence from this batched pass.
 */
export const BATCHED_DEEP_PASS_TOOL = {
  name: "record_batched_deep_pass_results",
  description:
    "Record detailed identification, condition, pricing, and listing drafts for MULTIPLE items in this photo — one entry per item provided in the prompt.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        description: "One result per item listed in the prompt, in the same order, each with itemName matching exactly.",
        items: {
          type: "object",
          properties: {
            itemName: {
              type: "string",
              description: "Must exactly match the item name/description given in the prompt — used to correlate this result back to the right triage item.",
            },
            brand: { type: "string" },
            model: { type: "string" },
            category: { type: "string" },
            subcategory: { type: "string" },
            condition: {
              type: "string",
              enum: ["new", "like-new", "good", "fair", "poor"],
            },
            conditionReason: { type: "string" },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            unresolvedAttributes: {
              type: "array",
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
            valueRangeLow: { type: "number" },
            valueRangeHigh: { type: "number" },
            listingTitle: { type: "string" },
            listingDescription: { type: "string" },
            suggestedPrice: { type: "number" },
          },
          required: [
            "itemName",
            "category",
            "condition",
            "conditionReason",
            "confidence",
            "unresolvedAttributes",
            "valueRangeLow",
            "valueRangeHigh",
            "listingTitle",
            "listingDescription",
            "suggestedPrice",
          ],
        },
      },
    },
    required: ["items"],
  },
} as const;
