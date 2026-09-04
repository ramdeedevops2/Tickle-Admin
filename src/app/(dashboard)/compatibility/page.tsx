"use client";
import { useCallback, useMemo, useState } from "react";
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
import { FairnessEditor } from "@/components/FairnessEditor";
import { FreshStartPanel } from "@/components/discovery/FreshStartPanel";
import { Divider, PageSkeleton } from "@/components/ui/page";
import { Pagination, paginate, usePagination } from "@/components/ui/pagination";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";

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
  const confirm = useConfirm();
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

  useLoadOnMount(load);

  const toggle = useCallback(
    async (dimension: Dimension, field: "active" | "quick_start") => {
      if (
        field === "active" &&
        dimension.active &&
        !(await confirm({
          title: `Turn off "${dimension.label}"?`,
          body: "Every match score in the app is worked out again. People keep the answers they already gave, but those answers stop counting towards who they are matched with.",
          confirmLabel: "Turn it off",
        }))
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
    [load, confirm],
  );

  const peak = useMemo(
    () => Math.max(1, ...(data?.buckets ?? []).map((bucket) => bucket.count)),
    [data],
  );

  // Resets when a filter shortens the list, so filtering while on a
  // later page cannot leave you looking at an empty one.
  const { page, setPage } = usePagination(data?.dimensions.length ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[1.6rem] font-medium tracking-tight">Compatibility</h1>
          <p className="mt-1 max-w-2xl text-[0.92rem] leading-relaxed text-muted-foreground">
            Sign-up questions, and how well they tell people apart.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={load}
          disabled={loading}
          className="border-foreground/[0.06] text-[0.86rem]"
        >
          <RefreshCw className={`mr-2 size-4 ${loading ? "animate-spin" :""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3.5 py-2.5 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {loading || !data ? (
        <PageSkeleton sections={2} />
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="People who answered" value={data.people} />
            <Stat label="Pairs with a score" value={data.pairs} />
            <Stat label="Typical score" value={data.median != null ? `${data.median}%` :"-"} />
            <Stat label="Blocked by a dealbreaker" value={data.blocked} />
          </div>

          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              <CardTitle>Filling decks</CardTitle>
              <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                How many people the app had to look through to fill somebody&apos;s
                stack of profiles. If this keeps climbing, members are running out
                of new people to see.
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                <PoolStat label="People lined up to be shown" value={data.pool.rows} />
                <PoolStat
                  label="Not put in order yet"
                  value={data.pool.unranked}
                  warn={data.pool.rows > 0 && data.pool.unranked / data.pool.rows > 0.4}
                  note={
                    data.pool.rows > 0
                      ? `${Math.round((data.pool.unranked / data.pool.rows) * 100)}% of everyone lined up`
                      : undefined
                  }
                />
                <PoolStat label="Members with a deck ready" value={data.pool.withPools} />
                <PoolStat label="Decks rebuilt today" value={data.pool.refreshedToday} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              <CardTitle>Match scores</CardTitle>
              <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                If most pairs land in the middle, the questions are not telling
                people apart and almost everyone looks like an equal match.
              </p>
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
                    <span className="text-[0.8rem] text-muted-foreground">{bucket.from}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="border-foreground/[0.06] bg-card">
            <CardHeader>
              <CardTitle>Dimensions</CardTitle>
              <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
                The traits the score is built from, and how much each one counts.
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="border-foreground/[0.06] hover:bg-transparent">
                    <TableHead>Question</TableHead>
                    <TableHead>Section</TableHead>
                    <TableHead className="text-right">Answered</TableHead>
                    <TableHead className="text-right">Must-match</TableHead>
                    <TableHead className="w-28">Quick start</TableHead>
                    <TableHead className="w-24">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <>
                    {paginate(data.dimensions, page).map((dimension) => (
                    <TableRow key={dimension.key} className="border-foreground/[0.06]">
                      <TableCell>
                        <div className="font-medium">{dimension.label}</div>
                        <div className="max-w-md truncate text-[0.86rem] text-muted-foreground">
                          {dimension.question}
                        </div>
                      </TableCell>
                      <TableCell className="text-[0.92rem] text-muted-foreground">
                        {dimension.section}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className="tabular-nums">{dimension.answered}</span>
                        <span
                          className={`ml-2 text-[0.86rem] ${
                            dimension.rate < 40 ? "text-destructive" :"text-muted-foreground"
                          }`}
                        >
                          {dimension.rate}%
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {dimension.must ||"-"}
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => toggle(dimension, "quick_start")}
                          disabled={busy === dimension.key}
                          className="text-[0.86rem] text-muted-foreground transition-colors hover:text-foreground"
                        >
                          {dimension.quick_start ? "In" :"Out"}
                        </button>
                      </TableCell>
                      <TableCell>
                        <button
                          onClick={() => toggle(dimension, "active")}
                          disabled={busy === dimension.key}
                        >
                          <Badge
                            variant="outline"
                            className={`text-[0.86rem] ${
                              dimension.active
                                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600"
                                :"border-foreground/[0.06] bg-muted text-muted-foreground"
                            }`}
                          >
                            {dimension.active ? "On" :"Off"}
                          </Badge>
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                    <Pagination page={page} total={data.dimensions.length} onPage={setPage} />
                  </>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
      {/* Three subjects on one screen, so each states where it begins.
          The fairness editor in particular is a bare grid of fields — with
          nothing above it, it reads as a continuation of the table before
          it rather than a different decision. */}
      <Divider
        title="Being fair about who gets seen"
        hint="How long somebody waits after a pass, and how widely one profile may be shown."
        className="mt-8"
      />
      <FairnessEditor />

      <div id="fresh-start" className="scroll-mt-24 space-y-5">
        <Divider
          title="Fresh Start Boost"
          hint="Extra visibility for a member's first days, so a new profile is not the least seen one."
          className="mt-8"
        />
        <FreshStartPanel />
      </div>
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
      <div className={`tnum text-[1.6rem] font-light tracking-tight ${warn ? "text-destructive" :""}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-[1rem] leading-relaxed text-muted-foreground">{label}</div>
      {note && <div className="text-[0.8rem] text-muted-foreground">{note}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <Card className="border-foreground/[0.06] bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-[0.92rem] font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="tnum text-[1.9rem] font-light tracking-tight">{value}</CardContent>
    </Card>
  );
}
