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
 * Filters are not created here. One has to match a column the app
 * already stores, so a form that invented them produced something that
 * looked live and matched nobody. This route reads them, and flips the
 * two things about a filter that are genuinely a decision: whether it
 * is free, and whether it is offered at all.
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

/*
 * No POST.
 *
 * Creating a filter from the panel is gone. A filter has to match a
 * column the app already stores, so inventing one from a form produced
 * something that looked live and quietly matched nobody — the fields
 * themselves are the place new ones come from.
 */
