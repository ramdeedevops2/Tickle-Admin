"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { classify, VERDICT_COPY } from "@/lib/placeTypes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/select";
import { Section } from "@/components/ui/page";
import {
  Pagination,
  paginate,
  usePagination,
} from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { PagedList } from "@/components/ui/paged-list";

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

export function VenueRulesPanel() {
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

  useLoadOnMount(load);

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

      const { error } = await adminFetch(
        `/api/venues?id=${encodeURIComponent(id)}`,
        {
          method: "DELETE",
        },
      );

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const allowed = (data?.categories ?? []).filter((entry) => entry.allowed);
  const blocked = (data?.categories ?? []).filter((entry) => !entry.allowed);

  const blockedVenues = data?.blocked ?? [];

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(blockedVenues.length);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <Button variant="outline" size="icon" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
        </Button>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-[0.92rem] text-destructive">
            {error}
          </CardContent>
        </Card>
      )}

      {(data?.unclassified.length ?? 0) > 0 && (
        <CategorySuggestions
          categories={data?.unclassified ?? []}
          onDecide={(category, allowed, reason) =>
            add({
              entity: "category",
              category,
              label: prettyLabel(category),
              allowed,
              reason: allowed ? "" : reason,
            })
          }
          busy={busy}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Capture radius</CardTitle>
          <p className="text-[0.92rem] text-muted-foreground">
            How close somebody must be, in metres. Phone GPS is off by ten to
            twenty metres indoors, so too tight a radius fails for people who
            really are there.
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
              if (next !== data?.captureRadius)
                patch({ capture_radius_m: next });
            }}
            className="h-9 w-32"
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Allowed ({allowed.length})
            </CardTitle>
            <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
              Kinds of place where a heart may be left.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <PagedList
              items={allowed}
              perPage={40}
              className="flex flex-wrap gap-2"
            >
              {(entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => patch({ id: entry.id, allowed: false })}
                  disabled={busy}
                  title="Block this category"
                  className="rounded-full border px-3 py-1.5 text-[0.92rem] hover:border-destructive hover:text-destructive"
                >
                  {entry.label}
                </button>
              )}
            </PagedList>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Blocked ({blocked.length})
            </CardTitle>
            <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
              Kinds of place where hearts are refused, and why each one is on
              the list.
            </p>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <PagedList
              items={blocked}
              perPage={40}
              className="flex flex-wrap gap-2"
            >
              {(entry) => (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => patch({ id: entry.id, allowed: true })}
                  disabled={busy}
                  title={entry.reason ?? "Allow this category"}
                  className="rounded-full border border-dashed px-3 py-1.5 text-[0.92rem] text-muted-foreground hover:border-foreground hover:text-foreground"
                >
                  {entry.label}
                  {entry.reason && (
                    <span className="ml-1.5 text-[0.86rem] opacity-60">
                      {entry.reason}
                    </span>
                  )}
                </button>
              )}
            </PagedList>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blocked venues</CardTitle>
          <p className="text-[0.92rem] text-muted-foreground">
            Blocking one removes the hearts already there.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select
              value={blockPlace}
              onChange={(next) => setBlockPlace(next as never)}
              options={[
                { value: "", label: "Choose a venue…" },
                ...(data?.places ?? []).map((place) => ({
                  value: String(place.id),
                  label: String(place.name),
                })),
              ]}
              className="w-[11rem]"
            />

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
                add({
                  entity: "venue",
                  place_id: blockPlace,
                  reason: blockReason,
                });
                setBlockPlace("");
                setBlockReason("");
              }}
            >
              <Plus className="mr-1 h-4 w-4" />
              Block
            </Button>
          </div>

          <div className="space-y-1">
            <>
              {paginate(blockedVenues, page).map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 rounded-lg border p-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.92rem] font-medium">
                      {entry.places?.name ?? "Unknown"}
                    </div>
                    <div className="text-[0.86rem] text-muted-foreground">
                      {entry.reason}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => unblock(entry.id)}
                  >
                    Unblock
                  </Button>
                </div>
              ))}
              <Pagination
                page={page}
                total={blockedVenues.length}
                onPage={setPage}
              />
            </>

            {(data?.blocked ?? []).length === 0 && !loading && (
              <p className="py-4 text-center text-[0.92rem] text-muted-foreground">
                No venues blocked.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a category</CardTitle>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            Blocking a kind of place takes down the hearts already there.
          </p>
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
        placeholder="Google's name for it, e.g. cafe"
        className="w-56 font-mono text-[0.86rem]"
      />
      <Input
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="Label"
        className="w-40"
      />
      <Select
        value={allowed ? "yes" : "no"}
        onChange={(next) => setAllowed(next === "yes")}
        options={[
          { value: "no", label: "Blocked" },
          { value: "yes", label: "Allowed" },
        ]}
        className="w-[9rem]"
      />
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

/**"coffee_shop" →"Coffee shop". Google's types are snake_case. */
function prettyLabel(category: string): string {
  const words = category.replace(/_/g, "").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Categories seen on real places that nobody has ruled on yet.
 *
 * Each one comes with a recommendation and the reason behind it, because
 * the admin is not expected to remember that `physiotherapist` is a
 * medical type or that `lodging` covers both hotels and hostels. Two
 * buttons apply the decision; the reason travels with a block so the
 * next person reading the list knows why it is there.
 *
 * Nothing is applied automatically. A wrong automatic block quietly
 * removes venues, and a wrong automatic allow points strangers at a
 * clinic — neither is a decision code should be making on its own.
 */
function CategorySuggestions({
  categories,
  onDecide,
  busy,
}: {
  categories: string[];
  onDecide: (category: string, allowed: boolean, reason: string) => void;
  busy: boolean;
}) {
  // Riskiest first: a suggested block is the one worth reading.
  const ranked = [...categories]
    .map((category) => ({ category, rule: classify(category) }))
    .sort((a, b) => {
      const order = { block: 0, review: 1, allow: 2 } as const;
      return order[a.rule.verdict] - order[b.rule.verdict];
    });

  return (
    <Section
      title="Waiting on you"
      hint="New kinds of place. Hearts are refused until you decide."
    >
      <div className="divide-y divide-foreground/[0.06]">
        {ranked.map(({ category, rule }) => {
          const copy = VERDICT_COPY[rule.verdict];

          return (
            <div
              key={category}
              className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="min-w-0 max-w-xl">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-[0.92rem] font-medium">
                    {prettyLabel(category)}
                  </span>
                  <span className="font-mono text-[0.8rem] text-muted-foreground">
                    {category}
                  </span>
                  <span
                    className={
                      copy.tone === "destructive"
                        ? "text-[0.8rem] font-medium text-destructive"
                        : copy.tone === "success"
                          ? "text-[0.8rem] font-medium text-success"
                          : "text-[0.8rem] font-medium text-warning"
                    }
                  >
                    {copy.label}
                  </span>
                  {!rule.exact && (
                    <span className="text-[0.8rem] text-muted-foreground">
                      (matched by name)
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[0.86rem] leading-relaxed text-muted-foreground">
                  {rule.reason}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  variant={rule.verdict === "allow" ? "default" : "secondary"}
                  disabled={busy}
                  onClick={() => onDecide(category, true, "")}
                >
                  Allow
                </Button>
                <Button
                  size="sm"
                  variant={rule.verdict === "block" ? "default" : "secondary"}
                  disabled={busy}
                  onClick={() => onDecide(category, false, rule.reason)}
                >
                  Block
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}
