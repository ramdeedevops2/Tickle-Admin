import type { Metadata } from "next";
import { LegalArticle, loadLegalPage } from "@/lib/legalPage";

/**
 * /terms — the Terms of Use, public.
 *
 * Linked from the app's paywall, which Apple's guideline 3.1.2
 * requires. The URL is promised to App Store Connect and must not
 * change after submission.
 *
 * No "use client", no session, no guard: this is a server component
 * that reads one public row and renders text.
 */

export const metadata: Metadata = {
  title: "Terms of Use — Gogter",
  description: "The terms that apply to using Gogter.",
};

/*
 * Read the current document on every request, including direct SQL edits.
 */
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const content = await loadLegalPage("terms");
  return <LegalArticle content={content} />;
}
