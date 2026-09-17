import type { Metadata } from "next";
import { LegalArticle, loadLegalPage } from "@/lib/legalPage";

/**
 * /privacy — the Privacy Policy, public.
 *
 * Required by App Store Connect on the listing itself, and linked from
 * the paywall alongside the Terms. Same constraints as /terms: the URL
 * is submitted to Apple and must not change.
 */

export const metadata: Metadata = {
  title: "Privacy Policy — Gogter",
  description: "What Gogter collects, why, and what you can do about it.",
};

export const revalidate = 3600;

export default async function PrivacyPage() {
  const content = await loadLegalPage("privacy");
  return <LegalArticle content={content} />;
}
