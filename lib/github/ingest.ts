import {
  fetchUser,
  fetchRepos,
  fetchLanguages,
  fetchCommits,
  fetchReadme,
  type ETagCache,
} from "./client";
import { computeSignalScore } from "./scoring";
import { GitHubProfileSchema, type GitHubProfile } from "@/types/github";

const MAX_REPOS = 100;
const TOP_REPOS = 20;
const CONCURRENCY = 5;

async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

interface IntermediateRepo {
  name: string;
  url: string;
  description: string | null;
  primary_language: string | null;
  languages: { name: string; percent: number }[];
  rawLangBytes: Record<string, number>;
  stars: number;
  topics: string[];
  authored_commits: number;
  first_commit_at: string | null;
  last_commit_at: string | null;
  readme_excerpt: string;
  signal_score: number;
}

export async function ingest(token: string, targetLanguages?: string[]): Promise<GitHubProfile> {
  const cache: ETagCache = new Map();

  const user = await fetchUser(token, cache);
  const allRepos = await fetchRepos(token, cache);

  const repos = allRepos.slice(0, MAX_REPOS);

  const processed = await pMap(
    repos,
    async (repo): Promise<IntermediateRepo | null> => {
      const commits = await fetchCommits(token, user.login, repo.name, user.login, cache);

      if (repo.fork && commits.length === 0) return null;
      if (commits.length === 0) return null;

      const [rawLangBytes, readme] = await Promise.all([
        fetchLanguages(token, user.login, repo.name, cache),
        fetchReadme(token, user.login, repo.name, cache),
      ]);

      const totalBytes = Object.values(rawLangBytes).reduce((a, b) => a + b, 0);
      const languages = Object.entries(rawLangBytes).map(([name, bytes]) => ({
        name,
        percent: totalBytes > 0 ? (bytes / totalBytes) * 100 : 0,
      }));

      const sortedAsc = commits.slice().sort((a, b) => {
        const dateA = new Date(a.commit.author?.date ?? a.commit.committer?.date ?? 0).getTime();
        const dateB = new Date(b.commit.author?.date ?? b.commit.committer?.date ?? 0).getTime();
        return dateA - dateB;
      });

      const firstCommitAt =
        sortedAsc[0]?.commit.author?.date ?? sortedAsc[0]?.commit.committer?.date ?? null;
      const lastCommitAt =
        sortedAsc[sortedAsc.length - 1]?.commit.author?.date ??
        sortedAsc[sortedAsc.length - 1]?.commit.committer?.date ??
        null;

      const signal_score = computeSignalScore(
        {
          primary_language: repo.language,
          languages,
          stars: repo.stargazers_count,
          authored_commits: commits.length,
          last_commit_at: lastCommitAt,
          readme_excerpt: readme,
        },
        user.login,
        targetLanguages
      );

      return {
        name: repo.name,
        url: repo.html_url,
        description: repo.description,
        primary_language: repo.language,
        languages,
        rawLangBytes,
        stars: repo.stargazers_count,
        topics: repo.topics ?? [],
        authored_commits: commits.length,
        first_commit_at: firstCommitAt,
        last_commit_at: lastCommitAt,
        readme_excerpt: readme,
        signal_score,
      };
    },
    CONCURRENCY
  );

  const filtered = processed.filter((r): r is IntermediateRepo => r !== null);

  const langTotals = new Map<string, number>();
  for (const repo of filtered) {
    for (const [name, bytes] of Object.entries(repo.rawLangBytes)) {
      langTotals.set(name, (langTotals.get(name) ?? 0) + bytes);
    }
  }

  const totalLangBytes = Array.from(langTotals.values()).reduce((a, b) => a + b, 0);
  const aggregatedLanguages = Array.from(langTotals.entries())
    .map(([name, bytes]) => ({
      name,
      bytes,
      percent: totalLangBytes > 0 ? (bytes / totalLangBytes) * 100 : 0,
    }))
    .sort((a, b) => b.bytes - a.bytes);

  const topRepos = filtered
    .sort((a, b) => b.signal_score - a.signal_score)
    .slice(0, TOP_REPOS)
    .map(({ rawLangBytes: _raw, ...rest }) => rest);

  const profile = {
    login: user.login,
    name: user.name ?? user.login,
    fetched_at: new Date().toISOString(),
    languages: aggregatedLanguages,
    repos: topRepos,
  };

  return GitHubProfileSchema.parse(profile);
}
