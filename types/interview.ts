import { z } from "zod";

export const QuestionTypeSchema = z.enum(["technical", "job", "behavioral"]);

export const QuestionSchema = z.object({
  index: z.number().int().min(0).max(4),
  text: z.string(),
  type: QuestionTypeSchema,
  repo_ref: z.string().nullable(),
});

export const SessionStatusSchema = z.enum(["active", "completed", "abandoned"]);

export const InterviewSessionSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid().optional(),
  job_id: z.string().uuid(),
  status: SessionStatusSchema,
  questions: z.array(QuestionSchema).length(5),
  started_at: z.string().optional(),
  completed_at: z.string().nullable().optional(),
});

export type QuestionType = z.infer<typeof QuestionTypeSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type SessionStatus = z.infer<typeof SessionStatusSchema>;
export type InterviewSession = z.infer<typeof InterviewSessionSchema>;
