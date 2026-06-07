const GITHUB_API = "https://api.github.com";
const README_MAX_BYTES = 4 * 1024;

export class GitHubApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly url: string
  ) {
    super(`GitHub API error ${status} for ${url}`);
    this.name = "GitHubApiError";
  }
}

export class GitHubRateLimitError extends Error {
  constructor(public readonly retryAfter: number) {
    super(`GitHub rate limit exceeded. Retry after ${retryAfter}s`);
    this.name = "GitHubRateLimitError";
  }
}

export interface GitHubUser {
  login: string;
  name: string | null;
}

export interface GitHubRepo {
  name: string;
  html_url: string;
  description: string | null;
  fork: boolean;
  language: string | null;
  stargazers_count: number;
  topics: string[];
  pushed_at: string;
}

export interface GitHubCommit {
  commit: {
    author: { date: string | null } | null;
    committer: { date: string | null } | null;
  };
}

type ETagEntry = { etag: string; data: unknown };
export type ETagCache = Map<string, ETagEntry>;

async function githubFetch<T>(url: string, token: string, cache?: ETagCache): Promise<T | null> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  const cached = cache?.get(url) as { etag: string; data: T } | undefined;
  if (cached?.etag) {
    headers["If-None-Match"] = cached.etag;
  }

  const res = await fetch(url, { headers });

  if (res.status === 304 && cached) {
    return cached.data;
  }

  if (res.status === 404) {
    return null;
  }

  if (res.status === 403 || res.status === 429) {
    const retryAfter = Number(res.headers.get("Retry-After") ?? "60");
    throw new GitHubRateLimitError(retryAfter);
  }

  if (!res.ok) {
    throw new GitHubApiError(res.status, url);
  }

  const data = (await res.json()) as T;
  const etag = res.headers.get("etag");
  if (etag && cache) {
    cache.set(url, { etag, data });
  }
  return data;
}

export async function fetchUser(token: string, cache?: ETagCache): Promise<GitHubUser> {
  const user = await githubFetch<GitHubUser>(`${GITHUB_API}/user`, token, cache);
  if (!user) throw new GitHubApiError(404, `${GITHUB_API}/user`);
  return user;
}

export async function fetchRepos(token: string, cache?: ETagCache): Promise<GitHubRepo[]> {
  const repos = await githubFetch<GitHubRepo[]>(
    `${GITHUB_API}/user/repos?type=owner&sort=pushed&per_page=100`,
    token,
    cache
  );
  return repos ?? [];
}

export async function fetchLanguages(
  token: string,
  owner: string,
  repo: string,
  cache?: ETagCache
): Promise<Record<string, number>> {
  const langs = await githubFetch<Record<string, number>>(
    `${GITHUB_API}/repos/${owner}/${repo}/languages`,
    token,
    cache
  );
  return langs ?? {};
}

export async function fetchCommits(
  token: string,
  owner: string,
  repo: string,
  author: string,
  cache?: ETagCache
): Promise<GitHubCommit[]> {
  const commits = await githubFetch<GitHubCommit[]>(
    `${GITHUB_API}/repos/${owner}/${repo}/commits?author=${encodeURIComponent(author)}&per_page=100`,
    token,
    cache
  );
  return commits ?? [];
}

export async function fetchReadme(
  token: string,
  owner: string,
  repo: string,
  cache?: ETagCache
): Promise<string> {
  const raw = await githubFetch<{ content: string; encoding: string }>(
    `${GITHUB_API}/repos/${owner}/${repo}/readme`,
    token,
    cache
  );

  if (!raw) return "";

  const decoded =
    raw.encoding === "base64"
      ? Buffer.from(raw.content.replace(/\n/g, ""), "base64").toString("utf-8")
      : raw.content;

  return decoded.slice(0, README_MAX_BYTES);
}
