import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Members, by name, for the places that need to pick one.
 *
 * ── Why not the global search ─────────────────────────────────
 *
 * /api/search answers across thirteen tables and returns a label and an
 * href — enough to navigate somewhere, not enough to *use* the result.
 * Picking a Flare recipient needs the user id, and digging it back out
 * of "/members/<uuid>" would make a URL shape into an API contract.
 *
 * ── Why the photo comes too ───────────────────────────────────
 *
 * Names repeat. Two Priyas in the same city are indistinguishable by
 * name, and a Flare goes out under somebody's own face — sending one to
 * the wrong person is not a mistake the admin can take back. The face
 * and the city are what make the choice checkable before it is made.
 */

/** Postgrest treats these as pattern syntax inside ilike. */
function clean(term: string): string {
  return term.replace(/[,.%_()\\]/g, " ").trim();
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const raw = (new URL(request.url).searchParams.get("q") ?? "").trim();
    const term = clean(raw);

    // One letter matches most of the table; it is not a search yet.
    if (term.length < 2) return NextResponse.json({ members: [] });

    const { data, error } = await auth.supabase
      .from("profiles")
      .select("user_id, name, email, city, age, photos, suspended_at")
      .or(`name.ilike.%${term}%,email.ilike.%${term}%`)
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const members = (data ?? []).map((row) => ({
      user_id: row.user_id as string,
      name: (row.name as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      city: (row.city as string | null) ?? null,
      age: (row.age as number | null) ?? null,
      photo: Array.isArray(row.photos) ? (row.photos[0] as string) ?? null : null,
      suspended: row.suspended_at !== null,
    }));

    /*
     * Best match first, suspended last.
     *
     * A suspended member can still be sent a Flare by the database, but
     * it is almost never what was meant — so they stay reachable and
     * stop competing for the top of the list.
     */
    const lower = term.toLowerCase();

    members.sort((a, b) => {
      if (a.suspended !== b.suspended) return a.suspended ? 1 : -1;

      const score = (value: string | null) => {
        const text = (value ?? "").toLowerCase();
        if (text === lower) return 0;
        if (text.startsWith(lower)) return 1;
        if (text.includes(lower)) return 2;
        return 3;
      };

      return (
        score(a.name) - score(b.name) ||
        (a.name ?? "").localeCompare(b.name ?? "")
      );
    });

    return NextResponse.json({ members: members.slice(0, 12) });
  } catch (error) {
    return failed(error, "Could not search members.");
  }
}
