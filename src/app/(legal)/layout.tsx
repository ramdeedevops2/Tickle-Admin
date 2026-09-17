import type { Metadata } from "next";
import Link from "next/link";

/**
 * The public shell for /terms and /privacy.
 *
 * ── Why this is its own route group ───────────────────────────
 *
 * Apple's reviewer opens these pages signed out. Everything the admin
 * panel normally wraps a page in — AuthGuard, the sidebar, the command
 * palette, the Supabase session — would either redirect them to a login
 * screen or render chrome that means nothing to somebody who is not an
 * administrator.
 *
 * (legal) is a route group, so it adds a layout without adding a path
 * segment: the URLs stay /terms and /privacy, which is what goes into
 * App Store Connect and cannot change after submission.
 *
 * The parenthesised name matters. These pages sit beside (dashboard)
 * rather than inside it, and (dashboard)/layout.tsx is the only file in
 * this project that mounts AuthGuard — so nothing here is guarded, by
 * construction rather than by an exception.
 */

export const metadata: Metadata = {
  title: "Gogter",
  /*
   * Indexable on purpose.
   *
   * A privacy policy a search engine cannot see is one a person cannot
   * find when they go looking for it later, which is most of the point
   * of publishing it.
   */
  robots: { index: true, follow: true },
};

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    /*
     * Its own colours and its own base size, set inline.
     *
     * The admin's palette lives in CSS variables the dashboard layout
     * establishes, and its base font is 14px — right for a dense table,
     * wrong for eight screens of prose. Both are set here so a token
     * renamed for the panel cannot change a document Apple has already
     * reviewed.
     *
     * flex column so the footer sits under the text rather than halfway
     * up a short page.
     */
    <div
      style={{ backgroundColor: "#FAF8F5", color: "#1C1D1F", fontSize: "16px" }}
      className="flex min-h-screen flex-col"
    >
      <header className="shrink-0 border-b border-black/[0.06]">
        <div className="mx-auto flex max-w-[44rem] items-center gap-2.5 px-5 py-5">
          {/*
            The mark, drawn inline.

            An <img> here is a second request that can 404 on a fresh
            deploy, on the one page that must never look broken.
          */}
          <svg width="30" height="16" viewBox="0 0 954 480" aria-hidden="true">
            <path
              d="M300 60a180 180 0 1 0 0 360 180 180 0 0 0 175-140h-175v-80h260"
              fill="none"
              stroke="#C32039"
              strokeWidth="58"
              strokeLinecap="round"
            />
            <path
              d="M470 150a95 95 0 0 1 165-60 95 95 0 0 1 165 60c0 110-165 240-165 240S470 260 470 150z"
              fill="none"
              stroke="#C32039"
              strokeWidth="58"
              strokeLinejoin="round"
            />
          </svg>

          <span className="text-[1.05rem] font-semibold tracking-tight">Gogter</span>
        </div>
      </header>

      {/*
        44rem and 17px: read on a phone by somebody who did not choose
        to be reading it.

        flex-1 so a short page still pushes the footer down, and a
        generous bottom pad so the last line is never flush against it.
      */}
      <main className="mx-auto w-full max-w-[44rem] flex-1 px-5 pt-8 pb-16 text-[1.0625rem] leading-[1.7]">
        {children}
      </main>

      <footer className="shrink-0 border-t border-black/[0.06]">
        <div className="mx-auto flex max-w-[44rem] flex-wrap items-center gap-x-4 gap-y-1 px-5 py-6 text-[0.9rem] text-black/50">
          <Link href="/terms" className="underline underline-offset-2">
            Terms of Use
          </Link>
          <Link href="/privacy" className="underline underline-offset-2">
            Privacy Policy
          </Link>
          <span className="ml-auto">© {new Date().getFullYear()} Gogter</span>
        </div>
      </footer>
    </div>
  );
}
