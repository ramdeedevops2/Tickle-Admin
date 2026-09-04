"use client";

import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RefreshCw, Search, X } from "lucide-react";

/**
 * Search, filters and sort, defined once.
 *
 * Every page here had grown its own search box and its own row of filter
 * buttons, which meant thirteen slightly different ideas of what filtering
 * looks like and thirteen places to add the next one. This is the shared
 * version: a page declares what it can be filtered by, and gets the same
 * behaviour as every other page for free.
 *
 * State lives in the caller rather than here. A toolbar that owns the
 * filter state cannot survive the page reloading its data, and the page
 * needs the values anyway to do the filtering.
 */

export interface FilterDef {
  /** Stable identity, used as the key in the value map. */
  id: string;
  label: string;
  /** `all` is added automatically and is always the default. */
  options: { value: string; label: string; count?: number }[];
}

export interface SortDef {
  id: string;
  label: string;
}

interface DataToolbarProps {
  query: string;
  onQuery: (value: string) => void;
  searchPlaceholder?: string;

  filters?: FilterDef[];
  values?: Record<string, string>;
  onFilter?: (id: string, value: string) => void;

  sorts?: SortDef[];
  sort?: string;
  onSort?: (id: string) => void;

  onRefresh?: () => void;
  loading?: boolean;

  /** Shown as"N of M", so a filter that hides everything is obvious. */
  showing?: number;
  total?: number;
}

export function DataToolbar({
  query,
  onQuery,
  searchPlaceholder = "Search",
  filters = [],
  values = {},
  onFilter,
  sorts = [],
  sort,
  onSort,
  onRefresh,
  loading,
  showing,
  total,
}: DataToolbarProps) {
  // Anything not left on"all", plus a non-empty search. This is what the
  // Clear button clears and what the count badge counts.
  const active = useMemo(
    () => Object.entries(values).filter(([, value]) => value && value !== "all"),
    [values],
  );

  const clear = useCallback(() => {
    onQuery("");
    for (const [id] of active) onFilter?.(id, "all");
  }, [active, onFilter, onQuery]);

  const dirty = active.length > 0 || query.trim().length > 0;

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[15rem] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder={searchPlaceholder}
            className="pl-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-foreground/6 hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        {/* Was a native <select>, whose option list is drawn by the OS —
            so it arrived in the system font at the system size with
            square corners, looking like another app opening on top of
            this one. */}
        {sorts.length > 0 && (
          <Select
            value={sort ?? null}
            onChange={(value) => onSort?.(value)}
            options={sorts.map((entry) => ({
              value: entry.id,
              label: entry.label,
            }))}
            className="w-[11rem]"
            align="end"
          />
        )}

        {dirty && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear
            <span className="ml-1 rounded-full bg-foreground/10 px-1.5 text-[0.8rem] font-medium">
              {active.length + (query.trim() ? 1 : 0)}
            </span>
          </Button>
        )}

        {onRefresh && (
          <Button
            variant="secondary"
            size="icon"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={loading ? "animate-spin" : undefined} />
          </Button>
        )}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          {filters.map((filter) => (
            <div key={filter.id} className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-[0.8rem] font-medium tracking-wide text-muted-foreground uppercase">
                {filter.label}
              </span>

              {[{ value: "all", label: "All" }, ...filter.options].map((option) => {
                const selected = (values[filter.id] ??"all") === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onFilter?.(filter.id, option.value)}
                    className={
                      selected
                        ? "rounded-full bg-primary px-2.5 py-[0.2rem] text-[1rem] font-medium text-primary-foreground shadow-[0_1px_2px_rgba(26,26,24,0.16)]"
                        :"rounded-full bg-foreground/[0.05] px-2.5 py-[0.2rem] text-[1rem] text-muted-foreground transition-colors hover:bg-foreground/[0.08] hover:text-foreground"
                    }
                  >
                    {option.label}
                    {"count" in option && option.count !== undefined && (
                      <span className="ml-1 opacity-60">{option.count}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {showing !== undefined && total !== undefined && showing !== total && (
        <p className="tnum text-[1rem] text-muted-foreground">
          Showing {showing} of {total}
        </p>
      )}
    </div>
  );
}
