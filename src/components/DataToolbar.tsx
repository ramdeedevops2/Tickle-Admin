"use client";

import { useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

  /** Shown as "N of M", so a filter that hides everything is obvious. */
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
  // Anything not left on "all", plus a non-empty search. This is what the
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
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
              className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {sorts.length > 0 && (
          <select
            value={sort}
            onChange={(event) => onSort?.(event.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            {sorts.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        )}

        {dirty && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear
            <Badge variant="secondary" className="ml-1.5">
              {active.length + (query.trim() ? 1 : 0)}
            </Badge>
          </Button>
        )}

        {onRefresh && (
          <Button variant="outline" size="icon" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        )}
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {filters.map((filter) => (
            <div key={filter.id} className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs font-medium text-muted-foreground">
                {filter.label}
              </span>

              {[{ value: "all", label: "All" }, ...filter.options].map((option) => {
                const selected = (values[filter.id] ?? "all") === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => onFilter?.(filter.id, option.value)}
                    className={
                      selected
                        ? "rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
                        : "rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
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
        <p className="text-xs text-muted-foreground">
          Showing {showing} of {total}
        </p>
      )}
    </div>
  );
}
