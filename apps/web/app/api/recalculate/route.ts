import { config as loadEnv } from "dotenv";
loadEnv({ path: "../../.env" });

import Anthropic from "@anthropic-ai/sdk";
import { buildRecalculatePrompt, RECALCULATE_TOOL } from "@estate-app/ai-pipeline";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  try {
    const {
      category,
      subcategory,
      condition,
      currentValueRangeLow,
      currentValueRangeHigh,
      previouslyUnresolved,
      confirmedFields,
    } = await request.json();

    if (!confirmedFields || Object.keys(confirmedFields).length === 0) {
      return Response.json(
        { error: "No confirmed fields provided — nothing to recalculate." },
        { status: 400 }
      );
    }

    const factsList = Object.entries(confirmedFields)
      .map(([field, value]) => `- ${field}: ${value}`)
      .join("\n");

    const contextText = `Item: ${category}${subcategory ? ` (${subcategory})` : ""}, condition: ${condition}.

Previous estimate: €${currentValueRangeLow}–€${currentValueRangeHigh}.
Previously unresolved fields: ${
      Array.isArray(previouslyUnresolved) && previouslyUnresolved.length > 0
        ? previouslyUnresolved.map((u: any) => `${u.field} (${u.reason})`).join("; ")
        : "none listed"
    }

Newly confirmed facts:
${factsList}

Provide an updated estimate given this.`;

    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      system: buildRecalculatePrompt(),
      tools: [RECALCULATE_TOOL as any],
      tool_choice: { type: "tool", name: RECALCULATE_TOOL.name },
      messages: [{ role: "user", content: contextText }],
    });

    if (response.stop_reason === "max_tokens") {
      throw new Error("Recalculate response was truncated — hit token limit.");
    }

    const toolUse = response.content.find((b) => b.type === "tool_use");
    if (!toolUse || !("input" in toolUse)) {
      throw new Error("Model did not return a tool_use block as expected.");
    }

    return Response.json({ success: true, ...(toolUse.input as object) });
  } catch (err: any) {
    console.error("Recalculate error:", err);
    return Response.json(
      {
        error: err.message ?? "Unknown error",
        // Anthropic SDK errors often carry more useful detail than the
        // bare message — status code, error type, sometimes a nested
        // error object. Surface what's available instead of just the
        // generic top-level message.
        detail: {
          name: err.name,
          status: err.status,
          errorType: err.error?.error?.type ?? err.error?.type,
          errorMessage: err.error?.error?.message ?? err.error?.message,
        },
      },
      { status: 500 }
    );
  }
}
