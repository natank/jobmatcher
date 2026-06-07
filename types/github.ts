import { z } from "zod";

export const GitHubProfileSchema = z.object({
  login: z.string(),
  name: z.string(),
  fetched_at: z.string().datetime(),
  languages: z.array(z.object({ name: z.string(), bytes: z.number(), percent: z.number() })),
  repos: z.array(
    z.object({
      name: z.string(),
      url: z.string(),
      description: z.string().nullable(),
      primary_language: z.string().nullable(),
      languages: z.array(z.object({ name: z.string(), percent: z.number() })),
      stars: z.number(),
      topics: z.array(z.string()),
      authored_commits: z.number(),
      first_commit_at: z.string().nullable(),
      last_commit_at: z.string().nullable(),
      readme_excerpt: z.string(),
      signal_score: z.number(),
    })
  ),
});

export type GitHubProfile = z.infer<typeof GitHubProfileSchema>;
