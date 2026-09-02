"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ExternalLink, RefreshCw, Search, Trash2 } from "lucide-react";

/**
 * The venue cache.
 *
 * Every place here was paid for once, in a Google Places call, and is kept
 * so the next person standing outside the same café costs nothing. Two
 * things are worth watching: which venues people actually use, and how much
 * of the table is dead weight — venues cached months ago that have never
 * held a single heart.
 */

type PlaceRow = {
  id: string;
  google_place_id: string;
  name: string;
  category: string | null;
  address: string | null;
  latitude: number;
  longitude: number;
  photo_ref: string | null;
  cached_at: string | null;
  active_hearts: number;
  total_hearts: number;
  sparks: number;
};

type SortKey = "recent" | "hearts" | "sparks" | "name";

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
}

/** "restaurant_bar" and "cafe" both want to read as words on screen. */
function prettyCategory(value: string | null) {
  if (!value) return "-";
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PlacesPage() {
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("hearts");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<{ places: PlaceRow[] }>("/api/places");

    if (error) setError(error);
    else setPlaces(data?.places ?? []);

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const remove = useCallback(
    async (place: PlaceRow) => {
      if (
        !window.confirm(
          `Remove ${place.name} from the cache? It will be fetched from Google again next time someone is nearby.`,
        )
      ) {
        return;
      }

      setBusy(true);
      const { error } = await adminFetch(`/api/places?id=${encodeURIComponent(place.id)}`, {
        method: "DELETE",
      });
      if (error) setError(error);
      await load();
      setBusy(false);
    },
    [load],
  );

  const stats = useMemo(() => {
    const used = places.filter((place) => place.total_hearts > 0).length;
    const live = places.reduce((sum, place) => sum + place.active_hearts, 0);

    return {
      total: places.length,
      used,
      live,
      // The share of the cache that has never done anything. High is not
      // automatically bad — it means broad coverage — but a number that only
      // ever climbs means we are caching a city nobody is in.
      idle: places.length > 0 ? Math.round(((places.length - used) / places.length) * 100) : 0,
    };
  }, [places]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const filtered = q
      ? places.filter(
          (place) =>
            place.name.toLowerCase().includes(q) ||
            place.address?.toLowerCase().includes(q) ||
            place.category?.toLowerCase().includes(q),
        )
      : places;

    const sorted = [...filtered];

    if (sort === "hearts") sorted.sort((a, b) => b.total_hearts - a.total_hearts);
    else if (sort === "sparks") sorted.sort((a, b) => b.sparks - a.sparks);
    else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else {
      sorted.sort(
        (a, b) => new Date(b.cached_at ?? 0).getTime() - new Date(a.cached_at ?? 0).getTime(),
      );
    }

    return sorted;
  }, [places, query, sort]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Places</h2>
          <p className="text-muted-foreground">
            Venues cached from Google, and what has happened at each.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="rounded-none border border-border bg-transparent pl-8"
              placeholder="Name, address or type"
            />
          </div>
          <Button
            variant="outline"
            onClick={load}
            disabled={loading}
            className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
          >
            <RefreshCw className="mr-2 size-4" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Cached Venues" value={stats.total} />
        <Stat label="Ever Used" value={stats.used} />
        <Stat label="Live Hearts" value={stats.live} />
        <Stat label="Never Used" value={`${stats.idle}%`} />
      </div>

      <div className="flex w-fit border border-border/50">
        {(
          [
            ["hearts", "Most Hearts"],
            ["sparks", "Most Sparks"],
            ["recent", "Newest"],
            ["name", "A-Z"],
          ] as [SortKey, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSort(key)}
            className={`px-4 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
              sort === key
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="rounded-md border border-border/50 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead>Venue</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Live</TableHead>
              <TableHead className="text-right">All Hearts</TableHead>
              <TableHead className="text-right">Sparks</TableHead>
              <TableHead className="text-right">Cached</TableHead>
              <TableHead className="w-20" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  Loading places...
                </TableCell>
              </TableRow>
            ) : visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No places cached yet.
                </TableCell>
              </TableRow>
            ) : (
              visible.map((place) => (
                <TableRow key={place.id} className="border-border/50">
                  <TableCell>
                    <div className="font-medium">{place.name}</div>
                    <div className="max-w-md truncate text-xs text-muted-foreground">
                      {place.address || "No address"}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {prettyCategory(place.category)}
                  </TableCell>
                  <TableCell className="text-right">
                    {place.active_hearts > 0 ? (
                      <Badge
                        variant="outline"
                        className="rounded-none border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                      >
                        {place.active_hearts}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {place.total_hearts || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {place.sparks || <span className="text-muted-foreground">-</span>}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {formatDate(place.cached_at)}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${place.latitude}%2C${place.longitude}&query_place_id=${place.google_place_id}`}
                        target="_blank"
                        rel="noreferrer"
                        title="Open on Google Maps"
                        className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-none"
                        title="Remove from cache"
                        disabled={busy}
                        onClick={() => remove(place)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-3xl font-black tracking-tight">{value}</CardContent>
    </Card>
  );
}
