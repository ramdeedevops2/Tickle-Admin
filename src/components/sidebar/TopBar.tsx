"use client";

import { CommandPalette } from "@/components/CommandPalette";

/*
 * The bar across the top of every screen.
 *
 * It exists to give the search one fixed home. The palette was only
 * reachable by knowing ⌘K, which is fine for the person who built it
 * and invisible to everybody else — and this panel is run by somebody
 * who should not have to learn a shortcut to find a page.
 *
 * Sticky rather than fixed: the rails are pinned because they must never
 * move, but this sits inside the scrolling column and only needs to stay
 * above the content it scrolls over.
 *
 * Filled flat with the ground colour. It used to blur what passed
 * behind it, which painted a grey band across the top: a backdrop-filter
 * samples whatever sits behind it, and with the command palette open its
 * overlay — itself a backdrop-filter — got sampled twice, so the strip
 * darkened while the rest of the page did not. There is no blur left
 * anywhere in the panel now; an opaque fill in the page's own background
 * is invisible at rest and hides what scrolls under it just as well.
 */
export function TopBar() {
  return (
    <header className="sticky top-0 z-30 mb-4 bg-background px-5 py-3">
      <div className="flex items-center gap-3">
        <CommandPalette />
      </div>
    </header>
  );
}
