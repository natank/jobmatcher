import { z } from "zod";

export const JobPostingSchema = z.object({
  id: z.string().uuid().optional(),
  source: z.enum(["url", "text"]),
  source_url: z.string().url().nullable().optional(),
  title: z.string(),
  company: z.string().nullable().optional(),
  seniority: z.enum(["junior", "mid", "senior", "lead", "unknown"]),
  required_skills: z.array(z.string()).max(30),
  preferred_skills: z.array(z.string()).max(30),
  responsibilities: z.array(z.string()),
  keywords: z.array(z.string()).max(30),
  raw_text: z.string().max(12_000),
});

export type JobPosting = z.infer<typeof JobPostingSchema>;
