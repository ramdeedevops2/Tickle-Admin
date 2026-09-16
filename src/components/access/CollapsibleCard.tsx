"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";

/**
 * A card whose body opens and closes.
 *
 * ── Why a shared component ────────────────────────────────────
 *
 * The screens grid and each role card want the same behaviour, and the
 * behaviour is more than a boolean: an auto-height transition, a fade
 * held slightly behind it, a chevron that turns rather than swaps, and
 * a header that is itself the button. Written twice they would drift —
 * one easing curve tweaked and not the other is exactly the kind of
 * difference nobody sees until the two sit next to each other.
 *
 * ── Why framer and not CSS ────────────────────────────────────
 *
 * The body's height is not knowable ahead of time: the grid grows with
 * the number of roles, and a role card with four permissions is a third
 * the height of one with twenty. CSS cannot transition to `auto`, and a
 * max-height guess either clips the tall case or coasts through empty
 * space on the short one. Framer measures the real height and drives it.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function CollapsibleCard({
  title,
  subtitle,
  badges,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  /** Sits beside the title — "built in", "everything", and so on. */
  badges?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card className="overflow-hidden py-0">
      {/*
        The whole header is the control.

        A small chevron beside a title invites a miss; the row people
        aim at anyway is the one that should respond.
      */}
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-6 py-5 text-left transition-colors hover:bg-foreground/[0.02]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{title}</CardTitle>
            {badges}
          </div>
          {subtitle && (
            <div className="mt-1 text-[0.86rem] leading-relaxed text-muted-foreground">
              {subtitle}
            </div>
          )}
        </div>

        {/*
          Turns rather than swaps. The same arrow moving is what says
          this is one thing opening, not two states alternating.
        */}
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.34, ease: EASE }}
          className="mt-0.5 shrink-0 text-muted-foreground"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.42, ease: EASE },
              /*
               * The fade trails the height on the way in and leads it on
               * the way out, so the box reads as opening and then
               * filling — rather than a block arriving at full strength
               * halfway through the slide.
               */
              opacity: { duration: 0.28, delay: open ? 0.08 : 0 },
            }}
            className="overflow-hidden"
          >
            <CardContent className="px-0 pb-6">{children}</CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
