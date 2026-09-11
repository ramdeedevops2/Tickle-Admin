"use client";

import { PageHeader } from "@/components/ui/page";
import { PlanEditor } from "@/components/PlanEditor";

/*
 * Everything that decides what a membership is and what it costs.
 *
 * These were once three screens: entitlements in /config next to the
 * heart radius, price and trials in /economy, promo codes in /promos.
 * Deciding "what does premium get, and what do we charge" meant three
 * tabs and remembering which held what.
 *
 * Since then the page has lost things rather than gained them. A tier's
 * price used to have its own tab, apart from the tier it priced — two
 * places to set the same number, which could disagree. Codes went out
 * to /codes, because a promo campaign is not part of what a membership
 * is worth.
 *
 * Trials went last. They were premium_offers rows: a fixed number of
 * free days, claimable once, unable to hold a price or a store id. The
 * two that existed — three days and seven — are now tiers of their own
 * in their own right, which is what 073 did, and a tier is a card up
 * there rather than a row down here. What was left was a section for a
 * kind of thing we had stopped having.
 */

export default function PlansPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Plans & money"
        description="Every tier you sell, what each costs, and what each unlocks."
      />

      <PlanEditor />
    </div>
  );
}
