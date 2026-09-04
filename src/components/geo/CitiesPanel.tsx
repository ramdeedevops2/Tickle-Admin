"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";

/**
 * Cities, waitlists and launch.
 *
 * The people count is the number that matters and it is a real count of
 * published profiles. A city below its threshold is not a smaller
 * version of the app — it is a different, worse product, which is why
 * Founding Mode exists rather than pretending otherwise.
 *
 * Launching notifies everybody on the waitlist, so it is one button and
 * not a status dropdown. Doing it by accident should be hard.
 */

type City = {
  slug: string;
  name: string;
  status: "waitlist" | "founding" | "live" | "paused";
  threshold: number;
  founding_roses: number;
  founding_premium_days: number;
  people: number;
  joined_this_week: number;
  active_today: number;
  waitlist: number;
  launched_at: string | null;
};

type Payload = {
  cities: City[];
  unlisted: { slug: string; people: number }[];
};

export function CitiesPanel() {
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [newCity, setNewCity] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/cities");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const patch = useCallback(
    async (update: Record<string, unknown>) => {
      setBusy(true);

      const { data, error } = await adminFetch<{ notified?: number }>("/api/cities", {
        method: "PATCH",
        body: JSON.stringify(update),
      });

      if (error) {
        setError(error);
      } else {
        if (typeof data?.notified === "number" && data.notified > 0) {
          setError(null);
        }
        await load();
      }

      setBusy(false);
    },
    [load],
  );

  const add = useCallback(async () => {
    setBusy(true);

    const { error } = await adminFetch("/api/cities", {
      method: "POST",
      body: JSON.stringify({ name: newCity }),
    });

    if (error) setError(error);
    else {
      setNewCity("");
      await load();
    }

    setBusy(false);
  }, [newCity, load]);

  const cityRows = data?.cities ?? [];

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(cityRows.length);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2">
          <Input
            value={newCity}
            onChange={(event) => setNewCity(event.target.value)}
            placeholder="Add a city"
            className="w-48"
          />
          <Button disabled={busy || newCity.trim().length < 2} onClick={add}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" :"h-4 w-4"} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-[0.92rem] text-destructive">{error}</CardContent>
        </Card>
      )}

      {(data?.unlisted.length ?? 0) > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 pt-6 text-[0.92rem]">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">People are in cities that have no row</p>
              <p className="text-muted-foreground">
                City Pulse shows nothing at all for these, so anyone there sees an empty
                screen with no context. Add the ones worth having:{""}
                {data?.unlisted.map((c) => `${c.slug} (${c.people})`).join(", ")}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <>
        {paginate(cityRows, page).map((city) => {
        const progress = Math.min(
          100,
          Math.round((city.people / Math.max(city.threshold, 1)) * 100),
        );

        return (
          <Card key={city.slug}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">{city.name}</CardTitle>
                <Badge
                  variant={
                    city.status === "live"
                      ? "default"
                      : city.status === "founding"
                        ? "secondary"
                        :"outline"
                  }
                >
                  {city.status}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                {city.status === "waitlist" && (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirm({
                        title: `Launch ${city.name}?`,
                        body: `Everyone waiting there — ${city.waitlist} ${
                          city.waitlist === 1 ? "person" : "people"
                        } — gets a notification straight away.`,
                        confirmLabel: "Launch it",
                      });
                      if (ok) patch({ slug: city.slug, status: "founding" });
                    }}
                  >
                    Launch
                  </Button>
                )}

                {city.status === "founding" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => patch({ slug: city.slug, status: "live" })}
                  >
                    Mark live
                  </Button>
                )}

                {city.status !== "paused" && city.status !== "waitlist" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => patch({ slug: city.slug, status: "paused" })}
                  >
                    Pause
                  </Button>
                )}
              </div>
            </CardHeader>

            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <Metric label="People" value={city.people} />
                <Metric label="This week" value={city.joined_this_week} />
                <Metric label="Active today" value={city.active_today} />
                <Metric label="On the waiting list" value={city.waitlist} />
              </div>

              <div className="space-y-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-[1rem] leading-relaxed text-muted-foreground">
                  {city.people} of {city.threshold} — {progress}% to a working city
                </p>
              </div>

              <div className="flex flex-wrap gap-4">
                <NumField
                  label="People needed to launch"
                  value={city.threshold}
                  onCommit={(v) => patch({ slug: city.slug, threshold: v })}
                  disabled={busy}
                />
                <NumField
                  label="Free Premium days for early members"
                  value={city.founding_premium_days}
                  onCommit={(v) => patch({ slug: city.slug, founding_premium_days: v })}
                  disabled={busy}
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
        <Pagination page={page} total={cityRows.length} onPage={setPage} />
      </>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[1.6rem] font-medium tracking-tight">{value.toLocaleString()}</div>
      <div className="text-[1rem] leading-relaxed text-muted-foreground">{label}</div>
    </div>
  );
}

function NumField({
  label,
  value,
  onCommit,
  disabled,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[1rem] leading-relaxed text-muted-foreground">{label}</label>
      <Input
        type="number"
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
        className="h-8 w-32"
      />
    </div>
  );
}
