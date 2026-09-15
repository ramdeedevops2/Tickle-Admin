"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useLiveTable } from "@/lib/useLiveTable";

/**
 * The rest of the panel, on the dashboard.
 *
 * ── Why these sections ────────────────────────────────────────
 *
 * The sidebar manages eleven screens; Pulse spoke for three of them.
 * Hearts could be dead in every seeded city, the Rose economy could be
 * leaking, the report queue could be growing — and none of it showed
 * here. Each block below stands for a sidebar entry and links to it, so
 * the dashboard says how the whole product is doing rather than how
 * signups are doing.
 *
 * ── Why the headings are links ────────────────────────────────
 *
 * A number that raises a question should be one click from the screen
 * that answers it. The heading is the link rather than each tile: the
 * tiles are facts, and every fact in a block belongs to the same
 * screen.
 */

type Sections = {
  range: string;
  roses: {
    in: number;
    out: number;
    net: number;
    bySource: Record<string, number>;
    entries: number;
  };
  places: {
    venues: number;
    heartsDropped: number;
    heartsAllTime: number;
    encounters: number;
  };
  moderation: {
    reportsOpen: number;
    reportsCleared: number;
    ticketsOpen: number;
  };
  content: {
    posts: number;
    flares: number;
    flaresAnswered: number;
    flaresAccepted: number;
    flaresPaidWithRoses: number;
  };
  growth: { codes: number; invitesUsed: number };
};

/** What a rose reason is called out loud. */
const ROSE_LABELS: Record<string, string> = {
  purchase: "Bought",
  signup_bonus: "Signup gift",
  admin_grant: "Given by admin",
  promo: "Promo codes",
  referral: "Referrals",
  pack_bonus: "Pack bonus",
  flare: "Spent on Flares",
  super_like: "Spent on Flares",
  match_revival: "Spent on revivals",
  heart_extend: "Spent on Hearts",
  media_save: "Spent on media",
};

const number = (value: number) => value.toLocaleString("en-IN");

function Tile({
  label,
  value,
  hint,
  alert,
}: {
  label: string;
  value: string | number;
  hint?: string;
  alert?: boolean;
}) {
  return (
    <Card
      className={`border bg-card ${
        alert ? "border-destructive/50" : "border-foreground/[0.06]"
      }`}
    >
      <CardContent className="p-4">
        <p className="text-[0.8rem] tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        <p
          className={`mt-1 text-[1.5rem] font-medium tracking-tight ${
            alert ? "text-destructive" : ""
          }`}
        >
          {value}
        </p>
        {hint && (
          <p className="mt-1 text-[0.82rem] text-muted-foreground">{hint}</p>
        )}
      </CardContent>
    </Card>
  );
}

function Section({
  title,
  href,
  children,
}: {
  title: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Link
        href={href}
        className="inline-flex items-center gap-1 text-[0.8rem] font-bold tracking-wider text-muted-foreground uppercase underline-offset-4 hover:text-foreground hover:underline"
      >
        {title}
        <span aria-hidden>→</span>
      </Link>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  );
}

export function PulseSections({ range }: { range: string }) {
  const [data, setData] = useState<Sections | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<Sections>(
      `/api/pulse-sections?range=${range}`,
    );

    if (error) setError(error);
    else {
      setData(data ?? null);
      setError(null);
    }
  }, [range]);

  useLoadOnMount(load);

  useLiveTable(
    ["rose_ledger", "hearts", "reports", "support_tickets", "dailies"],
    load,
  );

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/25 bg-destructive/8 px-3 py-2 text-[0.92rem] text-destructive">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-[5.5rem] rounded-xl" />
        ))}
      </div>
    );
  }

  const { roses, places, moderation, content, growth } = data;

  /*
   * The three biggest sources, named.
   *
   * The full split is a dozen reasons long and most are zero on any
   * given week; three is enough to see where the currency is actually
   * coming from without turning a tile into a table.
   */
  const topSources = Object.entries(roses.bySource)
    .filter(([, amount]) => amount > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, amount]) => `${ROSE_LABELS[reason] ?? reason} ${number(amount)}`)
    .join(" · ");

  return (
    <div className="space-y-5">
      <Section title="Roses" href="/roses">
        <Tile
          label="Roses in"
          value={number(roses.in)}
          hint={topSources || "Nothing yet"}
        />
        <Tile label="Roses spent" value={number(roses.out)} />
        <Tile
          label="Net"
          value={`${roses.net >= 0 ? "+" : ""}${number(roses.net)}`}
          hint={`${number(roses.entries)} ledger entries`}
        />
        <Tile label="Promo codes" value={number(growth.codes)} hint={`${number(growth.invitesUsed)} redeemed`} />
      </Section>

      <Section title="Hearts & places" href="/hearts">
        <Tile label="Venues" value={number(places.venues)} />
        <Tile
          label="Hearts dropped"
          value={number(places.heartsDropped)}
          hint={`${number(places.heartsAllTime)} all time`}
        />
        <Tile label="Paths crossed" value={number(places.encounters)} />
        <Tile
          label="Hearts per venue"
          value={
            places.venues > 0
              ? (places.heartsAllTime / places.venues).toFixed(1)
              : "0"
          }
          hint="All time"
        />
      </Section>

      <Section title="Moderation" href="/safety">
        <Tile
          label="Open reports"
          value={number(moderation.reportsOpen)}
          alert={moderation.reportsOpen > 0}
        />
        <Tile
          label="Open tickets"
          value={number(moderation.ticketsOpen)}
          alert={moderation.ticketsOpen > 0}
        />
        <Tile
          label="Cleared"
          value={number(moderation.reportsCleared)}
          hint="Reports closed in range"
        />
      </Section>

      <Section title="Content" href="/safety">
        <Tile label="Posts" value={number(content.posts)} hint="Dailies shared" />
        <Tile
          label="Flares sent"
          value={number(content.flares)}
          hint={`${number(content.flaresPaidWithRoses)} paid with Roses`}
        />
        <Tile
          label="Flares answered"
          value={number(content.flaresAnswered)}
          hint={`${number(content.flaresAccepted)} accepted`}
        />
      </Section>
    </div>
  );
}
