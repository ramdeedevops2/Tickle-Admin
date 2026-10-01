import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Short-lived links for the pictures and voice notes inside a
 * conversation.
 *
 * ── Why this exists ───────────────────────────────────────────
 *
 * `chat-media` is a private bucket. The panel holds the storage path of
 * every photo and voice note — it is a column on the message — but a
 * path is not something a browser can load, so the conversation stream
 * showed a word where the picture should be. Moderating a reported
 * conversation while unable to see what was sent is most of the job
 * missing.
 *
 * ── Why the panel signs rather than reading the bucket ────────
 *
 * The read policy on that bucket only lets the two people in the match
 * look. An admin is in neither side of it, by design, so the policy
 * will never let them through — and loosening it to admit admins would
 * mean every member's private photos become readable by a role that is
 * assigned in a different part of this panel. The service key used here
 * stays on the server and signs one path at a time.
 *
 * ── On the expiry ─────────────────────────────────────────────
 *
 * Ten minutes. Long enough to read a thread, short enough that a link
 * copied out of the network tab is worthless by the time anybody tries
 * it. The panel re-signs on reload rather than holding anything.
 */

const BUCKET = "chat-media";
const SIGN_SECONDS = 600;

/** The ceiling is the page size of the conversation stream. */
const MAX_PATHS = 200;

/**
 * A storage path, however the message happens to carry it.
 *
 * Newer messages keep it in `media_path`. Photos sent before those
 * columns existed put it in the text as `IMAGE:chat-media:<path>`, so
 * both spellings arrive here and both have to be understood.
 */
function normalise(raw: string): string | null {
  let path = raw.trim();

  if (path.startsWith("IMAGE:")) path = path.slice("IMAGE:".length);
  if (path.startsWith(`${BUCKET}:`)) path = path.slice(BUCKET.length + 1);

  if (!path) return null;

  /*
   * Refused rather than cleaned.
   *
   * These paths come from a database column, so a traversal is not the
   * expected case — but this route holds a service key and signs
   * whatever it is handed, so the one place it must not be clever is
   * here. A path that does not look like `<uuid>/<uuid>/<file>` is not
   * silently repaired into one.
   */
  if (path.includes("..") || path.startsWith("/")) return null;

  return path;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as { paths?: unknown };

    if (!Array.isArray(body.paths)) {
      return NextResponse.json({ error: "Nothing to look up." }, { status: 400 });
    }

    /*
     * Keyed by what the caller sent, not by what was signed.
     *
     * The caller holds `IMAGE:chat-media:<path>` and looks the result up
     * by that exact string; returning it under the cleaned path would
     * mean every older photo missed its own URL.
     */
    const wanted = new Map<string, string>();

    for (const entry of body.paths.slice(0, MAX_PATHS)) {
      if (typeof entry !== "string") continue;
      const path = normalise(entry);
      if (path) wanted.set(entry, path);
    }

    if (wanted.size === 0) return NextResponse.json({ urls: {} });

    const { data: signed, error } = await auth.supabase.storage
      .from(BUCKET)
      .createSignedUrls([...new Set(wanted.values())], SIGN_SECONDS);

    if (error) throw error;

    const byPath = new Map(
      (signed ?? [])
        .filter((row) => row.path && row.signedUrl)
        .map((row) => [row.path as string, row.signedUrl]),
    );

    const urls: Record<string, string> = {};

    for (const [asked, path] of wanted) {
      const url = byPath.get(path);
      // A missing one is left out rather than sent as null: the caller
      // draws a picture when it has a link and says so when it does not.
      if (url) urls[asked] = url;
    }

    return NextResponse.json({ urls });
  } catch (error) {
    return failed(error, "Could not open those pictures.");
  }
}
