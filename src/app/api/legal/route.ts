import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Editing the two public legal pages.
 *
 * ── Why these are editable at all ─────────────────────────────
 *
 * /terms and /privacy are what Apple's reviewer opens, and their text
 * changes for reasons unrelated to the release cycle: a lawyer rewrites
 * a clause, a sub-processor is added, a reviewer objects to a sentence.
 * An app in review cannot wait for a rebuild to fix a paragraph, so the
 * text lives in the database and this route is how it gets there.
 *
 * ── What is deliberately not editable ─────────────────────────
 *
 * The slug. /terms and /privacy are submitted to App Store Connect and
 * must never move, so this route can update the two rows the migration
 * created and cannot create a third or rename one.
 */

const SLUGS = new Set(["terms", "privacy"]);

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { data, error } = await auth.supabase
      .from("legal_pages")
      .select("slug, title, body, effective_on, updated_at, updated_by")
      .order("slug");

    if (error) throw error;

    return NextResponse.json({ pages: data ?? [] });
  } catch (error) {
    return failed(error, "Failed to load the legal pages.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as {
      slug?: string;
      title?: string;
      body?: string;
      effective_on?: string;
    };

    const slug = body.slug?.trim();

    if (!slug || !SLUGS.has(slug)) {
      return NextResponse.json(
        { error: "Which page? Only 'terms' and 'privacy' can be edited." },
        { status: 400 },
      );
    }

    const title = body.title?.trim();
    const text = body.body;

    if (!title) {
      return NextResponse.json({ error: "The page needs a title." }, { status: 400 });
    }

    /*
     * An empty body is refused.
     *
     * A blank privacy policy still returns 200, so nothing would alert
     * anybody — the page would simply be empty on the URL Apple is
     * checking. Better to refuse the save.
     */
    if (!text || text.trim().length === 0) {
      return NextResponse.json(
        { error: "The page cannot be published empty." },
        { status: 400 },
      );
    }

    /*
     * The date is validated rather than trusted.
     *
     * It is typed by hand, it is printed as "Last updated" on a legal
     * document, and Postgres would reject a malformed one with an error
     * nobody reading this panel could act on.
     */
    let effectiveOn = body.effective_on?.trim();

    if (effectiveOn && !/^\d{4}-\d{2}-\d{2}$/.test(effectiveOn)) {
      return NextResponse.json(
        { error: "The date should look like 2026-09-17." },
        { status: 400 },
      );
    }

    if (!effectiveOn) effectiveOn = new Date().toISOString().slice(0, 10);

    const { error } = await auth.supabase
      .from("legal_pages")
      .update({
        title,
        body: text,
        effective_on: effectiveOn,
        updated_at: new Date().toISOString(),
        updated_by: auth.user.id,
      })
      .eq("slug", slug);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to save that page.");
  }
}
