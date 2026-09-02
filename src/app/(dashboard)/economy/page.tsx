"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Plus, RefreshCw } from "lucide-react";

/**
 * Packs, promotions, Premium plans and offers.
 *
 * The three numbers at the top are the only honest way to judge any of
 * the settings below. A currency where almost everything was granted
 * rather than bought is one people are earning faster than they can
 * spend — which means either the prices or the rewards are wrong, and no
 * amount of tuning a single pack fixes it.
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

export default function EconomyPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"packs" | "premium">("packs");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/economy");

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

  const economy = data?.economy;

  /*
   * How much of the currency in circulation was actually paid for.
   *
   * Low is not automatically wrong — generous onboarding is a choice —
   * but it is the number that explains why revenue is flat while the
   * ledger is busy.
   */
  const paidShare =
    economy && economy.purchased + economy.granted > 0
      ? Math.round((economy.purchased / (economy.purchased + economy.granted)) * 100)
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Economy</h2>
          <p className="text-muted-foreground">
            Packs, promotions and Premium. Prices are rows, not deploys.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={tab === "packs" ? "default" : "outline"} size="sm" onClick={() => setTab("packs")}>
            Hearts
          </Button>
          <Button variant={tab === "premium" ? "default" : "outline"} size="sm" onClick={() => setTab("premium")}>
            Premium
          </Button>
          <Button variant="outline" size="icon" onClick={load} disabled={loading}>
            <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="pt-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {economy && (
        <div className="grid gap-4 md:grid-cols-3">
          <Stat label="Bought" value={economy.purchased} />
          <Stat label="Granted" value={economy.granted} />
          <Stat label="Spent" value={economy.spent} />
        </div>
      )}

      {paidShare !== null && paidShare < 15 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 pt-6 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="font-medium">Only {paidShare}% of Hearts were paid for</p>
              <p className="text-muted-foreground">
                People are earning faster than they can spend. That is a choice, but if
                purchases are the goal it is the number to fix — not the price of one pack.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "packs" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Packs</CardTitle>
              <p className="text-sm text-muted-foreground">
                A pack with no product id cannot be charged for — it is a draft however it
                looks here.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.packs ?? []).map((pack) => (
                <div key={pack.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <div className="min-w-[120px]">
                    <div className={pack.active ? "font-medium" : "font-medium line-through opacity-50"}>
                      {pack.label}
                    </div>
                    <div className="text-xs text-muted-foreground">{pack.key}</div>
                  </div>

                  <NumField
                    label="Hearts"
                    value={pack.amount}
                    onCommit={(v) => patch({ entity: "pack", id: pack.id, amount: v })}
                    disabled={busy}
                  />
                  <NumField
                    label="Bonus"
                    value={pack.bonus}
                    onCommit={(v) => patch({ entity: "pack", id: pack.id, bonus: v })}
                    disabled={busy}
                  />
                  <NumField
                    label="Price (paise)"
                    value={pack.price_minor}
                    width="w-28"
                    onCommit={(v) => patch({ entity: "pack", id: pack.id, price_minor: v })}
                    disabled={busy}
                  />
                  <NumField
                    label="Premium bonus"
                    value={pack.premium_bonus}
                    onCommit={(v) => patch({ entity: "pack", id: pack.id, premium_bonus: v })}
                    disabled={busy}
                  />

                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Store id</label>
                    <Input
                      defaultValue={pack.product_id ?? ""}
                      placeholder="not set"
                      disabled={busy}
                      onBlur={(event) => {
                        if (event.target.value !== (pack.product_id ?? "")) {
                          patch({ entity: "pack", id: pack.id, product_id: event.target.value });
                        }
                      }}
                      className="h-8 w-40 font-mono text-xs"
                    />
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    {!pack.product_id && <Badge variant="secondary">draft</Badge>}
                    <Badge variant="outline">{money(pack.price_minor)}</Badge>
                    <Button
                      variant={pack.active ? "ghost" : "default"}
                      size="sm"
                      disabled={busy}
                      onClick={() => patch({ entity: "pack", id: pack.id, active: !pack.active })}
                    >
                      {pack.active ? "Retire" : "Restore"}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Promotions</CardTitle>
              <p className="text-sm text-muted-foreground">
                No mystery boxes — paying an uncertain amount for an uncertain reward is
                gambling whatever it is called.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.promotions ?? []).map((promo) => (
                <Row
                  key={promo.id}
                  title={promo.label}
                  subtitle={`${promo.kind} · ${promo.value}${promo.kind === "bonus_percent" ? "%" : ""}`}
                  active={promo.active}
                  ends={promo.ends_at}
                  busy={busy}
                  onToggle={() => patch({ entity: "promotion", id: promo.id, active: !promo.active })}
                />
              ))}

              {(data?.promotions ?? []).length === 0 && !loading && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No promotions running.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {tab === "premium" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Durations</CardTitle>
              <p className="text-sm text-muted-foreground">
                One tier, sold in lengths. What Premium <em>does</em> is set on the Plans
                page.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.premiumPlans ?? []).map((plan) => (
                <div key={plan.id} className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                  <div className="min-w-[110px]">
                    <div className={plan.active ? "font-medium" : "font-medium line-through opacity-50"}>
                      {plan.label}
                    </div>
                    <div className="text-xs text-muted-foreground">{plan.days} days</div>
                  </div>

                  <NumField
                    label="Price (paise)"
                    value={plan.price_minor}
                    width="w-28"
                    onCommit={(v) => patch({ entity: "plan", id: plan.id, price_minor: v })}
                    disabled={busy}
                  />
                  <NumField
                    label="Compare at"
                    value={plan.compare_minor ?? 0}
                    width="w-28"
                    onCommit={(v) => patch({ entity: "plan", id: plan.id, compare_minor: v })}
                    disabled={busy}
                  />

                  <div className="ml-auto flex items-center gap-2">
                    {!plan.product_id && <Badge variant="secondary">draft</Badge>}
                    <Badge variant="outline">{money(plan.price_minor)}</Badge>
                    <Button
                      variant={plan.active ? "ghost" : "default"}
                      size="sm"
                      disabled={busy}
                      onClick={() => patch({ entity: "plan", id: plan.id, active: !plan.active })}
                    >
                      {plan.active ? "Retire" : "Restore"}
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Trials and offers</CardTitle>
              <p className="text-sm text-muted-foreground">
                A campaign without a redemption cap is an open-ended cost, and whoever set
                it up is not the one who notices.
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              {(data?.premiumOffers ?? []).map((offer) => (
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
                  onToggle={() => patch({ entity: "offer", id: offer.id, active: !offer.active })}
                />
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="text-3xl font-bold">{value.toLocaleString()}</CardContent>
    </Card>
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
    <div className="flex items-center gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1">
        <div className={active ? "font-medium" : "font-medium line-through opacity-50"}>
          {title}
        </div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>

      {warn && active && (
        <Badge variant="secondary" title="No redemption cap">
          uncapped
        </Badge>
      )}

      {ends && (
        <span className="text-xs text-muted-foreground">
          ends {new Date(ends).toLocaleDateString()}
        </span>
      )}

      <Button variant={active ? "ghost" : "default"} size="sm" disabled={busy} onClick={onToggle}>
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
      <label className="text-xs text-muted-foreground">{label}</label>
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
