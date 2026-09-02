import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The profile field registry.
 *
 * Everything the app asks people about — labels, hints, the options a
 * choice offers, the order they appear in, which group they sit under, and
 * whether they are asked at all.
 *
 * One thing here is deliberately not editable: `key`. It names a column in
 * `profiles`, so pointing a field at a different one would either break
 * every save or quietly start writing answers into the wrong column. New
 * fields still need a migration, which is right — a new column is a schema
 * change and should look like one.
 *
 * Retiring, throughout, is a soft delete. An option someone already chose
 * stays on their profile after it leaves the picker.
 */

const KINDS = ["text", "number", "choice", "multi", "prompts"];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [groups, fields, options, prompts] = await Promise.all([
      auth.supabase.from("profile_field_groups").select("*").order("sort_order"),
      auth.supabase.from("profile_fields").select("*").order("sort_order"),
      auth.supabase.from("profile_field_options").select("*").order("sort_order"),
      auth.supabase.from("profile_prompts").select("*").order("sort_order"),
    ]);

    for (const result of [groups, fields, options, prompts]) {
      if (result.error) throw result.error;
    }

    return NextResponse.json({
      groups: groups.data ?? [],
      fields: fields.data ?? [],
      options: options.data ?? [],
      prompts: prompts.data ?? [],
      kinds: KINDS,
    });
  } catch (error) {
    return failed(error, "Failed to load fields.");
  }
}

/**
 * One route for four tables, chosen by `entity`.
 *
 * They are edited together on one page and always as small changes — a
 * label, an order, an option retired — so four near-identical routes would
 * be four places to forget the same validation.
 */
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const entity = String(body.entity ?? "");
    const id = String(body.id ?? "");

    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    // Shared by all four, and the only way to hide anything: nothing on
    // this page deletes, because deleting an option orphans the profiles
    // that chose it.
    if (typeof body.active === "boolean") update.active = body.active;

    if ("sort_order" in body) {
      const order = Number(body.sort_order);
      if (!Number.isFinite(order) || order < 0 || order > 100000) {
        return NextResponse.json({ error: "Order is out of range." }, { status: 400 });
      }
      update.sort_order = Math.round(order);
    }

    const text = (value: unknown, max: number) => {
      const trimmed = String(value ?? "").trim();
      return trimmed.length > 0 && trimmed.length <= max ? trimmed : null;
    };

    switch (entity) {
      case "group": {
        if ("title" in body) {
          const title = text(body.title, 60);
          if (!title) {
            return NextResponse.json({ error: "Title is required." }, { status: 400 });
          }
          update.title = title;
        }
        // Cleared rather than required: a group whose heading says enough
        // should be able to lose its hint.
        if ("hint" in body) update.hint = text(body.hint, 200);
        break;
      }

      case "field": {
        if ("label" in body) {
          const label = text(body.label, 60);
          if (!label) {
            return NextResponse.json({ error: "Label is required." }, { status: 400 });
          }
          update.label = label;
        }

        if ("hint" in body) update.hint = text(body.hint, 200);
        if ("placeholder" in body) update.placeholder = text(body.placeholder, 80);

        if ("group_key" in body) {
          const groupKey = text(body.group_key, 40);
          if (!groupKey) {
            return NextResponse.json({ error: "Unknown group." }, { status: 400 });
          }
          update.group_key = groupKey;
        }

        if ("max_choices" in body) {
          // Null is meaningful — it is what "no limit" is stored as — so
          // it is handled before the numeric check that would read it as 0.
          if (body.max_choices === null || body.max_choices === "") {
            update.max_choices = null;
          } else {
            const max = Number(body.max_choices);
            if (!Number.isFinite(max) || max < 1 || max > 50) {
              return NextResponse.json(
                { error: "Limit must be between 1 and 50, or empty." },
                { status: 400 },
              );
            }
            update.max_choices = Math.round(max);
          }
        }
        break;
      }

      case "option":
      case "prompt": {
        const column = entity === "option" ? "value" : "question";
        if (column in body) {
          const value = text(body[column], entity === "option" ? 60 : 120);
          if (!value) {
            return NextResponse.json({ error: "Text is required." }, { status: 400 });
          }
          update[column] = value;
        }
        break;
      }

      default:
        return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const table = {
      group: "profile_field_groups",
      field: "profile_fields",
      option: "profile_field_options",
      prompt: "profile_prompts",
    }[entity]!;

    const { data, error } = await auth.supabase
      .from(table)
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ row: data });
  } catch (error) {
    return failed(error, "Failed to update.");
  }
}

/** Adding options and prompts. Groups and fields are not created here. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const entity = String(body.entity ?? "");

    if (entity === "option") {
      const fieldKey = String(body.field_key ?? "").trim();
      const value = String(body.value ?? "").trim();

      if (!fieldKey || value.length < 1 || value.length > 60) {
        return NextResponse.json({ error: "An option needs a field and a value." }, { status: 400 });
      }

      const { data, error } = await auth.supabase
        .from("profile_field_options")
        .insert({ field_key: fieldKey, value, sort_order: Number(body.sort_order ?? 999) })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "That option already exists." }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({ row: data });
    }

    if (entity === "prompt") {
      const question = String(body.question ?? "").trim();
      const kind = String(body.kind ?? "text");

      if (question.length < 5 || question.length > 120) {
        return NextResponse.json(
          { error: "A prompt must be between 5 and 120 characters." },
          { status: 400 },
        );
      }

      if (kind !== "text" && kind !== "voice") {
        return NextResponse.json({ error: "Unknown prompt kind." }, { status: 400 });
      }

      const { data, error } = await auth.supabase
        .from("profile_prompts")
        .insert({ question, kind, sort_order: Number(body.sort_order ?? 999) })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "That prompt already exists." }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({ row: data });
    }

    return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
  } catch (error) {
    return failed(error, "Failed to add.");
  }
}
