// Per-token cost in USD (as of initial M4 implementation; update as pricing changes).
// Prices are expressed per 1 million tokens.
const PRICING: Record<string, { inputPer1M: number; outputPer1M: number }> = {
  "claude-sonnet-4-5": { inputPer1M: 3.0, outputPer1M: 15.0 },
  "claude-haiku-3-5": { inputPer1M: 0.8, outputPer1M: 4.0 },
};

/**
 * Estimates the cost in USD for a single Claude API call.
 * Returns 0 if the model is not in the pricing table.
 */
export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return (
    (inputTokens / 1_000_000) * pricing.inputPer1M +
    (outputTokens / 1_000_000) * pricing.outputPer1M
  );
}
