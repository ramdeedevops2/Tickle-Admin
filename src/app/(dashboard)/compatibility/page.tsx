"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { RefreshCw } from "lucide-react";

/**
 * The compatibility engine, from the outside.
 *
 * Two questions this page answers and nothing else can: is any given
 * question worth asking, and does the score actually separate people.
 *
 * A dimension answered by 8% of members is phrased badly or asked too late.
 * A distribution bunched above 80% means the weights are too generous to
 * distinguish anyone, and every match looks equally good — which is the same
 * as no matching at all.
 *
 * Individual answers are deliberately not here. Reading what one named
 * person said about jealousy or money is not moderation.
 */

type Dimension = {
  key: string;
  label: string;
  question: string;
  kind: string;
  section: string;
  quick_start: boolean;
  active: boolean;
  answered: number;
  must: number;
  rate: number;
};

type Bucket = { from: number; to: number; count: number };

type Pool = {
  rows: number;
  unranked: number;
  blocked: number;
  withPools: number;
  refreshedToday: number;
};

type Payload = {
  people: number;
  pairs: number;
  blocked: number;
  pool: Pool;
  median: number | null;
  buckets: Bucket[];
  dimensions: Dimension[];
};

export default function CompatibilityPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/compatibility");

    if (error) setError(error);
    else setData(data);

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const toggle = useCallback(
    async (dimension: Dimension, field: "active" | "quick_start") => {
      if (
        field === "active" &&
        dimension.active &&
        !window.confirm(
          `Turn off "${dimension.label}"? Every cached score is recomputed, and answers already given are kept but stop counting.`,
        )
      ) {
        return;
      }

      setBusy(dimension.key);

      const { error } = await adminFetch("/api/compatibility", {
        method: "PATCH",
        body: JSON.stringify({ key: dimension.key, [field]: !dimension[field] }),
      });

      if (error) setError(error);
      else await load();

      setBusy(null);
    },
    [load],
  );

  const peak = useMemo(
    () => Math.max(1, ...(data?.buckets ?? []).map((bucket) => bucket.count)),
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Compatibility</h2>
          <p className="text-muted-foreground">
            Which questions people answer, and whether the score separates anyone.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={load}
          disabled={loading}
          className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
        >
          <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading || !data ? (
        <div className="py-16 text-center text-muted-foreground">Loading...</div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="People Answering" value={data.people} />
            <Stat label="Scored Pairs" value={data.pairs} />
            <Stat label="Median Score" value={data.median != null ? `${data.median}%` : "-"} />
            <Stat label="Dealbreaker Capped" value={data.blocked} />
          </div>

          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle>Discovery Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <PoolStat label="Pooled candidates" value={data.pool.rows} />
                <PoolStat
                  label="Waiting to be ranked"
                  value={data.pool.unranked}
                  warn={data.pool.rows > 0 && data.pool.unranked / data.pool.rows > 0.4}
                  note={
                    data.pool.rows > 0
                      ? `${Math.round((data.pool.unranked / data.pool.rows) * 100)}% of the pool`
                      : undefined
                  }
                />
                <PoolStat label="Active pools" value={data.pool.withPools} />
                <PoolStat label="Refreshed today" value={data.pool.refreshedToday} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle>Score Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {/* A healthy spread has a hump in the middle. Everything piled
                  into 80-100 means the weights cannot tell anyone apart. */}
              <div className="flex h-40 items-end gap-2">
                {data.buckets.map((bucket) => (
                  <div key={bucket.from} className="flex flex-1 flex-col items-center gap-2">
                    <div className="flex w-full flex-1 items-end">
                      <div
                        className="w-full bg-foreground/80"
                        style={{ height: `${(bucket.count / peak) * 100}%` }}
                        title={`${bucket.count} pairs`}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">{bucket.from}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle>Dimensions</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-border/50 hover:bg-transparent">
                    <TableHead>Question</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead className="text-right">Answered</TableHead>
                    <TableHead className="text-right">Must-match</TableHead>
                    <TableHead className="w-28">Quick start</TableHead>
                    <TableHead className="w-24">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.dimensions.map((dimension) => (
                    <TableRow key={dimension.key} className="border-border/50">
                      <TableCell>
                        <div className="font-medium">{dimension.label}</div>
                        <div className="max-w-md truncate text-xs text-muted-foreground">
                          {dimension.question}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {dimension.section}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="tabular-nums">{dimension.answered}</span>
                        <span
                          className={`ml-2 text-xs ${
                            dimension.rate < 40 ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {dimension.rate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {dimension.must || "-"}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => toggle(dimension, "quick_start")}
                          disabled={busy === dimension.key}
                          className="text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {dimension.quick_start ? "In" : "Out"}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => toggle(dimension, "active")}
                          disabled={busy === dimension.key}
                        >
                          <Badge
                            variant="outline"
                            className={`rounded-none text-[10px] uppercase tracking-[0.2em] ${
                              dimension.active
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                : "border-border/50 bg-muted text-muted-foreground"
                            }`}
                          >
                            {dimension.active ? "On" : "Off"}
                          </Badge>
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function PoolStat({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: number;
  note?: string;
  warn?: boolean;
}) {
  return (
    <div>
      <div className={`text-2xl font-black tracking-tight ${warn ? "text-destructive" : ""}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-muted-foreground">{label}</div>
      {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
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
