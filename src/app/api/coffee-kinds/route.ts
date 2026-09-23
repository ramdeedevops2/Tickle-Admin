import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * What someone can be up for on a Coffee Date (migration 102).
 *
 * The post sheet draws one pill per active row, in `sort` order. Members
 * can read the table; nobody can write it, so every change comes through
 * here on the service role.
 *
 * `note` is the sentence that lands on the post and prints on the cards
 * — "Up for coffee" — so it is the one field worth reading aloud before
 * saving. `icon` names a drawing the app ships; a name it does not know
 * falls back to the cup rather than breaking the sheet, which is why an
 * unknown name is a warning here and not an error.
 */

/*
 * The glyphs the app has drawings for. Kept in step with ICONS in
 * CoffeePostSheet.tsx — a name outside this list still saves, and still
 * renders, just as a cup.
 */
const KNOWN_ICONS = [
  "coffee",
  "pizza",
  "film",
  "martini",
  "dumbbell",
  "footprints",
  "dices",
  "mountain",
  "music",
];

type KindRow = {
  key: string;
  label: string;
  note: string;
  icon: string;
  sort: number;
  active: boolean;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [kindsRes, settingsRes] = await Promise.all([
      auth.supabase
        .from("coffee_kinds")
        .select("key, label, note, icon, sort, active")
        .order("sort", { ascending: true }),
      auth.supabase
        .from("coffee_settings")
        .select("durations_hours, default_hours, reach_km, default_reach_km")
        .eq("id", 1)
        .maybeSingle(),
    ]);

    if (kindsRes.error) throw kindsRes.error;

    return NextResponse.json({
      kinds: (kindsRes.data ?? []) as KindRow[],
      // Null until migration 103 has been run; the panel says so.
      settings: settingsRes.error ? null : settingsRes.data,
      known_icons: KNOWN_ICONS,
    });
  } catch (error) {
    return failed(error, "Failed to load coffee kinds.");
  }
}

/** A key is used as a primary key and read by the app, so keep it plain. */
const KEY_SHAPE = /^[a-z][a-z0-9_]{1,30}$/;

function readKind(body: Record<string, unknown>) {
  const key = String(body.key ?? "").trim().toLowerCase();
  const label = String(body.label ?? "").trim();
  const note = String(body.note ?? "").trim();
  const icon = String(body.icon ?? "coffee").trim().toLowerCase();

  if (!KEY_SHAPE.test(key)) {
    return { error: "Key must be lowercase letters, numbers and underscores." };
  }
  if (label.length < 1 || label.length > 24) {
    return { error: "Label must be between 1 and 24 characters." };
  }
  if (note.length < 1 || note.length > 60) {
    return { error: "The line must be between 1 and 60 characters." };
  }

  return { key, label, note, icon };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const parsed = readKind(body);
    if ("error" in parsed) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const sort = Number.isFinite(Number(body.sort)) ? Math.round(Number(body.sort)) : 100;

    const { error } = await auth.supabase.from("coffee_kinds").insert({
      ...parsed,
      sort,
      active: body.active === undefined ? true : Boolean(body.active),
    });

    if (error) {
      // 23505: the key already exists. Worth saying plainly rather than
      // handing the admin a Postgres code.
      if (error.code === "23505") {
        return NextResponse.json({ error: "That key is already in use." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to add the kind.");
  }
}

/*
 * A list of whole numbers from the panel, cleaned: deduplicated, sorted,
 * and each one inside the range the table's CHECK allows — so a bad
 * value is a plain sentence here, not a constraint name from Postgres.
 */
function readSteps(value: unknown, min: number, max: number, most: number, what: string) {
  const list = Array.isArray(value) ? value.map(Number) : [];

  if (!list.length || list.some((n) => !Number.isInteger(n))) {
    return { error: `${what} must be whole numbers.` };
  }
  if (list.some((n) => n < min || n > max)) {
    return { error: `${what} must each be between ${min} and ${max}.` };
  }

  const steps = [...new Set(list)].sort((a, b) => a - b);
  if (steps.length > most) return { error: `At most ${most} ${what.toLowerCase()}.` };

  return { steps };
}

async function saveSettings(
  supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"],
  body: Record<string, unknown>,
) {
  const durations = readSteps(body.durations_hours, 1, 24, 6, "Durations");
  if ("error" in durations) return NextResponse.json({ error: durations.error }, { status: 400 });

  const reach = readSteps(body.reach_km, 1, 50, 10, "Distances");
  if ("error" in reach) return NextResponse.json({ error: reach.error }, { status: 400 });

  const defaultHours = Number(body.default_hours);
  if (!durations.steps.includes(defaultHours)) {
    return NextResponse.json(
      { error: "The recommended duration must be one of the durations." },
      { status: 400 },
    );
  }

  const defaultReach = Number(body.default_reach_km);
  if (!reach.steps.includes(defaultReach)) {
    return NextResponse.json(
      { error: "The starting distance must be one of the distances." },
      { status: 400 },
    );
  }

  const { error } = await supabase!
    .from("coffee_settings")
    .update({
      durations_hours: durations.steps,
      default_hours: defaultHours,
      reach_km: reach.steps,
      default_reach_km: defaultReach,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);

  if (error) throw error;
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    // The settings row travels on the same route: one screen, one endpoint.
    if (body.settings && typeof body.settings === "object") {
      return await saveSettings(auth.supabase, body.settings as Record<string, unknown>);
    }

    const key = String(body.key ?? "").trim().toLowerCase();

    if (!KEY_SHAPE.test(key)) {
      return NextResponse.json({ error: "Which kind?" }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (body.label !== undefined) {
      const label = String(body.label).trim();
      if (label.length < 1 || label.length > 24) {
        return NextResponse.json({ error: "Label must be 1 to 24 characters." }, { status: 400 });
      }
      update.label = label;
    }

    if (body.note !== undefined) {
      const note = String(body.note).trim();
      if (note.length < 1 || note.length > 60) {
        return NextResponse.json({ error: "The line must be 1 to 60 characters." }, { status: 400 });
      }
      update.note = note;
    }

    if (body.icon !== undefined) update.icon = String(body.icon).trim().toLowerCase();
    if (body.active !== undefined) update.active = Boolean(body.active);
    if (body.sort !== undefined && Number.isFinite(Number(body.sort))) {
      update.sort = Math.round(Number(body.sort));
    }

    if (!Object.keys(update).length) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase.from("coffee_kinds").update(update).eq("key", key);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to save the kind.");
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const key = String(new URL(request.url).searchParams.get("key") ?? "")
      .trim()
      .toLowerCase();

    if (!KEY_SHAPE.test(key)) {
      return NextResponse.json({ error: "Which kind?" }, { status: 400 });
    }

    /*
     * Posts already carry their sentence in `note`, copied at the time of
     * posting — so removing a kind never rewrites anyone's live post. It
     * only stops the pill appearing on the sheet from here on.
     */
    const { error } = await auth.supabase.from("coffee_kinds").delete().eq("key", key);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to remove the kind.");
  }
}
