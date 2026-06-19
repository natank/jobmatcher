import { z } from "zod";

export const GapSchema = z.object({
  skill: z.string(),
  severity: z.enum(["high", "medium", "low"]),
  suggestion: z.string(),
});

export const FitResultSchema = z.object({
  score: z.number().int().min(1).max(5),
  coverage: z.number().min(0).max(1),
  ai_quality: z.number().min(0).max(1),
  matched_required: z.array(z.string()),
  missing_required: z.array(z.string()),
  matched_preferred: z.array(z.string()),
  gaps: z.array(GapSchema),
  rationale: z.string(),
});

export type Gap = z.infer<typeof GapSchema>;
export type FitResult = z.infer<typeof FitResultSchema>;
