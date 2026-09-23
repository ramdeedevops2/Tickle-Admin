"use client";

import { usePathname } from "next/navigation";
import { useMyAccess } from "@/lib/useMyAccess";

/**
 * Refuses a screen the signed-in admin has no permission for.
 *
 * ── Why here and not on each page ─────────────────────────────
 *
 * One place that maps a route to its permission is one place to keep
 * correct. A check copied into fifteen pages is fifteen chances to add
 * a sixteenth page and forget.
 *
 * ── What this is not ──────────────────────────────────────────
 *
 * It is not the security boundary. It renders in the browser, so a
 * determined person can bypass it; what stops them is requireAdmin on
 * the routes the page calls, which refuses regardless of what the
 * interface drew. This exists so somebody who cannot use a screen is
 * told plainly instead of meeting a page full of failed requests.
 */

/** Route prefix to the permission that opens it. */
const PAGE_PERMISSION: { prefix: string; permission: string }[] = [
  // Longest first: "/" matches everything, so it has to be tested last.
  { prefix: "/members", permission: "page.members" },
  { prefix: "/connections", permission: "page.connections" },
  { prefix: "/hearts", permission: "page.hearts" },
  { prefix: "/places", permission: "page.places" },
  { prefix: "/coffee", permission: "page.coffee" },
  { prefix: "/geo", permission: "page.geo" },
  { prefix: "/safety", permission: "page.safety" },
  { prefix: "/roses", permission: "page.roses" },
  { prefix: "/plans", permission: "page.plans" },
  { prefix: "/codes", permission: "page.codes" },
  { prefix: "/seed", permission: "page.seed" },
  { prefix: "/web-reader", permission: "page.seed" },
  { prefix: "/compatibility", permission: "page.compatibility" },
  { prefix: "/fields", permission: "page.fields" },
  { prefix: "/messaging", permission: "page.messaging" },
  { prefix: "/access", permission: "page.access" },
  { prefix: "/legal", permission: "page.legal" },
  { prefix: "/", permission: "page.pulse" },
];

export function PageGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can, ready } = useMyAccess();

  // Nothing is refused until the answer is in, or every navigation
  // would flash a refusal before settling.
  if (!ready) return <>{children}</>;

  const match = PAGE_PERMISSION.find(
    (entry) => pathname === entry.prefix || pathname.startsWith(`${entry.prefix}/`),
  );

  if (match && !can(match.permission)) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-2 px-6 text-center">
        <h1 className="text-[1.05rem] font-semibold">This screen is not yours to open</h1>
        <p className="max-w-sm text-[0.9rem] text-muted-foreground">
          Your role does not include this screen. A super admin can give you access
          from the Access page.
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
