import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Face verification, after the fact.
 *
 * There is no queue any more. Rekognition decides every check in a couple
 * of seconds, and the selfie is never stored — it exists in one request
 * body and is gone. What is left is a log: a score, a reason, a timestamp.
 *
 * So this page is monitoring rather than moderation. The two things worth
 * watching are the approval rate, which says whether the thresholds are
 * sensible, and people stuck retrying, which is the only case where a
 * human can still help.
 */

type LogRow = {
  id: string;
  user_id: string;
  similarity: number | null;
  approved: boolean;
  reason: string;
  compared: number;
  attempt: number;
  duration_ms: number | null;
  /**
   * The profile photo that scored highest on this check.
   *
   * Null on a manual override, on a provider outage, and on older rows
   * written before this was recorded. Never a selfie — those are still
   * held for one request and written nowhere.
   */
  matched_photo: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  name: string | null;
  photos: string[] | null;
  face_verified_at: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const [logRes, settingRes] = await Promise.all([
      supabase
        .from("face_check_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabase
        .from("fairness_settings")
        .select("face_approve_at, face_reject_at, face_checks_per_hour")
        .eq("id", 1)
        .single(),
    ]);

    if (logRes.error) throw logRes.error;

    const rows = (logRes.data ?? []) as LogRow[];
    const userIds = [...new Set(rows.map((row) => row.user_id))];

    const { data: profileData } = userIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, name, photos, face_verified_at")
          .in("user_id", userIds)
      : { data: [] };

    const profileById = new Map(
      ((profileData ?? []) as ProfileRow[]).map((row) => [row.user_id, row]),
    );

    const byReason = new Map<string, number>();
    for (const row of rows) {
      byReason.set(row.reason, (byReason.get(row.reason) ?? 0) + 1);
    }

    /*
     * People who keep failing.
     *
     * The one group a human can still help. Three attempts and no badge
     * usually means their profile photos are the problem rather than their
     * selfie — a group shot, or a picture from years ago.
     */
    const attemptsByUser = new Map<string, number>();
    for (const row of rows) {
      attemptsByUser.set(row.user_id, Math.max(attemptsByUser.get(row.user_id) ?? 0, row.attempt));
    }

    const stuck = [...attemptsByUser.entries()]
      .filter(([userId, attempts]) => attempts >= 3 && !profileById.get(userId)?.face_verified_at)
      .map(([userId, attempts]) => ({
        user_id: userId,
        attempts,
        profile: profileById.get(userId) ?? null,
      }))
      .sort((a, b) => b.attempts - a.attempts);

    const approved = rows.filter((row) => row.approved).length;
    const scored = rows.filter((row) => row.similarity !== null);
    const durations = rows
      .map((row) => row.duration_ms)
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);

    return NextResponse.json({
      settings: settingRes.data ?? null,
      stats: {
        checks: rows.length,
        approved,
        approvalRate: rows.length > 0 ? Math.round((approved / rows.length) * 100) : 0,
        // Median rather than mean: one 12-second cold start should not
        // make a fast function look slow.
        medianMs: durations.length ? durations[Math.floor(durations.length / 2)] : null,
        medianSimilarity: scored.length
          ? Math.round(
              [...scored].sort((a, b) => (a.similarity ?? 0) - (b.similarity ?? 0))[
                Math.floor(scored.length / 2)
              ].similarity ?? 0,
            )
          : null,
        providerErrors: rows.filter((row) => row.reason === "provider_error").length,
        stuck: stuck.length,
      },
      byReason: Object.fromEntries(byReason),
      stuck: stuck.slice(0, 20),
      log: rows.map((row) => ({
        ...row,
        profile: profileById.get(row.user_id) ?? null,
      })),
    });
  } catch (error) {
    return failed(error, "Failed to load verification log.");
  }
}

/**
 * The manual override.
 *
 * Kept for one reason: somebody whose profile photos genuinely cannot be
 * matched — a professional shot, heavy makeup, a photo from years ago —
 * and who has proved themselves some other way. Rare, and it is logged
 * with the admin's id so it is never invisible.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase, user } = auth;
    const body = (await request.json()) as { user_id?: string; approved?: boolean };

    if (!body.user_id || typeof body.approved !== "boolean") {
      return NextResponse.json(
        { error: "A user and a decision are both required." },
        { status: 400 },
      );
    }

    const { error } = await supabase.rpc("record_face_check", {
      p_user_id: body.user_id,
      p_approved: body.approved,
      p_similarity: null,
      p_reason: body.approved ? "match" : "no_match",
      p_compared: 0,
      p_duration_ms: null,
      // No photo to name: a manual decision compared nothing.
      p_matched_photo: null,
    });

    if (error) throw error;

    await supabase.from("auth_events").insert({
      user_id: body.user_id,
      kind: body.approved ? "restored" : "suspended",
      detail: { manual_face_check: body.approved, by: user.id },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to record that decision.");
  }
}
