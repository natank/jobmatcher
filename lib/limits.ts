import type { TypedSupabaseClient } from "@/lib/db/client";
import { getUsage } from "./db/usage";
import { getUserPlan } from "./db/user";

export const PLAN_LIMITS = {
  free: { resumes_per_month: 3, interviews_per_month: 1 },
  // pro: stub only — no upgrade UI exists in MVP. Reachable only via direct DB update.
  pro: { resumes_per_month: Infinity, interviews_per_month: Infinity },
} as const;

export type Plan = keyof typeof PLAN_LIMITS;
export type LimitedFeature = "resumes" | "interviews";

/**
 * Checks whether userId is allowed to make another AI call for `feature` this period.
 * Reads plan from the `users` DB table — NOT user_metadata (which is never set by app code).
 * In MVP all users are 'free'; the pro branch is a forward-compatible stub.
 */
export async function checkUsageLimit(
  supabase: TypedSupabaseClient,
  userId: string,
  feature: LimitedFeature,
  period: string // YYYY-MM
): Promise<{ allowed: boolean; remaining: number }> {
  const plan = await getUserPlan(supabase, userId); // always 'free' in MVP
  const limit = PLAN_LIMITS[plan][`${feature}_per_month`];
  if (limit === Infinity) return { allowed: true, remaining: Infinity };

  const usage = await getUsage(supabase, userId, period);
  const count =
    feature === "resumes" ? (usage?.resumes_count ?? 0) : (usage?.interviews_count ?? 0);

  return { allowed: count < limit, remaining: Math.max(0, limit - count) };
}
