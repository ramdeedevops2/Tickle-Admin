"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Check, RefreshCw, ScanFace } from "lucide-react";

/**
 * Face verification, monitored rather than moderated.
 *
 * Every check is decided by Rekognition in a couple of seconds, and the
 * selfie is never stored — it exists in one request body and is gone. There
 * is nothing here to approve.
 *
 * What is here is the shape of the decisions. Two numbers matter: the
 * approval rate, which says whether the thresholds are set sensibly, and
 * the people stuck retrying, who are the only ones a human can still help.
 */

type Profile = {
  user_id: string;
  name: string | null;
  photos: string[] | null;
  face_verified_at: string | null;
} | null;

type LogRow = {
  id: string;
  user_id: string;
  similarity: number | null;
  approved: boolean;
  reason: string;
  compared: number;
  attempt: number;
  duration_ms: number | null;
  created_at: string;
  profile: Profile;
};

type Stuck = { user_id: string; attempts: number; profile: Profile };

type Payload = {
  settings: {
    face_approve_at: number;
    face_reject_at: number;
    face_checks_per_hour: number;
  } | null;
  stats: {
    checks: number;
    approved: number;
    approvalRate: number;
    medianMs: number | null;
    medianSimilarity: number | null;
    providerErrors: number;
    stuck: number;
  };
  byReason: Record<string, number>;
  stuck: Stuck[];
  log: LogRow[];
};

/** Plain English, and what it means for the person it happened to. */
const REASON: Record<string, { label: string; tone: "good" | "bad" | "warn" }> = {
  match: { label: "Verified", tone: "good" },
  low_confidence: { label: "Close, not certain", tone: "warn" },
  no_match: { label: "Different person", tone: "bad" },
  no_face_in_selfie: { label: "No face in selfie", tone: "warn" },
  no_face_in_photos: { label: "No face in profile photos", tone: "warn" },
  no_photos: { label: "No profile photos", tone: "warn" },
  provider_error: { label: "AWS error", tone: "bad" },
  rate_limited: { label: "Rate limited", tone: "warn" },
};

const TONE: Record<string, string> = {
  good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  warn: "border-orange-500/30 bg-orange-500/10 text-orange-600",
  bad: "border-destructive/30 bg-destructive/10 text-destructive",
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

export default function VerificationPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/verification");

    if (error) setError(error);
    else setData(data);

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const override = useCallback(
    async (userId: string, approved: boolean) => {
      if (
        !window.confirm(
          approved
            ? "Verify this person manually? Only do this when their photos genuinely cannot be matched and you have another reason to trust them. It is logged against your account."
            : "Remove their verification?",
        )
      ) {
        return;
      }

      setBusy(userId);

      const { error } = await adminFetch("/api/verification", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, approved }),
      });

      if (error) setError(error);
      else await load();

      setBusy(null);
    },
    [load],
  );

  const visible = useMemo(
    () => (data?.log ?? []).filter((row) => filter === "all" || row.reason === filter),
    [data, filter],
  );

  const reasons = useMemo(
    () => Object.entries(data?.byReason ?? {}).sort((a, b) => b[1] - a[1]),
    [data],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Verification</h2>
          <p className="text-muted-foreground">
            Decided automatically. Selfies are never stored.
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
      ) : data.stats.checks === 0 ? (
        <Card className="border-border/50 bg-card">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <ScanFace className="size-8 text-muted-foreground" />
            <p className="text-muted-foreground">No checks yet.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat
              label="Approval Rate"
              value={`${data.stats.approvalRate}%`}
              note={`${data.stats.approved} of ${data.stats.checks}`}
              /* Below 50% usually means the threshold is too strict rather
                 than that half the members are impostors. */
              warn={data.stats.approvalRate < 50}
            />
            <Stat
              label="Median Similarity"
              value={data.stats.medianSimilarity != null ? `${data.stats.medianSimilarity}%` : "-"}
              note={
                data.settings
                  ? `approve at ${data.settings.face_approve_at}%`
                  : undefined
              }
            />
            <Stat
              label="Median Response"
              value={data.stats.medianMs != null ? `${data.stats.medianMs}ms` : "-"}
              warn={(data.stats.medianMs ?? 0) > 5000}
            />
            <Stat
              label="Stuck Retrying"
              value={data.stats.stuck}
              note="3+ attempts, still unverified"
              warn={data.stats.stuck > 0}
            />
          </div>

          {data.stats.providerErrors > 0 && (
            <div className="flex items-center gap-3 border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertTriangle className="size-4 shrink-0" />
              {data.stats.providerErrors} AWS errors in the last 500 checks. Those attempts did
              not count against anyone.
            </div>
          )}

          {data.stuck.length > 0 && (
            <Card className="border-border/50 bg-card">
              <CardHeader>
                <CardTitle className="text-base">Stuck retrying</CardTitle>
              </CardHeader>
              <CardContent>
                {/* The only place a human still adds anything. Three failures
                    usually means their profile photos are the problem — a
                    group shot, or one taken years ago. */}
                <div className="space-y-3">
                  {data.stuck.map((entry) => (
                    <div
                      key={entry.user_id}
                      className="flex items-center gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0"
                    >
                      <Link href={`/members/${entry.user_id}`}>
                        <Avatar className="size-9 border border-border bg-transparent">
                          <AvatarImage src={entry.profile?.photos?.[0] ?? undefined} />
                          <AvatarFallback className="bg-transparent text-xs">
                            {(entry.profile?.name ?? "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </Link>

                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/members/${entry.user_id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {entry.profile?.name ?? entry.user_id.slice(0, 8)}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {entry.attempts} attempts, no badge
                        </p>
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === entry.user_id}
                        onClick={() => override(entry.user_id, true)}
                        className="rounded-none border-emerald-500/40 text-xs uppercase tracking-[0.2em] text-emerald-600"
                      >
                        <Check className="mr-2 size-4" />
                        Verify anyway
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex w-fit flex-wrap border border-border/50">
            <TabButton active={filter === "all"} onClick={() => setFilter("all")}>
              All ({data.stats.checks})
            </TabButton>
            {reasons.map(([reason, count]) => (
              <TabButton
                key={reason}
                active={filter === reason}
                onClick={() => setFilter(reason)}
              >
                {REASON[reason]?.label ?? reason} ({count})
              </TabButton>
            ))}
          </div>

          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle>Recent checks</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {visible.map((row) => {
                  const meta = REASON[row.reason] ?? { label: row.reason, tone: "warn" as const };

                  return (
                    <div
                      key={row.id}
                      className="flex items-center gap-3 border-b border-border/50 pb-3 last:border-0 last:pb-0"
                    >
                      <Link href={`/members/${row.user_id}`}>
                        <Avatar className="size-9 border border-border bg-transparent">
                          <AvatarImage src={row.profile?.photos?.[0] ?? undefined} />
                          <AvatarFallback className="bg-transparent text-xs">
                            {(row.profile?.name ?? "?").slice(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                      </Link>

                      <div className="min-w-0 flex-1">
                        <Link
                          href={`/members/${row.user_id}`}
                          className="text-sm font-medium hover:underline"
                        >
                          {row.profile?.name ?? row.user_id.slice(0, 8)}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          Attempt {row.attempt}
                          {row.compared > 0 && ` · ${row.compared} photos`}
                          {row.duration_ms != null && ` · ${row.duration_ms}ms`}
                          {" · "}
                          {formatDateTime(row.created_at)}
                        </p>
                      </div>

                      {/* The score is shown here and nowhere the member can
                          see it — knowing you scored 74% is knowing how much
                          closer you need to get. */}
                      {row.similarity != null && (
                        <span className="w-14 text-right text-sm tabular-nums text-muted-foreground">
                          {Math.round(row.similarity)}%
                        </span>
                      )}

                      <Badge
                        variant="outline"
                        className={`rounded-none text-[10px] uppercase tracking-[0.2em] ${TONE[meta.tone]}`}
                      >
                        {meta.label}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
        active ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({
  label,
  value,
  note,
  warn,
}: {
  label: string;
  value: number | string;
  note?: string;
  warn?: boolean;
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-black tracking-tight ${warn ? "text-destructive" : ""}`}>
          {value}
        </div>
        {note && <div className="text-xs text-muted-foreground">{note}</div>}
      </CardContent>
    </Card>
  );
}
