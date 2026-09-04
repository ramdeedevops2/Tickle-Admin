"use client";

import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * What a filter actually looks like in the app.
 *
 * The page listed filters as a key, a column name and a kind — three
 * pieces of database vocabulary that say nothing about what a member
 * sees. Someone adding a filter picked "multi" from a dropdown and had
 * no way to know whether that produced a slider, a row of chips or a
 * switch until it shipped.
 *
 * These are deliberately non-interactive. It is a picture of a control,
 * not a working one, and making it clickable would invite the admin to
 * think they were setting a value for somebody.
 */

export type FilterKind = "range" | "choice" | "multi" | "boolean" | "distance";

/** One line saying what the member does with it, and what it filters on. */
export const KIND_COPY: Record<FilterKind, { label: string; hint: string }> = {
  range: {
    label: "A slider between two numbers",
    hint: "Members drag two handles to set a minimum and a maximum. Best for age or height.",
  },
  distance: {
    label: "A distance slider",
    hint: "One handle, measured from where the member is. Best for how far they will travel.",
  },
  choice: {
    label: "Pick one",
    hint: "A row of options where choosing a second replaces the first.",
  },
  multi: {
    label: "Pick as many as you like",
    hint: "The same row, but options add up. Anyone matching any of them is shown.",
  },
  boolean: {
    label: "A single on/off switch",
    hint: "Either members want this or they do not. No middle setting.",
  },
};

export function FilterPreview({
  kind,
  label,
  options = [],
  className,
}: {
  kind: string;
  label: string;
  /**
   * The real option labels for this filter, in the order members see
   * them. Empty means the filter has none — which the preview says out
   * loud rather than papering over, because a choice filter with no
   * options shows nothing in the app and this page is where that has to
   * become visible.
   */
  options?: string[];
  className?: string;
}) {
  const copy = KIND_COPY[kind as FilterKind];

  return (
    <div
      // aria-hidden and pointer-events-none: it is an illustration, and
      // a screen reader announcing a slider nobody can move is worse
      // than it announcing nothing.
      aria-hidden
      className={cn(
        "pointer-events-none rounded-xl border border-foreground/[0.06] bg-card/70 p-3 select-none",
        className
      )}
    >
      <p className="mb-2 text-[0.86rem] font-medium">{label || "Untitled filter"}</p>

      {(kind === "range" || kind === "distance") && <SliderPreview single={kind === "distance"} />}
      {(kind === "choice" || kind === "multi") && (
        <ChipsPreview options={options} multi={kind === "multi"} />
      )}
      {kind === "boolean" && <SwitchPreview />}

      {!copy && (
        <p className="text-[0.86rem] text-muted-foreground">
          No preview for this kind yet.
        </p>
      )}

      {copy && (
        <p className="mt-2 text-[0.8rem] leading-relaxed text-muted-foreground">
          {copy.hint}
        </p>
      )}
    </div>
  );
}

function SliderPreview({ single }: { single: boolean }) {
  return (
    <div className="py-1.5">
      <div className="relative h-1 rounded-full bg-foreground/[0.1]">
        <div
          className="absolute h-1 rounded-full bg-foreground/60"
          style={single ? { left: 0, right: "38%" } : { left: "22%", right: "28%" }}
        />
        {!single && (
          <span className="absolute top-1/2 left-[22%] size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/20 bg-white shadow-sm" />
        )}
        <span
          className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/20 bg-white shadow-sm"
          style={{ left: single ? "62%" : "72%" }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[0.8rem] text-muted-foreground">
        <span>{single ? "Anywhere" : "Lowest"}</span>
        <span>{single ? "25 km" : "Highest"}</span>
      </div>
    </div>
  );
}

function ChipsPreview({ options, multi }: { options: string[]; multi: boolean }) {
  /*
   * A choice filter borrows its options from the matching profile field.
   * When that field has none, the app shows an empty filter — so saying
   * so here is the whole point of having a preview.
   */
  if (options.length === 0) {
    return (
      <p className="text-[0.8rem] text-warning">
        No options set up yet, so this filter shows nothing in the app. Add
        them to the matching field first.
      </p>
    );
  }

  // Five is enough to show the shape; the rest are counted.
  const shown = options.slice(0, 5);
  const rest = options.length - shown.length;

  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((option, index) => {
        // One selected for "pick one", two for "pick as many as you like",
        // so the difference between the kinds is visible at a glance.
        const on = multi ? index < 2 : index === 0;

        return (
          <span
            key={option}
            className={cn(
              "flex items-center gap-1 rounded-full px-2.5 py-1 text-[0.8rem]",
              on
                ? "bg-primary text-primary-foreground"
                : "bg-foreground/[0.05] text-muted-foreground"
            )}
          >
            {on && multi && <Check className="size-2.5" />}
            {option}
          </span>
        );
      })}

      {rest > 0 && (
        <span className="flex items-center gap-1 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[0.8rem] text-muted-foreground">
          +{rest} more
          <ChevronDown className="size-2.5" />
        </span>
      )}
    </div>
  );
}

function SwitchPreview() {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[0.86rem] text-muted-foreground">Only show these</span>
      <span className="relative inline-flex items-center">
        <span className="h-5 w-9 rounded-full bg-primary" />
        <span className="absolute left-[1.125rem] size-4 rounded-full bg-white shadow-sm" />
      </span>
    </div>
  );
}
