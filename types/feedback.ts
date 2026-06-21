import { z } from "zod";

export const AnswerFeedbackSchema = z.object({
  relevance: z.number().int().min(1).max(5),
  depth: z.number().int().min(1).max(5),
  clarity: z.number().int().min(1).max(5),
  overall: z.number().int().min(1).max(5),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  model_answer_hint: z.string(),
});

export const ReadinessSchema = z.enum(["low", "moderate", "high"]);

export const InterviewSummarySchema = z.object({
  session_id: z.string().uuid().optional(),
  avg_relevance: z.number().min(0).max(5),
  avg_depth: z.number().min(0).max(5),
  avg_clarity: z.number().min(0).max(5),
  overall_score: z.number().int().min(1).max(5),
  top_strengths: z.array(z.string()),
  key_gaps: z.array(z.string()),
  recommended_actions: z.array(z.string()),
  readiness: ReadinessSchema,
});

export type AnswerFeedback = z.infer<typeof AnswerFeedbackSchema>;
export type Readiness = z.infer<typeof ReadinessSchema>;
export type InterviewSummary = z.infer<typeof InterviewSummarySchema>;
