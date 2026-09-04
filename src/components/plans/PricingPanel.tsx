"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PagedList } from "@/components/ui/paged-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RefreshCw } from "lucide-react";
import { useLoadOnMount } from "@/lib/useLoadOnMount";

/**
 * Premium: what it costs, and what is discounting it.
 *
 * Rose packs and their promotions used to live here too, on the argument
 * that a pack and a subscription are both things somebody buys. They are
 * not the same decision: a pack is a rose price, and rose prices are only
 * judgeable next to every other rose price. They moved to /roses whole,
 * and this route still serves them for anyone who asks — but nothing in
 * the panel edits them anywhere else.
 *
 * Nothing on this page grants anything. Crediting happens server-side
 * after a store receipt is verified.
 */

type Pack = {
  id: string;
  key: string;
  label: string;
  amount: number;
  bonus: number;
  price_minor: number;
  premium_bonus: number;
  product_id: string | null;
  active: boolean;
};

type Promotion = {
  id: string;
  key: string;
  label: string;
  kind: string;
  value: number;
  pack_key: string | null;
  ends_at: string | null;
  active: boolean;
};

type PremiumPlan = {
  id: string;
  key: string;
  label: string;
  days: number;
  price_minor: number;
  compare_minor: number | null;
  product_id: string | null;
  active: boolean;
};

type Offer = {
  id: string;
  key: string;
  label: string;
  kind: string;
  value: number;
  max_redemptions: number | null;
  redeemed: number;
  ends_at: string | null;
  active: boolean;
};

type Payload = {
  packs: Pack[];
  promotions: Promotion[];
  premiumPlans: PremiumPlan[];
  premiumOffers: Offer[];
  economy: { purchased: number; granted: number; spent: number };
};

const money = (minor: number) => `₹${(minor / 100).toFixed(0)}`;

export function PricingPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/economy");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const patch = useCallback(
    async (update: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/economy", {
        method: "PATCH",
        body: JSON.stringify(update),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Durations</CardTitle>
          <p className="text-[0.92rem] text-muted-foreground">
            One tier, sold in lengths. What Premium <em>does</em> is set on the
            Plans page.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <PagedList
            items={data?.premiumPlans ?? []}
            perPage={15}
            className="space-y-2"
          >
            {(plan) => (
              <div
                key={plan.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
              >
                <div className="min-w-[110px]">
                  <div
                    className={
                      plan.active
                        ? "font-medium"
                        : "font-medium line-through opacity-50"
                    }
                  >
                    {plan.label}
                  </div>
                  <div className="text-[1rem] leading-relaxed text-muted-foreground">
                    {plan.days} days
                  </div>
                </div>

                <NumField
                  label="Price in paise — 9900 is ₹99"
                  value={plan.price_minor}
                  width="w-28"
                  onCommit={(v) =>
                    patch({ entity: "plan", id: plan.id, price_minor: v })
                  }
                  disabled={busy}
                />
                <NumField
                  label="Compare at"
                  value={plan.compare_minor ?? 0}
                  width="w-28"
                  onCommit={(v) =>
                    patch({ entity: "plan", id: plan.id, compare_minor: v })
                  }
                  disabled={busy}
                />

                <div className="ml-auto flex items-center gap-2">
                  {!plan.product_id && <Badge variant="secondary">draft</Badge>}
                  <Badge variant="outline">{money(plan.price_minor)}</Badge>
                  <Button
                    variant={plan.active ? "ghost" : "default"}
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      patch({
                        entity: "plan",
                        id: plan.id,
                        active: !plan.active,
                      })
                    }
                  >
                    {plan.active ? "Retire" : "Restore"}
                  </Button>
                </div>
              </div>
            )}
          </PagedList>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trials and offers</CardTitle>
          <p className="text-[0.92rem] text-muted-foreground">
            Always set a limit, or there is no ceiling on what it costs.
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <PagedList
            items={data?.premiumOffers ?? []}
            perPage={15}
            className="space-y-2"
          >
            {(offer) => (
              <Row
                key={offer.id}
                title={offer.label}
                subtitle={`${offer.kind} · ${offer.value}${offer.kind === "discount" ? "%" : " days"} · ${offer.redeemed}${
                  offer.max_redemptions ? ` / ${offer.max_redemptions}` : ""
                } taken`}
                active={offer.active}
                ends={offer.ends_at}
                warn={offer.max_redemptions === null}
                busy={busy}
                onToggle={() =>
                  patch({
                    entity: "offer",
                    id: offer.id,
                    active: !offer.active,
                  })
                }
              />
            )}
          </PagedList>
        </CardContent>
      </Card>
    </div>
  );
}

function Row({
  title,
  subtitle,
  active,
  ends,
  warn,
  busy,
  onToggle,
}: {
  title: string;
  subtitle: string;
  active: boolean;
  ends: string | null;
  warn?: boolean;
  busy: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-3">
      <div className="min-w-0 flex-1">
        <div
          className={
            active ? "font-medium" : "font-medium line-through opacity-50"
          }
        >
          {title}
        </div>
        <div className="text-[1rem] leading-relaxed text-muted-foreground">
          {subtitle}
        </div>
      </div>

      {warn && active && (
        <Badge variant="secondary" title="No limit">
          uncapped
        </Badge>
      )}

      {ends && (
        <span className="text-[1rem] leading-relaxed text-muted-foreground">
          ends {new Date(ends).toLocaleDateString()}
        </span>
      )}

      <Button
        variant={active ? "ghost" : "default"}
        size="sm"
        disabled={busy}
        onClick={onToggle}
      >
        {active ? "Stop" : "Start"}
      </Button>
    </div>
  );
}

/** Commits on blur, so a half-typed number never saves. */
function NumField({
  label,
  value,
  onCommit,
  disabled,
  width = "w-24",
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
  disabled?: boolean;
  width?: string;
}) {
  return (
    <div className="space-y-1">
      <label className="text-[1rem] leading-relaxed text-muted-foreground">
        {label}
      </label>
      <Input
        type="number"
        defaultValue={value}
        disabled={disabled}
        onBlur={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next) && next !== value) onCommit(next);
        }}
        className={`h-8 ${width}`}
      />
    </div>
  );
}
