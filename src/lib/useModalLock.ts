"use client";

import { useEffect } from "react";

/**
 * While a modal is open, the panel behind it is frozen.
 *
 * Two separate leaks, and a full-screen overlay only plugs one of them.
 * It does catch clicks aimed at the page — but a wheel over it still
 * scrolls the column underneath, because the overlay is not itself
 * scrollable and the wheel goes to the nearest ancestor that is. And Tab
 * still walks into the links behind it, which is the same problem
 * arriving by keyboard.
 *
 * So the lock does two things the overlay cannot:
 *
 *   1. `overflow: hidden` on the scrolling column. Note that this is
 *      *not* `document.body` — the layout pins the document to the
 *      viewport and scrolls the middle column instead, so a body-level
 *      lock is the null operation people are surprised by.
 *   2. `inert` on the shell that holds the rails and that column, which
 *      takes everything behind the modal out of reach of the pointer,
 *      the focus ring and the accessibility tree in one attribute.
 *
 * Both need the modal to live *outside* the shell, or the lock would
 * freeze the modal along with the page — which is why every modal here
 * portals to document.body.
 */

/* Modal on modal (a confirm raised from a sheet) must not unlock the page
   when only the inner one closes, so the state is a depth count shared
   across every caller rather than a boolean per component. */
let depth = 0;
let release: (() => void) | null = null;

function freeze() {
  const shell = document.querySelector<HTMLElement>("[data-app-shell]");
  const scroller = document.querySelector<HTMLElement>("[data-scroll-root]");

  if (!shell || !scroller) return;

  // Hiding the overflow takes the scrollbar with it, and the column would
  // widen by its width the instant a modal opened. Holding the gap open
  // as padding keeps the page still underneath.
  const gap = scroller.offsetWidth - scroller.clientWidth;
  const overflow = scroller.style.overflow;
  const padding = scroller.style.paddingRight;

  scroller.style.overflow = "hidden";
  if (gap > 0) scroller.style.paddingRight = `${gap}px`;
  shell.setAttribute("inert", "");

  release = () => {
    scroller.style.overflow = overflow;
    scroller.style.paddingRight = padding;
    shell.removeAttribute("inert");
  };
}

/** Pass whether the modal is open. Unlocks itself when it closes or unmounts. */
export function useModalLock(active: boolean) {
  useEffect(() => {
    if (!active) return;

    if (depth === 0) freeze();
    depth += 1;

    return () => {
      depth -= 1;

      if (depth === 0) {
        release?.();
        release = null;
      }
    };
  }, [active]);
}
