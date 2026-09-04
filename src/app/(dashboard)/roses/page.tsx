"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/select";
import { Explainer, PageHeader, PageSkeleton } from "@/components/ui/page";
import { RoseOverview, RoseLedger, RosePurchases, RoseSpending } from "@/components/roses/RoseFlow";
import { RoseEarning, RoseGrants, RosePacks } from "@/components/roses/RoseSupply";
import type { RosePayload } from "@/components/roses/parts";

/**
 * Roses, in one place.
 *
 * The currency was administered from six screens: packs on /plans, drop
 * and extend costs on /hearts, the revival price and the media-save split
 * in fairness settings, founding grants on /cities, referral and mission
 * rewards elsewhere again. Each of those screens owned a different half
 * of the same decision — how many roses exist, and what they buy — and
 * nobody could see the tank while turning a tap.
 *
 * The tabs are that tank, in order: what is happening, what makes roses,
 * what consumes them, every movement, what the stores have sent, and what
 * an admin hands over by hand.
 *
 * The rose fields **moved** here; they were not copied. A setting
 * editable in two places is a setting with two answers.
 */

type Tab = "overview" | "packs" | "earning" | "spending" | "ledger" | "purchases" | "grants";

const TABS: { value: Tab; label: string }[] = [
  { value: "overview", label: "Overview" },
  { value: "packs", label: "Packs" },
  { value: "earning", label: "Earning" },
  { value: "spending", label: "Spending" },
  { value: "ledger", label: "Ledger" },
  { value: "purchases", label: "Purchases" },
  { value: "grants", label: "Grants" },
];

const BLURB: Record<Tab, string> = {
  overview: "How many roses exist, and where they came from.",
  packs: "What somebody can buy with real money.",
  earning: "Every way a rose is given away for free.",
  spending: "Everything a rose can be spent on, and what it costs.",
  ledger: "Every rose that has moved, newest first.",
  purchases: "Purchases from the app stores, including ones that failed.",
  grants: "Give roses to somebody, or take them back.",
};

export default function RosesPage() {
  // useSearchParams bails out of prerendering up to the nearest boundary,
  // and a production build fails outright without one.
  return (
    <Suspense fallback={<PageSkeleton sections={3} />}>
      <RosesView />
    </Suspense>
  );
}

function RosesView() {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(() => {
    const asked = searchParams.get("tab") as Tab | null;
    return asked && TABS.some((entry) => entry.value === asked) ? asked : "overview";
  });

  const [data, setData] = useState<RosePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<RosePayload>("/api/roses");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  /*
   * One writer for every number on the page.
   *
   * The body says which field and, where the table has more than one row,
   * which row — the route holds the map from field to table and the
   * bounds, so a panel cannot write somewhere it should not.
   */
  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError(null);

      const { error } = await adminFetch("/api/roses", {
        method: "PATCH",
        body: JSON.stringify(body),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const panel = () => {
    if (!data) return null;

    const props = { data, patch, busy };

    switch (tab) {
      case "overview":
        return <RoseOverview {...props} />;
      case "packs":
        return <RosePacks {...props} />;
      case "earning":
        return <RoseEarning {...props} />;
      case "spending":
        return <RoseSpending {...props} />;
      case "ledger":
        return <RoseLedger {...props} />;
      case "purchases":
        return <RosePurchases {...props} />;
      case "grants":
        return <RoseGrants {...props} reload={load} />;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roses"
        description="The in-app currency, end to end."
        actions={
          <>
            <Segmented value={tab} onChange={setTab} options={TABS} size="sm" />
            <Button
              variant="secondary"
              size="icon"
              onClick={load}
              disabled={loading || busy}
              aria-label="Refresh"
            >
              <RefreshCw className={loading ? "animate-spin" : undefined} />
            </Button>
          </>
        }
      />

      <Explainer>{BLURB[tab]}</Explainer>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-card px-4 py-3 text-[0.92rem] text-destructive">
          {error}
        </div>
      )}

      {loading && !data ? <PageSkeleton sections={3} /> : panel()}
    </div>
  );
}
