import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The moderation queue.
 *
 * Every action here is audited with a reason and a before/after state.
 * That is not bureaucracy — an admin panel that can suspend accounts and
 * lift suspensions is one that will eventually be used badly, far more
 * often by mistake than by malice, and "who did this and what was it
 * before" is the only question that helps afterwards.
 *
 * The reporter is never returned. Not their name, not their id. A
 * moderator deciding a case does not need to know who raised it, and a
 * panel that shows it is one leak away from the person being identified.
 */

const ACTIONS = ["dismiss", "warn", "reverify", "suspend", "unsuspend", "ban"] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status") ?? "open";

    const [reports, reasons, flags] = await Promise.all([
      auth.supabase
        .from("reports")
        // reporter_id is deliberately absent from this select.
        .select("id, reported_user_id, reason, reason_key, detail, status, created_at, match_id, admin_note")
        .eq("status", status)
        .order("created_at", { ascending: false })
        .limit(200),
      auth.supabase.from("report_reasons").select("*").order("sort_order"),
      auth.supabase
        .from("content_flags")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (reports.error) throw reports.error;

    const rows = (reports.data ?? []) as { reported_user_id: string; reason_key: string }[];

    // The profiles behind the reports, in one query rather than N.
    const ids = [...new Set(rows.map((r) => r.reported_user_id))];

    const { data: profiles } = ids.length
      ? await auth.supabase
          .from("profiles")
          .select("user_id, name, email, photos, suspended_at, face_verified_at, created_at")
          .in("user_id", ids)
      : { data: [] };

    const byUser = Object.fromEntries(
      (profiles ?? []).map((p) => [p.user_id, p]),
    );

    /*
     * How many times each person has been reported.
     *
     * One report is an incident. Five from different people is a
     * pattern, and a moderator seeing only the report in front of them
     * cannot tell the difference.
     */
    const { data: history } = ids.length
      ? await auth.supabase.from("reports").select("reported_user_id").in("reported_user_id", ids)
      : { data: [] };

    const counts: Record<string, number> = {};
    for (const row of (history ?? []) as { reported_user_id: string }[]) {
      counts[row.reported_user_id] = (counts[row.reported_user_id] ?? 0) + 1;
    }

    return NextResponse.json({
      reports: rows.map((report) => ({
        ...report,
        profile: byUser[report.reported_user_id] ?? null,
        report_count: counts[report.reported_user_id] ?? 1,
      })),
      reasons: reasons.data ?? [],
      flags: flags.data ?? [],
      actions: ACTIONS,
    });
  } catch (error) {
    return failed(error, "Failed to load the moderation queue.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "moderation.act");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const reportId = String(body.report_id ?? "");
    const action = String(body.action ?? "");
    const reason = String(body.reason ?? "").trim();

    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    }

    /*
     * A reason is required, always.
     *
     * The database function refuses without one too — this check exists
     * so the message is useful rather than a raised exception.
     */
    if (reason.length < 3) {
      return NextResponse.json(
        { error: "Say why. It is the only thing that explains this later." },
        { status: 400 },
      );
    }

    const { data: report } = await auth.supabase
      .from("reports")
      .select("id, reported_user_id, status")
      .eq("id", reportId)
      .maybeSingle();

    if (!report) {
      return NextResponse.json({ error: "That report is gone." }, { status: 404 });
    }

    const target = report.reported_user_id;

    // The state before, captured for the audit row.
    const { data: before } = await auth.supabase
      .from("profiles")
      .select("suspended_at, face_verified_at, published_at")
      .eq("user_id", target)
      .maybeSingle();

    const outcome = action;

    if (action === "suspend" || action === "ban") {
      await auth.supabase
        .from("profiles")
        .update({
          suspended_at: new Date().toISOString(),
          suspended_reason: reason,
        })
        .eq("user_id", target);
    }

    if (action === "unsuspend") {
      await auth.supabase
        .from("profiles")
        .update({ suspended_at: null, suspended_reason: null })
        .eq("user_id", target);
    }

    if (action === "reverify") {
      // Through the function, which also clears the badge and tells
      // them why — doing it here would set the column and leave a
      // verified badge on an account nobody is sure about.
      await auth.supabase.rpc("require_reverification", {
        p_user_id: target,
        p_reason: reason,
      });
    }

    if (action === "warn") {
      await auth.supabase.from("notifications").insert({
        user_id: target,
        type: "moderation",
        category: "safety",
        title: "About your account",
        body: "Something on your account was reported and reviewed. Please read the guidelines.",
      });
    }

    const { data: after } = await auth.supabase
      .from("profiles")
      .select("suspended_at, face_verified_at, published_at")
      .eq("user_id", target)
      .maybeSingle();

    await auth.supabase
      .from("reports")
      .update({
        status: action === "dismiss" ? "dismissed" : "actioned",
        outcome,
        reviewed_by: auth.user?.id,
        reviewed_at: new Date().toISOString(),
        admin_note: String(body.note ?? "").trim() || null,
      })
      .eq("id", reportId);

    // The audit row. Refuses without a reason, which is why the check
    // above exists to say so nicely first.
    await auth.supabase.rpc("record_admin_action", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_action: `moderation.${action}`,
      p_target_type: "profile",
      p_target_id: target,
      p_reason: reason,
      p_before: before,
      p_after: after,
    });

    return NextResponse.json({ ok: true, outcome });
  } catch (error) {
    return failed(error, "Failed to action that report.");
  }
}

/** Keep or remove a flagged piece of content. */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "moderation.act");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const id = String(body.id ?? "");
    const keep = body.keep === true;
    const reason = String(body.reason ?? "").trim();

    if (!id || reason.length < 3) {
      return NextResponse.json({ error: "Missing flag or reason." }, { status: 400 });
    }

    const { data: flag } = await auth.supabase
      .from("content_flags")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (!flag) {
      return NextResponse.json({ error: "That flag is gone." }, { status: 404 });
    }

    await auth.supabase
      .from("content_flags")
      .update({
        status: keep ? "kept" : "removed",
        reviewed_by: auth.user?.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    await auth.supabase.rpc("record_admin_action", {
      p_admin_id: auth.user?.id,
      p_admin_email: auth.user?.email ?? null,
      p_action: keep ? "content.keep" : "content.remove",
      p_target_type: "content_flag",
      p_target_id: id,
      p_reason: reason,
      p_before: { status: "open", kind: flag.kind },
      p_after: { status: keep ? "kept" : "removed" },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to review that content.");
  }
}
