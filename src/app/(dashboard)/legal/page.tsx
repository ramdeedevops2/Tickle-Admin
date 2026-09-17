"use client";

import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageSkeleton } from "@/components/ui/page";
import { ExternalLink, Save } from "lucide-react";

/**
 * Editing the two pages Apple reads.
 *
 * ── Why this screen exists ────────────────────────────────────
 *
 * /terms and /privacy are public pages served from the database. This
 * is where their text is written. Everything here is deliberately plain
 * — two textareas and a date — because the failure mode that matters is
 * publishing something wrong, not publishing it slowly.
 *
 * ── Why the preview link opens in a new tab ───────────────────
 *
 * The public page is the thing being edited, and checking it should not
 * cost the editor their unsaved work.
 */

type LegalPage = {
  slug: "terms" | "privacy";
  title: string;
  body: string;
  effective_on: string;
  updated_at: string;
  updated_by: string | null;
};

const LABELS: Record<string, { name: string; note: string }> = {
  terms: {
    name: "Terms of Use",
    note: "Linked from the app's paywall. Apple requires this for auto-renewing subscriptions.",
  },
  privacy: {
    name: "Privacy Policy",
    note: "Required on the App Store listing and linked from the paywall.",
  },
};

export default function LegalPagesScreen() {
  const [pages, setPages] = useState<LegalPage[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, LegalPage>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<{ pages: LegalPage[] }>("/api/legal");

    if (error) {
      setError(error);
      return;
    }

    const rows = data?.pages ?? [];
    setPages(rows);

    // The textareas are uncontrolled from here on: seeded once, then
    // owned by the editor until a save reloads them.
    const next: Record<string, LegalPage> = {};
    for (const row of rows) next[row.slug] = { ...row };
    setDrafts(next);
  }, []);

  useLoadOnMount(load);

  const save = useCallback(
    async (slug: string) => {
      const draft = drafts[slug];
      if (!draft) return;

      setBusy(slug);
      setError(null);
      setSaved(null);

      const { error } = await adminFetch("/api/legal", {
        method: "PATCH",
        body: JSON.stringify({
          slug,
          title: draft.title,
          body: draft.body,
          effective_on: draft.effective_on,
        }),
      });

      if (error) setError(error);
      else {
        setSaved(slug);
        await load();
      }

      setBusy(null);
    },
    [drafts, load],
  );

  const edit = useCallback((slug: string, patch: Partial<LegalPage>) => {
    setDrafts((current) => ({
      ...current,
      [slug]: { ...current[slug], ...patch },
    }));
    setSaved(null);
  }, []);

  if (!pages) return <PageSkeleton sections={2} />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Terms and privacy"
        description="The two public pages the app links to. Edits appear on the live pages within an hour."
      />

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-[0.86rem] text-destructive">
          {error}
        </div>
      )}

      {pages.map((page) => {
        const draft = drafts[page.slug] ?? page;
        const meta = LABELS[page.slug];
        const dirty =
          draft.title !== page.title ||
          draft.body !== page.body ||
          draft.effective_on !== page.effective_on;

        return (
          <Card key={page.slug}>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{meta?.name ?? page.slug}</CardTitle>

                <Badge variant="outline" className="font-mono text-[0.75rem]">
                  /{page.slug}
                </Badge>

                {dirty && <Badge variant="destructive">unsaved</Badge>}
                {saved === page.slug && !dirty && <Badge>saved</Badge>}

                <a
                  href={`/${page.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-[0.86rem] text-muted-foreground underline-offset-2 hover:underline"
                >
                  View live page
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <CardDescription>{meta?.note}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
                <div className="space-y-1.5">
                  <Label htmlFor={`${page.slug}-title`}>Heading</Label>
                  <Input
                    id={`${page.slug}-title`}
                    value={draft.title}
                    onChange={(e) => edit(page.slug, { title: e.target.value })}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${page.slug}-date`}>Last updated</Label>
                  <Input
                    id={`${page.slug}-date`}
                    type="date"
                    value={draft.effective_on}
                    onChange={(e) => edit(page.slug, { effective_on: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor={`${page.slug}-body`}>Page text</Label>

                {/*
                  A plain textarea, not a rich editor.

                  The text is pasted from a legal document and rendered
                  as Markdown. A rich editor would mean storing HTML,
                  which on a public page means either trusting a paste
                  or sanitising it.
                */}
                <textarea
                  id={`${page.slug}-body`}
                  value={draft.body}
                  onChange={(e) => edit(page.slug, { body: e.target.value })}
                  spellCheck={false}
                  className="min-h-[26rem] w-full rounded-md border border-input bg-transparent px-3 py-2 font-mono text-[0.86rem] leading-relaxed outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                />

                <p className="text-[0.8rem] text-muted-foreground">
                  Markdown: <code># heading</code>, <code>## subheading</code>,{" "}
                  <code>- bullet</code>, <code>**bold**</code>,{" "}
                  <code>[link](https://…)</code>. A blank line starts a new paragraph.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={() => save(page.slug)} disabled={busy !== null || !dirty}>
                  <Save className="h-4 w-4" />
                  {busy === page.slug ? "Saving…" : "Save and publish"}
                </Button>

                {dirty && (
                  <button
                    type="button"
                    onClick={() => edit(page.slug, { ...page })}
                    className="text-[0.86rem] text-muted-foreground underline-offset-2 hover:underline"
                  >
                    Discard changes
                  </button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
