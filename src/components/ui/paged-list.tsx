"use client";

import * as React from "react";
import {
  Pagination,
  PAGE_SIZE,
  paginate,
  usePagination,
} from "@/components/ui/pagination";
import { cn } from "@/lib/utils";

/**
 * A list that pages itself.
 *
 * `usePagination` works when a screen has one list. It stops working the
 * moment a section is repeated — the options under each profile field,
 * the permissions under each area, the rows under each group — because a
 * hook cannot be called once per item in a loop.
 *
 * So the state lives in a component instead. Every instance owns its own
 * page number, which is what makes "a pager per section" possible at all:
 * paging the codes list leaves the milestones list where it was.
 *
 * It renders nothing but the rows and, when there is more than one page,
 * the controls. A short list looks exactly as it did before.
 */
export function PagedList<T>({
  items,
  children,
  perPage = PAGE_SIZE,
  empty,
  variant = "plain",
  className,
  controlsClassName,
}: {
  items: T[];
  /** Renders one row. Same shape as the `.map` it replaces. */
  children: (item: T, index: number) => React.ReactNode;
  perPage?: number;
  /** Shown instead of the rows when there are none. */
  empty?: React.ReactNode;
  /**
   * "settings" gives the rows SettingList's hairlines, which is what a
   * paged section inside a Section wants — the styling lives here rather
   * than being retyped at every call site.
   */
  variant?: "plain" | "settings";
  className?: string;
  controlsClassName?: string;
}) {
  const { page, setPage } = usePagination(items.length, perPage);

  if (items.length === 0) return <>{empty ?? null}</>;

  const rows = paginate(items, page, perPage);

  return (
    <>
      <div
        className={cn(
          variant === "settings" && "divide-y divide-foreground/[0.06] -my-2.5",
          className,
        )}
      >
        {rows.map((item, index) =>
          // The index passed on is the row's place in the whole list, not
          // in the page — a renderer that numbers its rows should not
          // restart at 1 on page two.
          children(item, (page - 1) * perPage + index),
        )}
      </div>

      <Pagination
        page={page}
        total={items.length}
        onPage={setPage}
        size={perPage}
        className={cn(controlsClassName)}
      />
    </>
  );
}
