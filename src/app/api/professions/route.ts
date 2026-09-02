import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The profession list.
 *
 * Editable from here rather than shipped in the app, because the list is
 * never finished — someone will always search for a job nobody thought of,
 * and adding it should not need a release.
 *
 * Retiring is a soft delete. A profession someone already chose must not
 * disappear from their profile because it left the picker, so `active`
 * hides it from search and leaves every existing answer alone.
 */

const CATEGORIES = [
  "Technology",
  "Business",
  "Healthcare",
  "Engineering",
  "Government",
  "Education",
  "Law",
  "Creative",
  "Services",
  "Other",
];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase
      .from("professions")
      .select("*")
      .order("popularity", { ascending: false })
      .order("name");

    if (error) throw error;

    const rows = (data ?? []) as { category: string; active: boolean }[];

    return NextResponse.json({
      professions: rows,
      categories: CATEGORIES,
      // Retired rows still exist and still sit on profiles, so the counts
      // are split rather than summed.
      activeCount: rows.filter((row) => row.active).length,
      retiredCount: rows.filter((row) => !row.active).length,
    });
  } catch (error) {
    return failed(error, "Failed to load professions.");
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const name = String(body.name ?? "").trim();
    const category = String(body.category ?? "").trim();

    if (name.length < 2 || name.length > 60) {
      return NextResponse.json(
        { error: "Name must be between 2 and 60 characters." },
        { status: 400 },
      );
    }

    if (!CATEGORIES.includes(category)) {
      return NextResponse.json({ error: "Unknown category." }, { status: 400 });
    }

    const synonyms = Array.isArray(body.synonyms)
      ? body.synonyms
          .map((entry) => String(entry).trim().toLowerCase())
          .filter((entry) => entry.length > 0 && entry.length <= 40)
          .slice(0, 20)
      : [];

    const popularity = Number(body.popularity ?? 0);
    if (!Number.isFinite(popularity) || popularity < 0 || popularity > 100) {
      return NextResponse.json(
        { error: "Popularity must be between 0 and 100." },
        { status: 400 },
      );
    }

    const { data, error } = await auth.supabase
      .from("professions")
      .insert({ name, category, synonyms, popularity: Math.round(popularity) })
      .select()
      .single();

    if (error) {
      // The name is unique, and "already on the list" is not a failure
      // worth a 500.
      if (error.code === "23505") {
        return NextResponse.json({ error: "That profession already exists." }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ profession: data });
  } catch (error) {
    return failed(error, "Failed to add profession.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "").trim();

    if (!id) {
      return NextResponse.json({ error: "Missing profession." }, { status: 400 });
    }

    const update: Record<string, unknown> = {};

    if (typeof body.active === "boolean") {
      update.active = body.active;
    }

    if ("popularity" in body) {
      const popularity = Number(body.popularity);
      if (!Number.isFinite(popularity) || popularity < 0 || popularity > 100) {
        return NextResponse.json(
          { error: "Popularity must be between 0 and 100." },
          { status: 400 },
        );
      }
      update.popularity = Math.round(popularity);
    }

    if ("category" in body) {
      const category = String(body.category).trim();
      if (!CATEGORIES.includes(category)) {
        return NextResponse.json({ error: "Unknown category." }, { status: 400 });
      }
      update.category = category;
    }

    if (Array.isArray(body.synonyms)) {
      update.synonyms = body.synonyms
        .map((entry) => String(entry).trim().toLowerCase())
        .filter((entry) => entry.length > 0 && entry.length <= 40)
        .slice(0, 20);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { data, error } = await auth.supabase
      .from("professions")
      .update(update)
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ profession: data });
  } catch (error) {
    return failed(error, "Failed to update profession.");
  }
}
