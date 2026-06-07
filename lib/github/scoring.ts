interface ScoringRepo {
  primary_language: string | null;
  languages: { name: string; percent: number }[];
  stars: number;
  authored_commits: number;
  last_commit_at: string | null;
  readme_excerpt: string;
}

export function computeSignalScore(
  repo: ScoringRepo,
  _userLogin: string,
  targetLanguages?: string[]
): number {
  const recencyFactor = computeRecencyFactor(repo.last_commit_at);
  const commitVolume = computeCommitVolume(repo.authored_commits);
  const languageWeight = computeLanguageWeight(repo, targetLanguages);
  const readmeQuality = computeReadmeQuality(repo.readme_excerpt);
  const popularity = computePopularity(repo.stars);

  return (
    0.3 * recencyFactor +
    0.25 * commitVolume +
    0.2 * languageWeight +
    0.15 * readmeQuality +
    0.1 * popularity
  );
}

function computeRecencyFactor(lastCommitAt: string | null): number {
  if (!lastCommitAt) return 0;
  const daysSincePush = (Date.now() - new Date(lastCommitAt).getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp((-Math.LN2 * daysSincePush) / 180);
}

function computeCommitVolume(authoredCommits: number): number {
  return Math.min(Math.log1p(authoredCommits) / Math.log1p(100), 1);
}

function computeLanguageWeight(repo: ScoringRepo, targetLanguages?: string[]): number {
  if (!repo.languages.length) return 0;

  if (targetLanguages && targetLanguages.length > 0) {
    const targetSet = new Set(targetLanguages.map((l) => l.toLowerCase()));
    return Math.min(
      repo.languages
        .filter((l) => targetSet.has(l.name.toLowerCase()))
        .reduce((sum, l) => sum + l.percent / 100, 0),
      1
    );
  }

  const primary = repo.languages.find((l) => l.name === repo.primary_language);
  return primary ? primary.percent / 100 : 0;
}

function computeReadmeQuality(readme: string): number {
  if (!readme) return 0;
  const hasLength = readme.length > 200 ? 1 : 0;
  const hasHeadings = /^#{1,6}\s/m.test(readme) ? 1 : 0;
  const hasCodeBlocks = /```/.test(readme) ? 1 : 0;
  return (hasLength + hasHeadings + hasCodeBlocks) / 3;
}

function computePopularity(stars: number): number {
  return Math.min(Math.log1p(stars) / Math.log1p(1000), 1);
}
