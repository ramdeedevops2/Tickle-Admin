"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";

/**
 * Where hearts may be dropped.
 *
 * The most consequential page in the panel. Allowing a category means
 * strangers can be pointed at a place and told somebody is there — fine
 * for a café, not fine for a clinic, a school, or the building somebody
 * lives in.
 *
 * Blocking a venue takes down the hearts already at it. A block that
 * only governed the future would leave the actual problem live.
 */

type Category = {
  id: string;
  category: string;
  label: string;
  allowed: boolean;
  reason: string | null;
};

type Blocked = {
  id: string;
  reason: string;
  created_at: string;
  places: { name: string; address: string } | null;
};

type Payload = {
  categories: Category[];
  blocked: Blocked[];
  places: { id: string; name: string; category: string; address: string }[];
  captureRadius: number;
  unclassified: string[];
};

export default function VenuesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [blockPlace, setBlockPlace] = useState("");
  const [blockReason, setBlockReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/venues");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const patch = useCallback(
    async (update: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/venues", {
        method: "PATCH",
        body: JSON.stringify(update),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const add = useCallback(
    async (payload: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/venues", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const unblock = useCallback(
    async (id: string) => {
      setBusy(true);

      const { error } = await adminFetch(`/api/venues?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const allowed = (data?.categories ?? []).filter((entry) => entry.allowed);
  const blocked = (data?.categories ?? []).filter((entry) => !entry.allowed);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Venues</h2>
          <p className="text-muted-foreground">
            Where hearts may be dropped, and how close somebody has to be.
          </p>
        </div>
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {(data?.unclassified.length ?? 0) > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 pt-6 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">Categories nobody has ruled on</p>
              <p className="text-muted-foreground">
                These appear on cached places but are not in the list below, so hearts are
                refused there. Add them if they should be allowed:{" "}
                <span className="font-mono text-xs">
                  {data?.unclassified.join(", ")}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capture radius</CardTitle>
          <p className="text-sm text-muted-foreground">
            How close somebody must be, in metres. Phone GPS is routinely off by ten to
            twenty metres indoors — a tighter radius does not make this precise, it makes
            it fail for people who are genuinely there.
          </p>
        </CardHeader>
        <CardContent>
          <Input
            type="number"
            min={5}
            max={200}
            defaultValue={data?.captureRadius ?? 15}
            disabled={busy}
            onBlur={(event) => {
              const next = Number(event.target.value);
              if (next !== data?.captureRadius) patch({ capture_radius_m: next });
            }}
            className="h-9 w-32"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Allowed ({allowed.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {allowed.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => patch({ id: entry.id, allowed: false })}
                disabled={busy}
                title="Block this category"
                className="rounded-full border px-3 py-1.5 text-sm hover:border-destructive hover:text-destructive"
              >
                {entry.label}
              </button>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Blocked ({blocked.length})</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {blocked.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => patch({ id: entry.id, allowed: true })}
                disabled={busy}
                title={entry.reason ?? "Allow this category"}
                className="rounded-full border border-dashed px-3 py-1.5 text-sm text-muted-foreground hover:border-foreground hover:text-foreground"
              >
                {entry.label}
                {entry.reason && (
                  <span className="ml-1.5 text-xs opacity-60">{entry.reason}</span>
                )}
              </button>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blocked venues</CardTitle>
          <p className="text-sm text-muted-foreground">
            Blocking one removes the hearts already there.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <select
              value={blockPlace}
              onChange={(event) => setBlockPlace(event.target.value)}
              className="h-9 min-w-[220px] rounded-md border bg-background px-3 text-sm"
            >
              <option value="">Choose a venue…</option>
              {(data?.places ?? []).map((place) => (
                <option key={place.id} value={place.id}>
                  {place.name}
                </option>
              ))}
            </select>

            <Input
              value={blockReason}
              onChange={(event) => setBlockReason(event.target.value)}
              placeholder="Why"
              className="min-w-[200px] flex-1"
            />

            <Button
              variant="destructive"
              disabled={busy || !blockPlace || blockReason.length < 3}
              onClick={() => {
                add({ entity: "venue", place_id: blockPlace, reason: blockReason });
                setBlockPlace("");
                setBlockReason("");
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Block
            </Button>
          </div>

          <div className="space-y-1">
            {(data?.blocked ?? []).map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 rounded-md border p-2">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{entry.places?.name ?? "Unknown"}</div>
                  <div className="text-xs text-muted-foreground">{entry.reason}</div>
                </div>
                <Button variant="ghost" size="sm" disabled={busy} onClick={() => unblock(entry.id)}>
                  Unblock
                </Button>
              </div>
            ))}

            {(data?.blocked ?? []).length === 0 && !loading && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No venues blocked.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a category</CardTitle>
        </CardHeader>
        <CardContent>
          <AddCategory onAdd={add} busy={busy} />
        </CardContent>
      </Card>
    </div>
  );
}

function AddCategory({
  onAdd,
  busy,
}: {
  onAdd: (payload: Record<string, unknown>) => void;
  busy: boolean;
}) {
  const [category, setCategory] = useState("");
  const [label, setLabel] = useState("");
  const [allowed, setAllowed] = useState(false);
  const [reason, setReason] = useState("");

  return (
    <div className="flex flex-wrap gap-2">
      <Input
        value={category}
        onChange={(event) => setCategory(event.target.value)}
        placeholder="google_place_type"
        className="w-56 font-mono text-xs"
      />
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Label"
        className="w-40"
      />
      <select
        value={allowed ? "yes" : "no"}
        onChange={(event) => setAllowed(event.target.value === "yes")}
        className="h-9 rounded-md border bg-background px-3 text-sm"
      >
        <option value="no">Blocked</option>
        <option value="yes">Allowed</option>
      </select>
      {!allowed && (
        <Input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why blocked"
          className="w-48"
        />
      )}
      <Button
        disabled={busy || !category || !label}
        onClick={() => {
          onAdd({ entity: "category", category, label, allowed, reason });
          setCategory("");
          setLabel("");
          setReason("");
        }}
      >
        <Plus className="mr-1 h-4 w-4" />
        Add
      </Button>
    </div>
  );
}
