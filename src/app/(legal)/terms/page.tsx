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
 * Re-rendered at most once an hour.
 *
 * Fully static would mean an edit in the admin needing a deploy to
 * appear, which defeats the point of storing the text in the database.
 * Fully dynamic would put a database call between Apple's reviewer and
 * the page. An hour is soon enough for a legal correction and rare
 * enough that the page is nearly always served from cache.
 */
export const revalidate = 3600;

export default async function TermsPage() {
  const content = await loadLegalPage("terms");
  return <LegalArticle content={content} />;
}
