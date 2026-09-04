import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * View as user — strictly read-only.
 *
 * This returns what a member's own app would show them: their wallet,
 * their limits, their filters, what they are seeing and why. It exists
 * so support can answer "why is my deck empty" without asking somebody
 * to send screenshots.
 *
 * There is no POST here, and there never should be. Acting *as* somebody
 * makes an audit trail meaningless — every row would say the member did
 * it. Adjustments go through /api/adjust, under the admin's own name.
 *
 * Private content is deliberately absent: no message bodies, no photos
 * beyond what the profile already shows publicly, no reporter
 * identities. Seeing why a deck is empty does not require reading
 * somebody's conversations.
 */

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");

    if (!userId) {
      return NextResponse.json({ error: "Missing member." }, { status: 400 });
    }

    const [profile, ledger, filters, blocks, tickets, standing] = await Promise.all([
      auth.supabase
        .from("profiles")
        .select(
          "user_id, name, email, roses, premium_until, published_at, " +
            "face_verified_at, suspended_at, suspended_reason, created_at, " +
            "last_active, min_age, max_age, incognito_until, " +
            "deactivated_at, delete_requested_at",
        )
        .eq("user_id", userId)
        .maybeSingle(),

      auth.supabase
        .from("rose_ledger")
        .select("amount, reason, balance_after, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30),

      // One row per filter they have set, not a single row.
      auth.supabase
        .from("user_filters")
        .select("filter_key, value, updated_at")
        .eq("user_id", userId),

      auth.supabase
        .from("blocks")
        .select("*", { count: "exact", head: true })
        .eq("blocker_id", userId),

      auth.supabase
        .from("support_tickets")
        .select("id, reference, subject, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10),

      auth.supabase.rpc("activity_standing", { p_user_id: userId }),
    ]);

    if (!profile.data) {
      return NextResponse.json({ error: "No such member." }, { status: 404 });
    }

    const row = profile.data as unknown as Record<string, unknown>;

    /*
     * Why their deck might be empty.
     *
     * Not by running the deck query for them — refresh_discovery_pool
     * derives the viewer from auth.uid(), so calling it here would
     * return the *admin's* deck and label it the member's. That is
     * worse than no answer.
     *
     * These are the conditions that actually stop a deck from filling,
     * each read straight from their row.
     */
    const reasons: string[] = [];

    if (!row.published_at) reasons.push("Profile is not published.");
    if (row.suspended_at) reasons.push("Account is suspended.");
    if (row.deactivated_at) reasons.push("Account is deactivated.");
    if (row.delete_requested_at) reasons.push("Deletion has been requested.");
    if (row.incognito_until && new Date(String(row.incognito_until)) > new Date()) {
      reasons.push("Incognito is on, so they are hidden from other decks.");
    }
    if (!row.last_active) reasons.push("Never shared a location, so nobody is nearby.");
    if ((filters.data ?? []).length > 0) {
      reasons.push(`${filters.data?.length} filter(s) set, which narrow the deck.`);
    }

    return NextResponse.json({
      profile: profile.data,
      ledger: ledger.data ?? [],
      filters: filters.data ?? [],
      blocked_count: blocks.count ?? 0,
      tickets: tickets.data ?? [],
      standing: standing.data ?? null,

      // Facts about their row, not a simulated deck.
      deck_notes: reasons,

      readonly: true,
    });
  } catch (error) {
    return failed(error, "Failed to load that view.");
  }
}
