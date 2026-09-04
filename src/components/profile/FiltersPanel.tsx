"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, RefreshCw } from "lucide-react";
import { Select } from "@/components/ui/select";
import { FilterPreview, KIND_COPY } from "@/components/filters/FilterPreview";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { PagedList } from "@/components/ui/paged-list";

/**
 * Which filters are free and which need Premium.
 *
 * The spec deferred this decision, so it lives here as a switch per
 * filter rather than a constant in the app. That means it can be revised
 * from what people actually use instead of argued about in advance.
 *
 * The usage column is the argument. A filter almost nobody sets is not
 * worth putting behind a paywall — it will sell nothing and will make
 * the paid tier look thin. A filter most people set is either the right
 * thing to charge for or the wrong thing to withhold, and which of those
 * it is depends on whether a deck is usable without it.
 */

type Definition = {
  id: string;
  key: string;
  group_key: string;
  label: string;
  hint: string | null;
  column_name: string;
  kind: string;
  free: boolean;
  active: boolean;
};

type Group = { key: string; label: string };

type Payload = {
  groups: Group[];
  definitions: Definition[];
  usage: Record<string, number>;
  options?: Record<string, number>;
  /** The real option labels per field, in the order members see them. */
  optionValues?: Record<string, string[]>;
  kinds: string[];
};

export function FiltersPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [column, setColumn] = useState("");
  const [kind, setKind] = useState("choice");
  const [group, setGroup] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/filters");

    if (error) {
      setError(error);
    } else {
      setData(data ?? null);
      if (!group && data?.groups[0]) setGroup(data.groups[0].key);
    }

    setLoading(false);
  }, [group]);

  useLoadOnMount(load);

  const patch = useCallback(
    async (update: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/filters", {
        method: "PATCH",
        body: JSON.stringify(update),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const add = useCallback(async () => {
    setBusy(true);

    const { error } = await adminFetch("/api/filters", {
      method: "POST",
      body: JSON.stringify({
        key,
        label,
        column_name: column,
        kind,
        group_key: group,
        free: false,
      }),
    });

    if (error) {
      setError(error);
    } else {
      setKey("");
      setLabel("");
      setColumn("");
      await load();
    }

    setBusy(false);
  }, [key, label, column, kind, group, load]);

  const freeCount = (data?.definitions ?? []).filter(
    (d) => d.free && d.active,
  ).length;
  const paidCount = (data?.definitions ?? []).filter(
    (d) => !d.free && d.active,
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <p className="text-[0.86rem] text-muted-foreground">
          {freeCount} free · {paidCount} need Premium
        </p>
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

      {(data?.groups ?? []).map((grp) => {
        const filters = (data?.definitions ?? []).filter(
          (d) => d.group_key === grp.key,
        );
        if (filters.length === 0) return null;

        return (
          <Card key={grp.key}>
            <CardHeader>
              <CardTitle className="text-base">{grp.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <PagedList items={filters} perPage={15} className="space-y-1">
                {(filter) => {
                  const used = data?.usage[filter.key] ?? 0;

                  return (
                    <div
                      key={filter.id}
                      className="space-y-2 rounded-xl border border-foreground/[0.06] p-3"
                    >
                      <div className="flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <div
                            className={
                              filter.active
                                ? "text-[0.92rem] font-medium"
                                : "text-[0.92rem] font-medium line-through opacity-50"
                            }
                          >
                            {filter.label}
                          </div>
                          <code className="text-[0.86rem] text-muted-foreground">
                            {filter.column_name} · {filter.kind}
                          </code>
                        </div>

                        {/* The number that should drive the decision beside it. */}
                        <span className="text-[0.86rem] text-muted-foreground">
                          {used === 0 ? "unused" : `${used} using`}
                        </span>

                        <Button
                          variant={filter.free ? "default" : "outline"}
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            patch({ id: filter.id, free: !filter.free })
                          }
                        >
                          {filter.free ? "Free" : "Premium"}
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            patch({ id: filter.id, active: !filter.active })
                          }
                        >
                          {filter.active ? "Retire" : "Restore"}
                        </Button>
                      </div>

                      {/* What a member actually sees for this filter. */}
                      <FilterPreview
                        kind={filter.kind}
                        label={filter.label}
                        options={data?.optionValues?.[filter.key] ?? []}
                      />
                    </div>
                  );
                }}
              </PagedList>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add a filter</CardTitle>
          <p className="text-[0.92rem] text-muted-foreground">
            Must match a detail the app already stores, or it quietly matches
            nobody while still looking like it works.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="key"
            className="w-32 font-mono text-[0.86rem]"
          />
          <Input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Label"
            className="w-40"
          />
          <Input
            value={column}
            onChange={(event) => setColumn(event.target.value)}
            placeholder="Which profile detail, e.g. height_cm"
            className="w-44 font-mono text-[0.86rem]"
          />
          <Select
            value={kind}
            onChange={(next) => setKind(next as never)}
            options={(data?.kinds ?? []).map((entry) => ({
              value: String(entry),
              label:
                KIND_COPY[entry as keyof typeof KIND_COPY]?.label ??
                String(entry),
            }))}
            placeholder="How it works"
            className="w-[11rem]"
          />
          <Select
            value={group}
            onChange={(next) => setGroup(next as never)}
            options={(data?.groups ?? []).map((entry) => ({
              value: String(entry.key),
              label: String(entry.label),
            }))}
            className="w-[11rem]"
          />
          <Button disabled={busy || !key || !label || !column} onClick={add}>
            <Plus className="mr-1 h-4 w-4" />
            Add
          </Button>

          {/* Updates as the kind changes, so the choice between "choice"
              and "multi" is made by looking rather than by guessing. */}
          <div className="w-full max-w-sm pt-1">
            <p className="mb-1.5 text-[0.8rem] text-muted-foreground">
              Members will see:
            </p>
            <FilterPreview kind={kind} label={label} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
