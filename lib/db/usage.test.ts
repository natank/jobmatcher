import { describe, it, expect, vi, beforeEach } from "vitest";
import { getOrCreateUsage, incrementResumes, getUsage } from "./usage";
import type { TypedSupabaseClient } from "@/lib/db/client";

const USER_ID = "user-abc";
const PERIOD = "2026-06";

const EXISTING_ROW = {
  user_id: USER_ID,
  period: PERIOD,
  resumes_count: 2,
  interviews_count: 0,
};

// ---------------------------------------------------------------------------
// getOrCreateUsage
// ---------------------------------------------------------------------------

describe("getOrCreateUsage", () => {
  it("returns the existing row when one is found", async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: EXISTING_ROW, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockMaybeSingle,
            }),
          }),
        }),
      }),
    } as unknown as TypedSupabaseClient;

    const row = await getOrCreateUsage(supabase, USER_ID, PERIOD);
    expect(row).toEqual(EXISTING_ROW);
  });

  it("inserts and returns a zero-count row when none exists", async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockMaybeSingle,
            }),
          }),
        }),
        insert: mockInsert,
      }),
    } as unknown as TypedSupabaseClient;

    const row = await getOrCreateUsage(supabase, USER_ID, PERIOD);
    expect(row.resumes_count).toBe(0);
    expect(row.interviews_count).toBe(0);
    expect(row.user_id).toBe(USER_ID);
    expect(row.period).toBe(PERIOD);
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: USER_ID,
        period: PERIOD,
        resumes_count: 0,
        interviews_count: 0,
      })
    );
  });

  it("throws when insert fails", async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: { message: "DB error" } });
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockMaybeSingle,
            }),
          }),
        }),
        insert: mockInsert,
      }),
    } as unknown as TypedSupabaseClient;

    await expect(getOrCreateUsage(supabase, USER_ID, PERIOD)).rejects.toThrow(
      "Failed to create usage row"
    );
  });
});

// ---------------------------------------------------------------------------
// incrementResumes
// ---------------------------------------------------------------------------

describe("incrementResumes", () => {
  it("increments resumes_count when row exists", async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: EXISTING_ROW, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockMaybeSingle,
            }),
          }),
        }),
        update: mockUpdate,
      }),
    } as unknown as TypedSupabaseClient;

    await incrementResumes(supabase, USER_ID, PERIOD);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ resumes_count: EXISTING_ROW.resumes_count + 1 })
    );
  });

  it("inserts a new row with resumes_count = 1 when no row exists", async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null });
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const supabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: mockMaybeSingle,
            }),
          }),
        }),
        insert: mockInsert,
      }),
    } as unknown as TypedSupabaseClient;

    await incrementResumes(supabase, USER_ID, PERIOD);

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ resumes_count: 1, interviews_count: 0 })
    );
  });
});
