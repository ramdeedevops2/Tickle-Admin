import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";
import { nameByUserId } from "@/lib/supabase/names";

/**
 * Everything behind the Notifications screen.
 *
 * ── What is being administered ────────────────────────────────
 *
 * `notification_categories` is the real control surface. Each row is a
 * kind of thing the app tells somebody about, and carries how it
 * behaves when nobody has chosen otherwise (`default_mode`) and whether
 * it ignores that choice entirely (`critical`). Changing a row changes
 * the experience of every member who has not overridden it.
 *
 * `notification_prefs` is the override, one row per member per kind. It
 * is never edited here — reading somebody's choice is reasonable, and
 * changing it on their behalf is not. It is summarised instead, so the
 * panel can show how many people have switched a kind off, which is the
 * honest measure of whether a kind is welcome.
 *
 * ── Why push_tokens is handled defensively ────────────────────
 *
 * Its table arrives with migration 115, which may not have been run on
 * the database this panel is pointed at. A missing table there must not
 * take the whole screen down: the categories are useful on their own,
 * and a screen that errors is a worse answer than one that says push is
 * not set up yet.
 */

type CategoryRow = {
  id: string;
  key: string;
  label: string;
  default_mode: "smart" | "express" | "off";
  critical: boolean;
  sort_order: number;
};

type WordingRow = {
  kind: string;
  label: string;
  title: string;
  body: string;
  active: boolean;
  variables: string[];
  note: string;
};

/** Postgres for "that table does not exist". */
const UNDEFINED_TABLE = "42P01";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const supabase = auth.supabase;

    const { data: categoryRows, error: categoryError } = await supabase
      .from("notification_categories")
      .select("id, key, label, default_mode, critical, sort_order")
      .order("sort_order");

    if (categoryError) throw categoryError;

    const categories = (categoryRows ?? []) as CategoryRow[];

    /*
     * How many people have turned each kind off, and how many have
     * asked for it right away.
     *
     * Counted here rather than with a grouped query because PostgREST
     * cannot group, and the alternative is a database function for a
     * table that holds one small row per member per kind.
     */
    const { data: prefRows } = await supabase
      .from("notification_prefs")
      .select("category, mode");

    const mutedBy = new Map<string, number>();
    const changedBy = new Map<string, number>();

    for (const pref of (prefRows ?? []) as { category: string; mode: string }[]) {
      changedBy.set(pref.category, (changedBy.get(pref.category) ?? 0) + 1);
      if (pref.mode === "off") mutedBy.set(pref.category, (mutedBy.get(pref.category) ?? 0) + 1);
    }

    /*
     * What has actually gone out lately.
     *
     * Seven days, and only the columns the screen draws — this table is
     * the busiest in the database and selecting everything would pull
     * every title and body of every notification ever sent.
     */
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: recentRows } = await supabase
      .from("notifications")
      .select("id, user_id, type, category, title, read, created_at, pushed_at")
      .gte("created_at", weekAgo)
      .order("created_at", { ascending: false })
      .limit(200);

    const recent = (recentRows ?? []) as {
      id: string;
      user_id: string;
      type: string;
      category: string | null;
      title: string;
      read: boolean;
      created_at: string;
      pushed_at: string | null;
    }[];

    const sentByCategory = new Map<string, number>();
    for (const row of recent) {
      const key = row.category ?? "safety";
      sentByCategory.set(key, (sentByCategory.get(key) ?? 0) + 1);
    }

    /*
     * The words themselves, which arrive with migration 119.
     *
     * Tolerated as absent for the same reason as the phones below: the
     * rest of the screen is useful before every migration has been run,
     * and an error here would say the panel is broken when it is not.
     */
    let wordingReady = true;
    let wording: WordingRow[] = [];

    const { data: wordingRows, error: wordingError } = await supabase
      .from("notification_wording")
      .select("kind, label, title, body, active, variables, note")
      .order("kind");

    if (wordingError) {
      if (wordingError.code === UNDEFINED_TABLE) wordingReady = false;
      else throw wordingError;
    }

    wording = (wordingRows ?? []) as WordingRow[];

    /*
     * Phones that can be reached.
     *
     * Everything below tolerates the table being absent, because push
     * is set up in stages and this panel is useful before the last one.
     */
    let pushReady = true;
    let devices: {
      token: string;
      user_id: string;
      who: string;
      platform: string;
      device_name: string;
      created_at: string;
      invalid_at: string | null;
    }[] = [];

    const { data: tokenRows, error: tokenError } = await supabase
      .from("push_tokens")
      .select("token, user_id, platform, device_name, created_at, invalid_at")
      .order("updated_at", { ascending: false })
      .limit(200);

    if (tokenError) {
      if (tokenError.code === UNDEFINED_TABLE) pushReady = false;
      else throw tokenError;
    }

    const tokens = (tokenRows ?? []) as {
      token: string;
      user_id: string;
      platform: string;
      device_name: string;
      created_at: string;
      invalid_at: string | null;
    }[];

    /*
     * A name for every row, never an id.
     *
     * The ids come from two places — the devices and the recent
     * notifications — and are resolved in one pass so a busy week is
     * still a single lookup.
     */
    const ids = Array.from(
      new Set([...tokens.map((t) => t.user_id), ...recent.map((r) => r.user_id)]),
    );

    let names = new Map<string, string>();

    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, name, email")
        .in("user_id", ids);

      names = await nameByUserId(supabase, ids, (profiles ?? []) as never);
    }

    devices = tokens.map((token) => ({
      ...token,
      who: names.get(token.user_id) ?? "Deleted account",
      // The token itself never reaches the browser. It is a credential
      // for sending to somebody's phone, and the screen has no use for
      // it beyond counting rows.
      token: token.token.slice(-6),
    }));

    return NextResponse.json({
      pushReady,
      wordingReady,
      wording,
      categories: categories.map((category) => ({
        ...category,
        muted_by: mutedBy.get(category.key) ?? 0,
        changed_by: changedBy.get(category.key) ?? 0,
        sent_week: sentByCategory.get(category.key) ?? 0,
      })),
      devices,
      recent: recent.slice(0, 60).map((row) => ({
        id: row.id,
        who: names.get(row.user_id) ?? "Deleted account",
        type: row.type,
        category: row.category,
        title: row.title,
        read: row.read,
        created_at: row.created_at,
        pushed_at: row.pushed_at,
      })),
      totals: {
        live_devices: tokens.filter((t) => !t.invalid_at).length,
        retired_devices: tokens.filter((t) => t.invalid_at).length,
        android: tokens.filter((t) => !t.invalid_at && t.platform === "android").length,
        ios: tokens.filter((t) => !t.invalid_at && t.platform === "ios").length,
        sent_week: recent.length,
        waiting: recent.filter((r) => !r.pushed_at).length,
        opened_week: recent.filter((r) => r.read).length,
      },
    });
  } catch (error) {
    return failed(error, "Could not load notifications.");
  }
}

const MODES = new Set(["smart", "express", "off"]);

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "rules.manage");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const key = typeof body.key === "string" ? body.key : null;

    if (!key) {
      return NextResponse.json({ error: "Which kind of notification?" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (typeof body.label === "string") {
      const label = body.label.trim();
      if (label.length === 0) {
        return NextResponse.json(
          { error: "Give this kind a name people would recognise." },
          { status: 400 },
        );
      }
      if (label.length > 60) {
        return NextResponse.json({ error: "Keep the name under 60 characters." }, { status: 400 });
      }
      update.label = label;
    }

    if (typeof body.default_mode === "string") {
      if (!MODES.has(body.default_mode)) {
        return NextResponse.json({ error: "Unknown setting." }, { status: 400 });
      }
      update.default_mode = body.default_mode;
    }

    if (typeof body.critical === "boolean") update.critical = body.critical;

    if (body.sort_order !== undefined) {
      const order = Number(body.sort_order);
      if (!Number.isFinite(order) || order < 0 || order > 9999) {
        return NextResponse.json({ error: "Order must be between 0 and 9999." }, { status: 400 });
      }
      update.sort_order = Math.round(order);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    /*
     * Always-send and off cannot both be true.
     *
     * A kind marked always-send ignores what members chose, so leaving
     * its own default at off means it is simultaneously forced on and
     * set to never happen — and which wins depends on which piece of
     * code asks. Refused rather than resolved, because guessing here
     * would silently decide something the admin did not.
     */
    const { data: currentRow, error: currentError } = await auth.supabase
      .from("notification_categories")
      .select("default_mode, critical")
      .eq("key", key)
      .single();

    if (currentError) throw currentError;

    const current = currentRow as { default_mode: string; critical: boolean };
    const nextMode = (update.default_mode as string) ?? current.default_mode;
    const nextCritical = (update.critical as boolean) ?? current.critical;

    if (nextCritical && nextMode === "off") {
      return NextResponse.json(
        {
          error:
            "This kind is set to always send, so it cannot also be set to never send. Turn off 'always send' first.",
        },
        { status: 400 },
      );
    }

    const { error } = await auth.supabase
      .from("notification_categories")
      .update(update)
      .eq("key", key);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Could not save that change.");
  }
}

/**
 * Saving the words a notification uses.
 *
 * Separate from PATCH because it edits a different table and carries a
 * different risk: PATCH changes how something is delivered, this changes
 * what it says to every member who gets it.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, "rules.manage");
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const kind = typeof body.kind === "string" ? body.kind : null;

    if (!kind) {
      return NextResponse.json({ error: "Which notification?" }, { status: 400 });
    }

    const { data: currentRow, error: currentError } = await auth.supabase
      .from("notification_wording")
      .select("kind, title, body, variables")
      .eq("kind", kind)
      .single();

    if (currentError) throw currentError;

    const current = currentRow as {
      kind: string;
      title: string;
      body: string;
      variables: string[];
    };

    const update: Record<string, unknown> = {};

    if (typeof body.title === "string") {
      const title = body.title.trim();
      if (!title) {
        return NextResponse.json(
          { error: "A notification needs a heading." },
          { status: 400 },
        );
      }
      if (title.length > 80) {
        return NextResponse.json(
          { error: "Keep the heading under 80 characters — phones cut it off." },
          { status: 400 },
        );
      }
      update.title = title;
    }

    if (typeof body.body === "string") {
      const text = body.body.trim();
      if (!text) {
        return NextResponse.json(
          { error: "A notification needs a line of text under the heading." },
          { status: 400 },
        );
      }
      if (text.length > 200) {
        return NextResponse.json(
          { error: "Keep the text under 200 characters — phones cut it off." },
          { status: 400 },
        );
      }
      update.body = text;
    }

    if (typeof body.active === "boolean") update.active = body.active;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    /*
     * A placeholder this kind cannot fill is refused.
     *
     * {name} in a notification that carries no person reaches the phone
     * as the literal six characters, because the only thing filling
     * these is a search-and-replace. Caught here, where it can be
     * explained, rather than discovered by a member.
     */
    const text = `${update.title ?? current.title} ${update.body ?? current.body}`;
    const used = text.match(/\{[a-z_]+\}/g) ?? [];
    const allowed = new Set(current.variables ?? []);

    for (const placeholder of used) {
      if (!allowed.has(placeholder)) {
        return NextResponse.json(
          {
            error:
              allowed.size === 0
                ? `This notification cannot use ${placeholder} — it has nothing to put there.`
                : `This notification cannot use ${placeholder}. It can only use ${[...allowed].join(" or ")}.`,
          },
          { status: 400 },
        );
      }
    }

    /*
     * The one piece of wording that is a rule, not a preference.
     *
     * The hidden-name version of a like exists because naming the liker
     * is what a paid plan sells. Letting a name into it would give that
     * away for free to everybody, and it would be found months later as
     * a billing question rather than a bug.
     */
    if (kind === "like" && /\{name\}/.test(text)) {
      return NextResponse.json(
        {
          error:
            "This is the version sent to members who have not paid to see who liked them, so it cannot name anyone. Edit 'Someone liked you (name shown)' instead.",
        },
        { status: 400 },
      );
    }

    update.updated_at = new Date().toISOString();

    const { error } = await auth.supabase
      .from("notification_wording")
      .update(update)
      .eq("kind", kind);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Could not save that wording.");
  }
}
