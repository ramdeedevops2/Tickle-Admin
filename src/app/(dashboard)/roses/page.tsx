"use client";

import { Suspense, useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { adminFetch } from "@/lib/adminFetch";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { Button } from "@/components/ui/button";
import { RulesEditor } from "@/components/RulesEditor";
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
 * The rose fields **moved** here; they were not copied. A setting
 * editable in two places is a setting with two answers.
 *
 * There were seven tabs, and all seven read one /api/roses response —
 * so they were never saving a request, only hiding data already
 * fetched. Worse, they split things that are only meaningful against
 * each other: Packs said what is for sale and Purchases said what
 * actually sold, two tabs apart. Overview was a summary of Earning and
 * Spending, which made it a third place to look at the same numbers.
 *
 * Three now, by what somebody is doing:
 *
 *   Numbers — looking. Totals, what sold, what moved.
 *   Prices  — changing. Every cost and reward, and nothing else.
 *   People  — one person. Granting and deducting by hand.
 *
 * An earlier pass grouped these by subject — Money, Supply, Records —
 * which left Supply holding the totals *and* both sets of settings, so
 * the longest tab was also the one where reading and writing happened
 * together. Splitting on reading versus writing is what makes Numbers
 * safe to leave open and keeps every editable field in one place.
 */

type Tab = "numbers" | "prices" | "people";

const TABS: { value: Tab; label: string }[] = [
  { value: "numbers", label: "Numbers" },
  { value: "prices", label: "Prices" },
  { value: "people", label: "People" },
];

/*
 * Where the old tab names land now.
 *
 * Five of them are linked from the command palette and from anything
 * anybody bookmarked. Dropping them would turn those into a silent
 * fallback to the first tab, which looks like the link is broken.
 */
const MOVED: Record<string, Tab> = {
  // The original seven.
  overview: "numbers",
  packs: "prices",
  purchases: "numbers",
  earning: "prices",
  spending: "prices",
  ledger: "numbers",
  grants: "people",
  // And the three they were folded into first, so links made in
  // between keep working too.
  money: "prices",
  supply: "numbers",
  records: "numbers",
};

const BLURB: Record<Tab, string> = {
  numbers: "What is happening with roses right now.",
  prices: "What roses cost, and what they are worth.",
  people: "Give roses to someone, or take some back.",
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
    const asked = searchParams.get("tab") ?? "";
    if (TABS.some((entry) => entry.value === asked)) return asked as Tab;
    // An old link — send it where that content went rather than
    // dropping the reader on the first tab with no explanation.
    // Numbers by default: opening this page is more often a look
    // than a change, and it is the one tab nothing can be broken from.
    return MOVED[asked] ?? "numbers";
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

    /*
     * One job per tab, because there are only three.
     *
     * The seven original tabs became three, which was right, but the
     * three were still named after the subject rather than the task:
     * "Supply" stacked the totals, the earning settings and the
     * spending settings in one scroll, so looking something up and
     * changing something happened on the same screen — the longest
     * tab, and the one you had to scroll past half of whichever
     * thing you did not come for.
     *
     * Split by what somebody is doing instead:
     *
     *   Numbers — looking. Totals, what sold, what moved. Read only,
     *             so nothing here can be changed by accident.
     *   Prices  — changing. Every number that sets a cost or a
     *             reward, and nothing else.
     *   People  — one person. Grant or deduct, which is the only
     *             thing on this page aimed at an individual.
     *
     * The division is reading versus writing, which is also why
     * Numbers is safe to leave open and Prices is not.
     */
    switch (tab) {
      case "numbers":
        return (
          <div className="space-y-10">
            <RoseOverview {...props} />
            <RosePurchases {...props} />
            <RoseLedger {...props} />
          </div>
        );
      case "prices":
        return (
          <div className="space-y-10">
            <RosePacks {...props} />
            <RoseEarning {...props} />
            <RoseSpending {...props} />
            {/* What a saved photo costs and how the money splits.
                It is priced in roses, so it belongs with the rest of
                what roses buy rather than on Messaging. */}
            <RulesEditor groups={["Paid media"]} />
          </div>
        );
      case "people":
        return (
          <div className="space-y-10">
            <RoseGrants {...props} reload={load} />
          </div>
        );
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
