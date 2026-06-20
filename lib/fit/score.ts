import { canonicalizeSkills } from "@/lib/jobs/canonicalize";
import type { ResumeContent } from "@/types/resume";

export interface CoverageResult {
  coverage: number;
  matched_required: string[];
  missing_required: string[];
  matched_preferred: string[];
}

const SENIORITY_ORDER: Record<string, number> = {
  junior: 0,
  mid: 1,
  senior: 2,
  lead: 3,
};

function seniorityMatch(jobSeniority: string, resumeSeniority?: string): number {
  if (!resumeSeniority || resumeSeniority === "unknown") return 0.5;
  const jobLevel = SENIORITY_ORDER[jobSeniority];
  const resumeLevel = SENIORITY_ORDER[resumeSeniority];
  if (jobLevel === undefined || resumeLevel === undefined) return 0.5;
  const diff = Math.abs(jobLevel - resumeLevel);
  if (diff === 0) return 1;
  if (diff === 1) return 0.5;
  return 0;
}

export function computeCoverage(
  resumeSkills: string[],
  resumeTech: string[],
  jobRequired: string[],
  jobPreferred: string[],
  seniority: string,
  resumeSeniority?: string
): CoverageResult & { coverage: number } {
  const allResumeSkills = new Set(canonicalizeSkills([...resumeSkills, ...resumeTech]));

  const canonicalRequired = canonicalizeSkills(jobRequired);
  const canonicalPreferred = canonicalizeSkills(jobPreferred);

  const matched_required = canonicalRequired.filter((s) => allResumeSkills.has(s));
  const missing_required = canonicalRequired.filter((s) => !allResumeSkills.has(s));
  const matched_preferred = canonicalPreferred.filter((s) => allResumeSkills.has(s));

  const required_coverage =
    canonicalRequired.length > 0 ? matched_required.length / canonicalRequired.length : 0;

  const preferred_coverage =
    canonicalPreferred.length > 0 ? matched_preferred.length / canonicalPreferred.length : 0;

  const seniority_score = seniorityMatch(seniority, resumeSeniority);

  const coverage = 0.6 * required_coverage + 0.25 * preferred_coverage + 0.15 * seniority_score;

  return {
    coverage,
    matched_required,
    missing_required,
    matched_preferred,
  };
}

export function combinedScore(coverage: number, aiQuality: number): number {
  const raw = 0.7 * coverage + 0.3 * aiQuality;
  return Math.min(5, Math.max(1, Math.round(1 + raw * 4)));
}

/** Collect all canonical skills from a ResumeContent object. */
export function collectResumeSkills(resume: ResumeContent): {
  skills: string[];
  tech: string[];
} {
  const skills = resume.skills ?? [];
  const tech = (resume.experience ?? []).flatMap((e) => e.technologies ?? []);
  return { skills, tech };
}
