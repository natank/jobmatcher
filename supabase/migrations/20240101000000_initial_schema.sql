-- Enable pgcrypto for UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table if not exists public.users (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  display_name text,
  plan        text not null default 'free',
  created_at  timestamptz not null default now()
);

create table if not exists public.github_profiles (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  login            text not null,
  access_token_enc text,
  profile_json     jsonb,
  fetched_at       timestamptz
);

create table if not exists public.resumes (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  version        int not null default 1,
  base_resume_id uuid references public.resumes(id) on delete set null,
  job_id         uuid,
  content        jsonb not null,
  status         text not null default 'draft',
  created_at     timestamptz not null default now()
);

create table if not exists public.jobs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  source     text,
  source_url text,
  parsed     jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fit_results (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null references public.users(id) on delete cascade,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  job_id    uuid not null references public.jobs(id) on delete cascade,
  result    jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  job_id       uuid not null references public.jobs(id) on delete cascade,
  status       text not null default 'pending',
  questions    jsonb,
  started_at   timestamptz,
  completed_at timestamptz
);

create table if not exists public.answers (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.interview_sessions(id) on delete cascade,
  question_index int not null,
  answer_text    text not null,
  feedback       jsonb
);

create table if not exists public.interview_summaries (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.interview_sessions(id) on delete cascade,
  summary    jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.usage_counters (
  user_id          uuid not null references public.users(id) on delete cascade,
  period           text not null,
  resumes_count    int not null default 0,
  interviews_count int not null default 0,
  primary key (user_id, period)
);

-- ============================================================
-- INDEXES
-- ============================================================

create index if not exists github_profiles_user_id_idx on public.github_profiles(user_id);
create index if not exists resumes_user_id_idx on public.resumes(user_id);
create index if not exists jobs_user_id_idx on public.jobs(user_id);
create index if not exists fit_results_user_id_idx on public.fit_results(user_id);
create index if not exists interview_sessions_user_id_idx on public.interview_sessions(user_id);
create index if not exists answers_session_id_idx on public.answers(session_id);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.users enable row level security;
alter table public.github_profiles enable row level security;
alter table public.resumes enable row level security;
alter table public.jobs enable row level security;
alter table public.fit_results enable row level security;
alter table public.interview_sessions enable row level security;
alter table public.answers enable row level security;
alter table public.interview_summaries enable row level security;
alter table public.usage_counters enable row level security;

-- users: own row only
create policy "users: own row" on public.users
  for all using (auth.uid() = id);

-- github_profiles: own rows only
create policy "github_profiles: own rows" on public.github_profiles
  for all using (auth.uid() = user_id);

-- resumes: own rows only
create policy "resumes: own rows" on public.resumes
  for all using (auth.uid() = user_id);

-- jobs: own rows only
create policy "jobs: own rows" on public.jobs
  for all using (auth.uid() = user_id);

-- fit_results: own rows only
create policy "fit_results: own rows" on public.fit_results
  for all using (auth.uid() = user_id);

-- interview_sessions: own rows only
create policy "interview_sessions: own rows" on public.interview_sessions
  for all using (auth.uid() = user_id);

-- answers: via session ownership
create policy "answers: own session rows" on public.answers
  for all using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = answers.session_id
        and s.user_id = auth.uid()
    )
  );

-- interview_summaries: via session ownership
create policy "interview_summaries: own session rows" on public.interview_summaries
  for all using (
    exists (
      select 1 from public.interview_sessions s
      where s.id = interview_summaries.session_id
        and s.user_id = auth.uid()
    )
  );

-- usage_counters: own rows only
create policy "usage_counters: own rows" on public.usage_counters
  for all using (auth.uid() = user_id);

-- ============================================================
-- AUTO-CREATE USER PROFILE ON AUTH SIGN-UP
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'user_name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
