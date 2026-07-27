/**
 * Tool definition that forces the triage pass to return structured JSON
 * matching TriageResult[], instead of a markdown table we'd have to
 * regex-scrape. Passed as `tools: [TRIAGE_TOOL]` with
 * `tool_choice: { type: "tool", name: TRIAGE_TOOL.name }` to force its use.
 */
export const TRIAGE_TOOL = {
  name: "record_triage_items",
  description:
    "Record every distinct sellable item identified in this photo during triage.",
  input_schema: {
    type: "object" as const,
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            itemName: { type: "string", description: "Short name of the item" },
            category: {
              type: "string",
              description:
                "Category, ideally matching one of: electronics, furniture, appliances, jewelryAndWatches, artAndAntiques, musicalInstruments, collectibles, toolsAndEquipment — or a more specific sub-theme where useful (e.g. 'yoga books' rather than just 'books', to support later thematic bundling).",
            },
            valueTier: { type: "string", enum: ["high", "medium", "low"] },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
            uncertaintyReason: {
              type: "string",
              description: "Only include if confidence is not 'high'.",
            },
          },
          required: ["itemName", "category", "valueTier", "confidence"],
        },
      },
    },
    required: ["items"],
  },
} as const;
