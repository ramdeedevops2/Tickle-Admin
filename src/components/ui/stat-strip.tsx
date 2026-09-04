import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * The KPI strip.
 *
 * The sharpest idea in the reference: four stats separated by hairline
 * rules inside one container, rather than four separate cards. It reads
 * as one object holding four facts instead of four objects competing,
 * and it costs a quarter of the vertical space of a card row.
 *
 * The numeral is large and *light*. Size carries the hierarchy; weight
 * stays low. Large and bold would shout, and there are four of them.
 */

export type Stat = {
  label: string;
  value: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  /** Optional series for the small bar sparkline beneath the number. */
  spark?: number[];
  /** Tint for the icon chip. Defaults to neutral. */
  tone?: "neutral" | "success" | "warning" | "destructive";
};

/* Colour on the glyph itself. No chip behind it. */
const TONES: Record<NonNullable<Stat["tone"]>, string> = {
  neutral: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

export function StatStrip({
  stats,
  className,
}: {
  stats: Stat[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-2xl border border-foreground/[0.06] bg-card/85",
        className
      )}
      style={{
        // minmax(0,1fr) rather than 1fr: without the zero minimum a long
        // value forces its column wider and the dividers stop being even.
        gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`,
      }}
    >
      {stats.map((stat, index) => {
        const Icon = stat.icon;

        return (
          <div
            key={stat.label}
            className={cn("px-5 py-4", index > 0 && "rule-x")}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="tnum text-[2rem] leading-none font-light tracking-tight">
                {stat.value}
              </span>

              {Icon && (
                <Icon
                  className={cn("size-4 shrink-0", TONES[stat.tone ?? "neutral"])}
                />
              )}
            </div>

            <p className="mt-2 truncate text-[0.86rem] text-muted-foreground">
              {stat.label}
            </p>

            {stat.spark && stat.spark.length > 0 && (
              <Sparkline values={stat.spark} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/*
 * The barcode sparkline from the reference.
 *
 * Deliberately unlabelled and unscaled — it shows shape, not values, and
 * putting an axis on something 12px tall would imply a precision it does
 * not have. Rendered as flex children rather than SVG so it reflows with
 * the column instead of needing a measured width.
 */
function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);

  return (
    <div
      aria-hidden
      className="mt-2.5 flex h-4 items-end gap-px overflow-hidden"
    >
      {values.map((value, index) => (
        <span
          key={index}
          className="flex-1 rounded-[1px] bg-foreground/20"
          // A floor of 12%, so an empty bucket still shows a tick. Bars
          // of literal zero height read as missing data rather than low.
          style={{ height: `${Math.max(12, (value / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

/** The green/red dot-and-label pill used for status throughout. */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: "success" | "warning" | "destructive" | "neutral";
  children: React.ReactNode;
  className?: string;
}) {
  const dot: Record<typeof tone, string> = {
    success: "bg-success",
    warning: "bg-warning",
    destructive: "bg-destructive",
    neutral: "bg-muted-foreground",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[0.86rem] font-medium",
        TONES[tone],
        className
      )}
    >
      {/* Never colour alone: the dot plus the word means the state is
          still readable to anyone who cannot separate red from green. */}
      <span className={cn("size-1.5 rounded-full", dot[tone])} />
      {children}
    </span>
  );
}
