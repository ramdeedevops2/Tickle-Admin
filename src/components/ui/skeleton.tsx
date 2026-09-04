import { cn } from "@/lib/utils"

/*
 * Loading placeholders.
 *
 * A sweep rather than animate-pulse. Pulse fades each block
 * independently, so a screen with a dozen of them flickers; a sweep
 * travels across all of them at one rhythm and reads as a single thing
 * arriving.
 *
 * The shapes below exist because alignment was the actual complaint:
 * a skeleton is only convincing if it occupies the same box the real
 * content will. Hand-rolled placeholders drift from whatever they stand
 * in for the moment either changes, and then the page visibly jumps on
 * load. These are sized from the components they replace.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-skeleton rounded-lg", className)}
      {...props}
    />
  )
}

/** One line of text. Defaults to the height of body copy at this scale. */
function SkeletonText({
  className,
  lines = 1,
  ...props
}: React.ComponentProps<"div"> & { lines?: number }) {
  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className={cn(
            "h-3 rounded-md",
            // The last line of a paragraph is short. A block of equal
            // bars reads as a table, not as prose.
            lines > 1 && index === lines - 1 ? "w-3/5" : "w-full"
          )}
        />
      ))}
    </div>
  )
}

/** Stands in for a Card, matching its radius, border and padding. */
function SkeletonCard({
  className,
  lines = 3,
  ...props
}: React.ComponentProps<"div"> & { lines?: number }) {
  return (
    <div
      className={cn(
        "space-y-3 rounded-2xl border border-foreground/[0.06] bg-card/85 p-4",
        className
      )}
      {...props}
    >
      <Skeleton className="h-3.5 w-1/3 rounded-md" />
      <SkeletonText lines={lines} />
    </div>
  )
}

/**
 * Stands in for a table.
 *
 * Column widths are passed in rather than assumed, so the placeholder
 * lines up with the real header above it instead of approximating it.
 */
function SkeletonTable({
  rows = 6,
  columns = ["30%", "22%", "18%", "15%", "15%"],
  className,
  ...props
}: React.ComponentProps<"div"> & { rows?: number; columns?: string[] }) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border border-foreground/[0.06] bg-card/85",
        className
      )}
      {...props}
    >
      <div className="flex gap-4 border-b border-foreground/[0.06] px-4 py-2.5">
        {columns.map((width, index) => (
          <Skeleton key={index} className="h-2.5 rounded-md" style={{ width }} />
        ))}
      </div>

      {Array.from({ length: rows }).map((_, row) => (
        <div
          key={row}
          className="flex gap-4 border-b border-foreground/[0.04] px-4 py-3 last:border-0"
        >
          {columns.map((width, index) => (
            <Skeleton key={index} className="h-3 rounded-md" style={{ width }} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** Stands in for the KPI strip, dividers included. */
function SkeletonStats({
  count = 4,
  className,
  ...props
}: React.ComponentProps<"div"> & { count?: number }) {
  return (
    <div
      className={cn(
        "grid rounded-2xl border border-foreground/[0.06] bg-card/85",
        className
      )}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
      {...props}
    >
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className={cn("space-y-2 px-5 py-4", index > 0 && "rule-x")}
        >
          <Skeleton className="h-7 w-14 rounded-md" />
          <Skeleton className="h-2.5 w-24 rounded-md" />
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonText, SkeletonCard, SkeletonTable, SkeletonStats }
