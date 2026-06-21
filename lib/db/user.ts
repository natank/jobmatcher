import type { TypedSupabaseClient } from "@/lib/db/client";
import type { Database } from "@/types/database";
import type { Plan } from "@/lib/limits";

type UserRow = Database["public"]["Tables"]["users"]["Row"];

/**
 * Returns the user's plan from the users table.
 * Defaults to 'free' if the row is missing or the plan field is unset.
 * In MVP all users are on the free tier; the pro path is a forward-compatible stub.
 */
export async function getUserPlan(supabase: TypedSupabaseClient, userId: string): Promise<Plan> {
  const result = await supabase.from("users").select("plan").eq("id", userId).maybeSingle();
  const row = result.data as Pick<UserRow, "plan"> | null;
  return (row?.plan as Plan) ?? "free";
}
