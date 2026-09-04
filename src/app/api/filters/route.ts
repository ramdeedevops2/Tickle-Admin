import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Filter definitions and their free/premium split.
 *
 * The spec defers the classification, so this is where it gets made —
 * and unmade. Every filter's tier is a boolean an admin flips, which
 * means the decision can be revisited from usage rather than argued
 * about up front.
 *
 * One guard worth understanding: `column_name` has to be a real column
 * on `profiles`. Nothing in the database checks that, and a typo
 * produces a filter that silently matches nobody — so POST tries to
 * select the column before writing, and refuses if it does not resolve.
 */

const KINDS = ["range", "choice", "multi", "boolean", "distance"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [groups, definitions, usage] = await Promise.all([
      auth.supabase.from("filter_groups").select("*").order("sort_order"),
      auth.supabase.from("filter_definitions").select("*").order("sort_order"),
      // Which filters people actually set. Keys only — what somebody
      // filters for says a great deal about them, and this page has no
      // business knowing it per person.
      auth.supabase.from("user_filters").select("filter_key").limit(50000),
    ]);

    if (definitions.error) throw definitions.error;

    const counts: Record<string, number> = {};
    for (const row of (usage.data ?? []) as { filter_key: string }[]) {
      counts[row.filter_key] = (counts[row.filter_key] ?? 0) + 1;
    }

    /*
     * How many options each filter offers.
     *
     * A choice or multi filter does not carry its own list — it borrows
     * the matching profile field's, so the app can never offer a value
     * nobody can set on their own profile. The catch is that a filter
     * whose key matches no field, or matches an empty one, shows
     * "Nothing to choose from yet" in the app with nothing on this page
     * to say why. These counts are what makes that visible.
     */
    const { data: options } = await auth.supabase
      .from("profile_field_options")
      .select("field_key, value, active")
      .order("sort_order");

    const optionCounts: Record<string, number> = {};

    /*
     * The actual option labels, not just how many there are.
     *
     * The preview on the page showed "Option 1, Option 2" — placeholder
     * text standing in for values that were already sitting in this
     * table. A preview made of invented data is worse than no preview:
     * it looks like the answer and is not.
     *
     * Retired options are excluded. They still exist on profiles that
     * chose them, but the app stops offering them, so a preview showing
     * one would be showing something no member can pick.
     */
    const optionValues: Record<string, string[]> = {};

    for (const row of (options ?? []) as {
      field_key: string;
      value: string;
      active: boolean;
    }[]) {
      if (!row.active) continue;
      optionCounts[row.field_key] = (optionCounts[row.field_key] ?? 0) + 1;
      (optionValues[row.field_key] ??= []).push(row.value);
    }

    return NextResponse.json({
      groups: groups.data ?? [],
      definitions: definitions.data ?? [],
      usage: counts,
      options: optionCounts,
      optionValues,
      kinds: KINDS,
    });
  } catch (error) {
    return failed(error, "Failed to load filters.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "");

    if (!id) return NextResponse.json({ error: "Missing filter." }, { status: 400 });

    const update: Record<string, unknown> = {};

    // The whole point of this route.
    if (typeof body.free === "boolean") update.free = body.free;
    if (typeof body.active === "boolean") update.active = body.active;

    if (typeof body.label === "string" && body.label.trim()) {
      update.label = body.label.trim();
    }

    if ("hint" in body) {
      update.hint = String(body.hint ?? "").trim() || null;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from("filter_definitions")
      .update(update)
      .eq("id", id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update that filter.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const key = String(body.key ?? "").trim();
    const label = String(body.label ?? "").trim();
    const column = String(body.column_name ?? "").trim();
    const kind = String(body.kind ?? "");
    const groupKey = String(body.group_key ?? "").trim();

    if (!key || !label || !column || !groupKey) {
      return NextResponse.json(
        { error: "Key, label, column and group are all required." },
        { status: 400 },
      );
    }

    if (!KINDS.includes(kind)) {
      return NextResponse.json({ error: "Unknown filter kind." }, { status: 400 });
    }

    /*
     * The column has to exist.
     *
     * A filter pointing at a misspelled column is not an error anywhere
     * — it just quietly matches nobody, and the person who set it will
     * conclude the filter works and that nobody fits.
     *
     * `distance` is the exception: it is computed by the pool query
     * rather than read from a column.
     */
    if (kind !== "distance") {
      /*
       * Selecting the column is the check.
       *
       * PostgREST rejects an unknown column outright, so a query that
       * returns without error proves it exists. limit(0) means no rows
       * are read to find that out.
       */
      const { error: columnError } = await auth.supabase
        .from("profiles")
        .select(column)
        .limit(0);

      if (columnError) {
        return NextResponse.json(
          { error: `profiles has no column named "${column}".` },
          { status: 400 },
        );
      }
    }

    const { data, error } = await auth.supabase
      .from("filter_definitions")
      .insert({
        key,
        label,
        column_name: column,
        kind,
        group_key: groupKey,
        free: body.free === true,
        hint: String(body.hint ?? "").trim() || null,
        sort_order: Number(body.sort_order ?? 999),
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "That filter key already exists." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ row: data });
  } catch (error) {
    return failed(error, "Failed to add that filter.");
  }
}
