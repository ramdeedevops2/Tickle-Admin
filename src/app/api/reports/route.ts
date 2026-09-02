import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The moderation queue.
 *
 * RLS on reports lets you see the ones you filed and nothing else, which is
 * right for the app and leaves an admin with an empty page — so this reads
 * with the service role behind an admin check, like everything else here.
 *
 * Suspension lives on this route too rather than under /api/members, because
 * suspending someone is almost always the last step of reviewing a report
 * and the two want to happen in one place.
 */

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  match_id: string | null;
  reason: string;
  status: string;
  notes: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

type ProfileRow = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
  suspended_at: string | null;
  suspended_reason: string | null;
};

const STATUSES = ["open", "reviewing", "resolved", "dismissed"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const { data, error } = await supabase
      .from("reports")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);

    if (error) throw error;

    const reports = (data ?? []) as ReportRow[];

    const userIds = [
      ...new Set(reports.flatMap((row) => [row.reporter_id, row.reported_user_id])),
    ];

    const { data: profileData } = userIds.length
      ? await supabase
          .from("profiles")
          .select("user_id, name, email, photos, suspended_at, suspended_reason")
          .in("user_id", userIds)
      : { data: [] };

    const profileById = new Map(
      ((profileData ?? []) as ProfileRow[]).map((row) => [row.user_id, row]),
    );

    /*
     * How many times this person has been reported, not just on this row.
     * One report is an incident; five from five different people is the
     * thing a moderator actually needs to see, and it is invisible when the
     * queue is read one row at a time.
     */
    const reportCounts = new Map<string, number>();
    for (const report of reports) {
      reportCounts.set(
        report.reported_user_id,
        (reportCounts.get(report.reported_user_id) ?? 0) + 1,
      );
    }

    return NextResponse.json({
      reports: reports.map((row) => ({
        ...row,
        reporter: profileById.get(row.reporter_id) ?? null,
        reported: profileById.get(row.reported_user_id) ?? null,
        times_reported: reportCounts.get(row.reported_user_id) ?? 1,
      })),
    });
  } catch (error) {
    return failed(error, "Failed to load reports.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase, user } = auth;
    const body = (await request.json()) as {
      id?: string;
      status?: string;
      notes?: string;
    };

    if (!body.id) {
      return NextResponse.json({ error: "Report ID is required." }, { status: 400 });
    }
    if (!body.status || !STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Unknown status." }, { status: 400 });
    }

    const { error } = await supabase
      .from("reports")
      .update({
        status: body.status,
        notes: body.notes ?? "",
        // Who looked, and when. A queue where every row says "resolved" and
        // nothing says by whom is not an audit trail.
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", body.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update report.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase, user } = auth;
    const body = (await request.json()) as {
      action?: string;
      user_id?: string;
      reason?: string;
    };

    if (!body.user_id) {
      return NextResponse.json({ error: "User ID is required." }, { status: 400 });
    }

    if (body.action === "suspend") {
      const { error } = await supabase
        .from("profiles")
        .update({
          suspended_at: new Date().toISOString(),
          suspended_reason: body.reason ?? "",
          suspended_by: user.id,
        })
        .eq("user_id", body.user_id);

      if (error) throw error;

      /*
       * Flagging the row is not enough on its own.
       *
       * A session issued before the suspension stays cryptographically valid
       * until it expires, so a suspended person keeps using the app until
       * they happen to close it. Revoking every refresh token ends that at
       * the next request instead of at the next token expiry.
       *
       * The app also asks account_status() on launch and on resume, so the
       * two together close the window from both ends.
       */
      await supabase.auth.admin.signOut(body.user_id, "global").catch(() => {});

      await supabase.from("auth_events").insert({
        user_id: body.user_id,
        kind: "suspended",
        detail: { by: user.id, reason: body.reason ?? "" },
      });

      return NextResponse.json({ ok: true });
    }

    if (body.action === "force_logout") {
      // Signs every device out without suspending — for a compromised
      // account, where the person is the victim rather than the problem.
      await supabase.auth.admin.signOut(body.user_id, "global");

      await supabase.from("auth_events").insert({
        user_id: body.user_id,
        kind: "forced_logout",
        detail: { by: user.id },
      });

      return NextResponse.json({ ok: true });
    }

    if (body.action === "unsuspend") {
      const { error } = await supabase
        .from("profiles")
        .update({ suspended_at: null, suspended_reason: "", suspended_by: null })
        .eq("user_id", body.user_id);

      if (error) throw error;

      await supabase.from("auth_events").insert({
        user_id: body.user_id,
        kind: "restored",
        detail: { by: user.id },
      });

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    return failed(error, "Failed to update member.");
  }
}
