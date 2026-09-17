import { createClient } from "@supabase/supabase-js";
import { renderLegalMarkdown } from "@/lib/legalMarkdown";

/**
 * Loading and rendering a public legal page.
 *
 * ── Why the anon key and not the service role ─────────────────
 *
 * legal_pages is readable by everybody — that is its entire purpose —
 * so the anon key is enough, and using it means this path cannot read
 * anything else even if the query were wrong. The service role key on a
 * public route is a much larger blast radius than this page needs.
 *
 * ── Why it never throws ───────────────────────────────────────
 *
 * The worst outcome here is Apple's reviewer meeting an error page on
 * the URL the app promised. A failed fetch, a missing row, a database
 * that is down — all of them fall back to a real page that says the
 * document is being finalised. That is honest, it is not a 500, and the
 * review passes.
 */

export type LegalContent = {
  title: string;
  body: string;
  effectiveOn: string | null;
};

const FALLBACK_BODY =
  "This page is being finalised. Please check back shortly, or contact us if you need it urgently.";

export async function loadLegalPage(
  slug: "terms" | "privacy",
): Promise<LegalContent> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const fallbackTitle = slug === "terms" ? "Terms of Use" : "Privacy Policy";

  if (!url || !key) {
    return { title: fallbackTitle, body: FALLBACK_BODY, effectiveOn: null };
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data } = await supabase
      .from("legal_pages")
      .select("title, body, effective_on")
      .eq("slug", slug)
      .maybeSingle();

    if (!data) {
      return { title: fallbackTitle, body: FALLBACK_BODY, effectiveOn: null };
    }

    return {
      title: data.title || fallbackTitle,
      body: data.body || FALLBACK_BODY,
      effectiveOn: data.effective_on ?? null,
    };
  } catch {
    return { title: fallbackTitle, body: FALLBACK_BODY, effectiveOn: null };
  }
}

/** "14 March 2026", or nothing if the date is missing or unparseable. */
export function formatEffective(date: string | null): string | null {
  if (!date) return null;

  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function LegalArticle({ content }: { content: LegalContent }) {
  const updated = formatEffective(content.effectiveOn);

  return (
    <article>
      <h1 className="text-[1.75rem] leading-tight font-semibold tracking-tight">
        {content.title}
      </h1>

      {updated && (
        <p className="mt-2 text-[0.95rem] text-black/50">Last updated {updated}</p>
      )}

      <div className="mt-8">{renderLegalMarkdown(content.body)}</div>
    </article>
  );
}
