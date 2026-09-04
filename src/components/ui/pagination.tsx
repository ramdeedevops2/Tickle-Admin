"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Pagination.
 *
 * Every list here rendered its whole result set. That is fine at fifty
 * rows and unusable at five thousand — the browser lays out every row
 * whether or not anyone looks at it, and the page becomes a scroll with
 * no end and no sense of position.
 *
 * "Smart" here means the page numbers elide rather than run off the
 * edge: first, last, the current page and its neighbours, with gaps
 * marked. A row of two hundred page buttons is not navigation.
 */

/** How many rows a page holds. */
export const PAGE_SIZE = 30;

/**
 * The page numbers to render, with `null` standing for an elision.
 *
 * Always shows first and last so the ends stay reachable in one click,
 * and a window around the current page so its neighbours do. Below
 * eight pages nothing is hidden — eliding four pages to save one button
 * is churn for its own sake.
 */
export function pageNumbers(current: number, total: number): (number | null)[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }

  const pages = new Set<number>([1, total, current]);
  if (current - 1 > 1) pages.add(current - 1);
  if (current + 1 < total) pages.add(current + 1);

  // Keep the row a constant width near the ends, so the buttons do not
  // shift under the cursor as somebody pages through.
  if (current <= 3) [2, 3, 4].forEach((n) => n < total && pages.add(n));
  if (current >= total - 2)
    [total - 1, total - 2, total - 3].forEach((n) => n > 1 && pages.add(n));

  const sorted = [...pages].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);

  const out: (number | null)[] = [];
  let previous = 0;
  for (const page of sorted) {
    if (previous && page - previous > 1) out.push(null);
    out.push(page);
    previous = page;
  }
  return out;
}

/** Slice a list to the given page. */
export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE): T[] {
  const start = (page - 1) * size;
  return rows.slice(start, start + size);
}

export function Pagination({
  page,
  total,
  onPage,
  size = PAGE_SIZE,
  className,
}: {
  /** 1-based. */
  page: number;
  /** Total number of rows, not pages. */
  total: number;
  onPage: (page: number) => void;
  size?: number;
  className?: string;
}) {
  const pages = Math.max(1, Math.ceil(total / size));

  // One page of results needs no controls, and showing them disabled
  // just adds furniture to every short list in the panel.
  if (pages <= 1) return null;

  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 pt-3",
        className
      )}
    >
      {/* Position, in words. "Page 3 of 40" says less than knowing which
          rows are on screen and how many there are in total. */}
      <p className="tnum text-[0.86rem] text-muted-foreground">
        {from}–{to} of {total.toLocaleString()}
      </p>

      <div className="flex items-center gap-1">
        <PageButton
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          label="Previous page"
        >
          <ChevronLeft className="size-3.5" />
        </PageButton>

        {pageNumbers(page, pages).map((entry, index) =>
          entry === null ? (
            <span
              key={`gap-${index}`}
              className="px-1 text-[0.86rem] text-muted-foreground select-none"
            >
              …
            </span>
          ) : (
            <PageButton
              key={entry}
              onClick={() => onPage(entry)}
              current={entry === page}
              label={`Page ${entry}`}
            >
              <span className="tnum">{entry}</span>
            </PageButton>
          )
        )}

        <PageButton
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          label="Next page"
        >
          <ChevronRight className="size-3.5" />
        </PageButton>
      </div>
    </div>
  );
}

function PageButton({
  children,
  onClick,
  disabled,
  current,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  current?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={cn(
        "flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-[0.86rem] transition-colors",
        "disabled:pointer-events-none disabled:opacity-35",
        current
          ? "bg-primary font-medium text-primary-foreground"
          : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

/**
 * Page state that resets itself when the list underneath changes.
 *
 * Without the reset, filtering a list while on page 5 leaves you looking
 * at an empty page — the rows are gone but the page number is not, and
 * it reads as "no results" when there are plenty on page 1.
 */
export function usePagination(totalRows: number, size = PAGE_SIZE) {
  const [page, setPage] = React.useState(1);
  const pages = Math.max(1, Math.ceil(totalRows / size));

  // Clamp during render rather than in an effect: an effect would paint
  // the empty page once before correcting it.
  const safe = Math.min(page, pages);
  if (safe !== page) setPage(safe);

  return { page: safe, setPage, pages };
}
