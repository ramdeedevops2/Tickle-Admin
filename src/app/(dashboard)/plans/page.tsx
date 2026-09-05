"use client";

import { PageHeader, Explainer } from "@/components/ui/page";
import { PlanEditor } from "@/components/PlanEditor";
import { TrialsPanel } from "@/components/plans/TrialsPanel";

/*
 * Everything that decides what a membership is and what it costs.
 *
 * These were once three screens: entitlements in /config next to the
 * heart radius, price and trials in /economy, promo codes in /promos.
 * Deciding "what does premium get, and what do we charge" meant three
 * tabs and remembering which held what.
 *
 * Since then two more things collapsed. A tier's price used to have its
 * own tab, apart from the tier it priced — so the screen offered two
 * places to set the same number, and they could disagree. And two free
 * trials had a tab to themselves, which is a whole navigation step for
 * two rows. Both now sit under the tiers they belong to.
 *
 * Codes went the other way, out to /codes. Everything left on this page
 * answers one question — what a membership is worth — and a promo
 * campaign is not part of that question. It was the one tab you had to
 * remember was hiding in here.
 */

export default function PlansPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Plans & money"
        description="What a membership includes, and what it costs."
      />

      <Explainer>
        Every tier you sell, what each costs, and what each unlocks. Trials and
        discounts sit underneath, against the lengths they apply to.
      </Explainer>

      <div className="space-y-10">
        <PlanEditor />
        <TrialsPanel />
      </div>
    </div>
  );
}
