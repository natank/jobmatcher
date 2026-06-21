import { describe, it, expect, vi, beforeEach } from "vitest";
import { getUserPlan } from "./user";
import type { TypedSupabaseClient } from "@/lib/db/client";

function makeSupabase(planValue: string | null | undefined) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: planValue !== undefined ? { plan: planValue } : null,
            error: null,
          }),
        }),
      }),
    }),
  } as unknown as TypedSupabaseClient;
}

describe("getUserPlan", () => {
  it("returns 'free' for a standard user row with plan = 'free'", async () => {
    const supabase = makeSupabase("free");
    const plan = await getUserPlan(supabase, "user-1");
    expect(plan).toBe("free");
  });

  it("returns 'pro' when the row has plan = 'pro'", async () => {
    const supabase = makeSupabase("pro");
    const plan = await getUserPlan(supabase, "user-1");
    expect(plan).toBe("pro");
  });

  it("defaults to 'free' when the row is absent (data is null)", async () => {
    const supabase = makeSupabase(undefined);
    const plan = await getUserPlan(supabase, "user-missing");
    expect(plan).toBe("free");
  });

  it("defaults to 'free' when plan field is null", async () => {
    const supabase = makeSupabase(null);
    const plan = await getUserPlan(supabase, "user-1");
    expect(plan).toBe("free");
  });
});
