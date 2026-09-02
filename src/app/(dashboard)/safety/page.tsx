"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Ban, CheckCircle2, LogOut, RefreshCw, ShieldCheck } from "lucide-react";

/**
 * The moderation queue.
 *
 * Reports arrive from the app write-once — someone files one and it sits
 * there. What makes this a queue rather than a log is the status column 010
 * added, and the rule that every report leaves the queue through a person:
 * resolved because something was done, or dismissed because nothing needed
 * to be.
 *
 * The count next to a name is the number that changes a decision. One report
 * is an incident; the same account reported five times by five people is a
 * pattern, and that is invisible reading the queue a row at a time.
 */

type ProfileRef = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
  suspended_at: string | null;
  suspended_reason: string | null;
};

type ReportRow = {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  match_id: string | null;
  reason: string;
  status: string;
  notes: string | null;
  reviewed_at: string | null;
  created_at: string;
  reporter: ProfileRef | null;
  reported: ProfileRef | null;
  times_reported: number;
};

const STATUS_STYLES: Record<string, string> = {
  open: "border-destructive/30 bg-destructive/10 text-destructive",
  reviewing: "border-orange-500/30 bg-orange-500/10 text-orange-600",
  resolved: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  dismissed: "border-border/50 bg-muted text-muted-foreground",
};

const TABS: { key: string; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "reviewing", label: "Reviewing" },
  { key: "resolved", label: "Resolved" },
  { key: "dismissed", label: "Dismissed" },
  { key: "all", label: "All" },
];

function formatDateTime(value: string | null) {
  if (!value) return "-";
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

function nameOf(profile: ProfileRef | null, fallback: string) {
  return profile?.name || profile?.email || fallback.slice(0, 8);
}

function initialsOf(profile: ProfileRef | null, fallback: string) {
  return nameOf(profile, fallback)
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

export default function SafetyPage() {
  // useSearchParams bails out of prerendering up to the nearest boundary, and
  // a production build fails outright without one.
  return (
    <Suspense
      fallback={<div className="py-16 text-center text-muted-foreground">Loading reports...</div>}
    >
      <SafetyView />
    </Suspense>
  );
}

function SafetyView() {
  const searchParams = useSearchParams();

  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<string>(() => {
    // The palette links here as /safety?filter=open.
    const requested = searchParams.get("filter");
    return requested && TABS.some((entry) => entry.key === requested) ? requested : "open";
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<{ reports: ReportRow[] }>("/api/reports");

    if (error) setError(error);
    else setReports(data?.reports ?? []);

    setLoading(false);
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const setStatus = useCallback(
    async (report: ReportRow, status: string) => {
      setBusy(true);
      const { error } = await adminFetch("/api/reports", {
        method: "PATCH",
        body: JSON.stringify({ id: report.id, status, notes: report.notes ?? "" }),
      });
      if (error) setError(error);
      await load();
      setBusy(false);
    },
    [load],
  );

  const toggleSuspend = useCallback(
    async (profile: ProfileRef) => {
      const suspended = Boolean(profile.suspended_at);

      const reason = suspended
        ? null
        : window.prompt(`Suspend ${nameOf(profile, profile.user_id)}. Reason?`, "");

      // A null reason means the prompt was cancelled, not that the reason was
      // left blank — an empty string is a deliberate "no reason given".
      if (!suspended && reason === null) return;

      setBusy(true);
      const { error } = await adminFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          action: suspended ? "unsuspend" : "suspend",
          user_id: profile.user_id,
          reason,
        }),
      });
      if (error) setError(error);
      await load();
      setBusy(false);
    },
    [load],
  );

  const forceLogout = useCallback(
    async (profile: ProfileRef) => {
      if (
        !window.confirm(
          `Sign ${nameOf(profile, profile.user_id)} out of every device? Use this when an account is compromised rather than at fault.`,
        )
      ) {
        return;
      }

      setBusy(true);
      const { error } = await adminFetch("/api/reports", {
        method: "POST",
        body: JSON.stringify({ action: "force_logout", user_id: profile.user_id }),
      });
      if (error) setError(error);
      setBusy(false);
    },
    [],
  );

  const stats = useMemo(() => {
    const open = reports.filter((row) => row.status === "open").length;
    const reviewing = reports.filter((row) => row.status === "reviewing").length;
    const suspended = new Set(
      reports.filter((row) => row.reported?.suspended_at).map((row) => row.reported_user_id),
    ).size;
    const repeat = new Set(
      reports.filter((row) => row.times_reported >= 3).map((row) => row.reported_user_id),
    ).size;

    return { open, reviewing, suspended, repeat };
  }, [reports]);

  const visible = useMemo(
    () => (tab === "all" ? reports : reports.filter((row) => row.status === tab)),
    [reports, tab],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Trust &amp; Safety</h2>
          <p className="text-muted-foreground">
            Reports filed from the app, and what was done about them.
          </p>
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

      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-destructive/20 bg-destructive/10">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Waiting</CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight text-destructive">
            {stats.open}
          </CardContent>
        </Card>
        <Stat label="Being Reviewed" value={stats.reviewing} />
        <Stat label="Reported 3+ Times" value={stats.repeat} />
        <Stat label="Suspended" value={stats.suspended} />
      </div>

      {error && (
        <div className="border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex w-fit flex-wrap border border-border/50">
        {TABS.map((entry) => {
          const count =
            entry.key === "all"
              ? reports.length
              : reports.filter((row) => row.status === entry.key).length;

          return (
            <button
              key={entry.key}
              onClick={() => setTab(entry.key)}
              className={`px-4 py-2 text-xs uppercase tracking-[0.2em] transition-colors ${
                tab === entry.key
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {entry.label}
              {count > 0 && ` (${count})`}
            </button>
          );
        })}
      </div>

      <Card className="border-border/50 bg-card">
        <CardHeader>
          <CardTitle>Reports</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-16 text-center text-muted-foreground">Loading reports...</div>
          ) : visible.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              {tab === "open" ? "Nothing waiting. Queue is clear." : "No reports here."}
            </div>
          ) : (
            <div className="space-y-6">
              {visible.map((report) => (
                <ReportCard
                  key={report.id}
                  report={report}
                  busy={busy}
                  onStatus={setStatus}
                  onToggleSuspend={toggleSuspend}
                  onForceLogout={forceLogout}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
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

function ReportCard({
  report,
  busy,
  onStatus,
  onToggleSuspend,
  onForceLogout,
}: {
  report: ReportRow;
  busy: boolean;
  onStatus: (report: ReportRow, status: string) => void;
  onToggleSuspend: (profile: ProfileRef) => void;
  onForceLogout: (profile: ProfileRef) => void;
}) {
  const suspended = Boolean(report.reported?.suspended_at);
  const open = report.status === "open" || report.status === "reviewing";

  return (
    <div className="space-y-3 border-b border-border/50 pb-6 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/members/${report.reported_user_id}`}>
          <Avatar className="h-11 w-11 border border-border bg-transparent">
            <AvatarImage src={report.reported?.photos?.[0] ?? undefined} />
            <AvatarFallback className="bg-transparent text-xs">
              {initialsOf(report.reported, report.reported_user_id)}
            </AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {nameOf(report.reported, report.reported_user_id)}
            {report.times_reported >= 3 && (
              <Badge
                variant="outline"
                className="rounded-none border-destructive/30 bg-destructive/10 text-[10px] uppercase tracking-[0.2em] text-destructive"
              >
                <AlertTriangle className="mr-1 size-3" />
                {report.times_reported} reports
              </Badge>
            )}
            {suspended && (
              <Badge
                variant="outline"
                className="rounded-none border-border/50 bg-muted text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
              >
                Suspended
              </Badge>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            Reported by {nameOf(report.reporter, report.reporter_id)} ·{" "}
            {formatDateTime(report.created_at)}
          </p>
        </div>

        <Badge
          variant="outline"
          className={`rounded-none text-[10px] uppercase tracking-[0.2em] ${
            STATUS_STYLES[report.status] ?? ""
          }`}
        >
          {report.status}
        </Badge>
      </div>

      <p className="border-l-2 border-border/50 pl-3 text-sm">{report.reason}</p>

      {report.reviewed_at && (
        <p className="text-xs text-muted-foreground">
          Reviewed {formatDateTime(report.reviewed_at)}
          {report.notes ? ` — ${report.notes}` : ""}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {open && (
          <>
            {report.status === "open" && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => onStatus(report, "reviewing")}
                className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
              >
                Pick up
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onStatus(report, "resolved")}
              className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
            >
              <CheckCircle2 className="mr-2 size-4" />
              Resolve
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onStatus(report, "dismissed")}
              className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
            >
              Dismiss
            </Button>
          </>
        )}

        {report.reported && !suspended && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onForceLogout(report.reported!)}
            title="Sign every device out without suspending"
            className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
          >
            <LogOut className="mr-2 size-4" />
            Force logout
          </Button>
        )}

        {report.reported && (
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => onToggleSuspend(report.reported!)}
            className={`rounded-none text-xs uppercase tracking-[0.2em] ${
              suspended
                ? "border-border/50"
                : "border-destructive/40 text-destructive hover:bg-destructive hover:text-destructive-foreground"
            }`}
          >
            {suspended ? (
              <>
                <ShieldCheck className="mr-2 size-4" />
                Restore
              </>
            ) : (
              <>
                <Ban className="mr-2 size-4" />
                Suspend
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
