/**
 * Prompt for the recalculate step. Text-only by design (see
 * recalculateTool.ts for the full reasoning) — no image involved when the
 * new information is typed facts, not a new photo.
 */
export function buildRecalculatePrompt(): string {
  return `You are re-estimating the resale value of a household item for the DACH secondhand market, given specifics the seller has just confirmed — you are not looking at a photo, only the facts provided.

Use the previous estimate and previously-unresolved fields as context, and the newly confirmed facts to update the estimate:
- If the newly confirmed facts resolve what was previously uncertain, narrow the value range accordingly and raise confidence.
- If some previously-unresolved fields are still not confirmed, keep the range appropriately wide for what remains unknown, and list those fields again in unresolvedAttributes with a resolution.
- Do not invent facts that weren't provided — if something is still genuinely unknown, say so rather than guessing.

Respond only in the requested structured format, no preamble.`;
}
