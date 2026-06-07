import { z } from "zod";

export const ResumeContentSchema = z.object({
  summary: z.string(),
  skills: z.array(z.string()),
  experience: z.array(
    z.object({
      project: z.string(),
      url: z.string().optional(),
      bullets: z.array(z.string()),
      technologies: z.array(z.string()),
      period: z.string().optional(),
    })
  ),
  education: z
    .array(
      z.object({
        institution: z.string(),
        degree: z.string(),
        year: z.string().optional(),
      })
    )
    .optional(),
});

export type ResumeContent = z.infer<typeof ResumeContentSchema>;
