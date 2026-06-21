import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/usage");
vi.mock("@/lib/db/user");

import { checkUsageLimit, PLAN_LIMITS } from "./limits";
import * as dbUsage from "@/lib/db/usage";
import * as dbUser from "@/lib/db/user";
import type { TypedSupabaseClient } from "@/lib/db/client";

const mockSupabase = {} as TypedSupabaseClient;
const USER_ID = "user-123";
const PERIOD = "2026-06";

const FREE_RESUME_LIMIT = PLAN_LIMITS.free.resumes_per_month;
const FREE_INTERVIEW_LIMIT = PLAN_LIMITS.free.interviews_per_month;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(dbUser.getUserPlan).mockResolvedValue("free");
});

describe("checkUsageLimit — resumes", () => {
  it("allows when count is under the limit", async () => {
    vi.mocked(dbUsage.getUsage).mockResolvedValue({
      user_id: USER_ID,
      period: PERIOD,
      resumes_count: FREE_RESUME_LIMIT - 1,
      interviews_count: 0,
    });

    const result = await checkUsageLimit(mockSupabase, USER_ID, "resumes", PERIOD);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("blocks when count equals the limit (at-limit)", async () => {
    vi.mocked(dbUsage.getUsage).mockResolvedValue({
      user_id: USER_ID,
      period: PERIOD,
      resumes_count: FREE_RESUME_LIMIT,
      interviews_count: 0,
    });

    const result = await checkUsageLimit(mockSupabase, USER_ID, "resumes", PERIOD);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("blocks when count exceeds the limit (over-limit)", async () => {
    vi.mocked(dbUsage.getUsage).mockResolvedValue({
      user_id: USER_ID,
      period: PERIOD,
      resumes_count: FREE_RESUME_LIMIT + 1,
      interviews_count: 0,
    });

    const result = await checkUsageLimit(mockSupabase, USER_ID, "resumes", PERIOD);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("allows when usage row is absent (null → count 0)", async () => {
    vi.mocked(dbUsage.getUsage).mockResolvedValue(null);

    const result = await checkUsageLimit(mockSupabase, USER_ID, "resumes", PERIOD);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(FREE_RESUME_LIMIT);
  });
});

describe("checkUsageLimit — interviews", () => {
  it("allows when interview count is under the limit", async () => {
    vi.mocked(dbUsage.getUsage).mockResolvedValue({
      user_id: USER_ID,
      period: PERIOD,
      resumes_count: 0,
      interviews_count: 0,
    });

    const result = await checkUsageLimit(mockSupabase, USER_ID, "interviews", PERIOD);

    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(FREE_INTERVIEW_LIMIT);
  });

  it("blocks when interview count equals the limit (at-limit)", async () => {
    vi.mocked(dbUsage.getUsage).mockResolvedValue({
      user_id: USER_ID,
      period: PERIOD,
      resumes_count: 0,
      interviews_count: FREE_INTERVIEW_LIMIT,
    });

    const result = await checkUsageLimit(mockSupabase, USER_ID, "interviews", PERIOD);

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });
});

describe("checkUsageLimit — pro plan bypass", () => {
  it("always allows when plan is pro (Infinity limit)", async () => {
    vi.mocked(dbUser.getUserPlan).mockResolvedValue("pro");
    vi.mocked(dbUsage.getUsage).mockResolvedValue({
      user_id: USER_ID,
      period: PERIOD,
      resumes_count: 9999,
      interviews_count: 9999,
    });

    const resumeResult = await checkUsageLimit(mockSupabase, USER_ID, "resumes", PERIOD);
    const interviewResult = await checkUsageLimit(mockSupabase, USER_ID, "interviews", PERIOD);

    expect(resumeResult.allowed).toBe(true);
    expect(resumeResult.remaining).toBe(Infinity);
    expect(interviewResult.allowed).toBe(true);
    expect(interviewResult.remaining).toBe(Infinity);
  });

  it("does not call getUsage for pro plan (short-circuits)", async () => {
    vi.mocked(dbUser.getUserPlan).mockResolvedValue("pro");

    await checkUsageLimit(mockSupabase, USER_ID, "resumes", PERIOD);

    expect(dbUsage.getUsage).not.toHaveBeenCalled();
  });
});
