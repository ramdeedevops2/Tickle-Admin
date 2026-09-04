"use client";

import { useState } from "react";
import { PageHeader, Explainer } from "@/components/ui/page";
import { Segmented } from "@/components/ui/select";
import { PlanEditor } from "@/components/PlanEditor";
import { PricingPanel } from "@/components/plans/PricingPanel";
import { CodesPanel } from "@/components/plans/CodesPanel";

/*
 * Everything that decides what a membership is and what it costs.
 *
 * These three things were in three different places: the entitlements
 * were buried in /config next to the heart radius, the price and the
 * trials were in /economy, and the promo codes were in /promos. Deciding
 *"what does premium get, and what do we charge" meant three tabs and
 * remembering which held what.
 *
 * They are one subject and they are now one screen.
 */

type Tab = "plans" | "pricing" | "codes";

const TABS: { value: Tab; label: string }[] = [
  { value: "plans", label: "What you get" },
  { value: "pricing", label: "Premium price" },
  { value: "codes", label: "Codes" },
];

/** What each tab is for, said plainly rather than assumed. */
const BLURB: Record<Tab, string> = {
  plans: "What a free member gets each day, and what a paying one gets.",
  pricing: "What Premium costs, and any offer running. Rose packs are priced on the Roses screen.",
  codes: "Codes you hand out, and rewards for inviting friends.",
};

export default function PlansPage() {
  const [tab, setTab] = useState<Tab>("plans");

  return (
    <div className="space-y-4">
      <PageHeader
        title="Plans & money"
        description="What a membership includes, and what it costs."
        actions={
          <Segmented value={tab} onChange={setTab} options={TABS} />
        }
      />

      {/* The blurb changes with the tab. One sentence, so somebody
          landing on a tab they did not choose still knows what it is. */}
      <Explainer>{BLURB[tab]}</Explainer>

      {/*
        Each panel is mounted only while its tab is showing. They each
        fetch on mount, so rendering all three at once would fire three
        requests to show one of them.
      */}
      {tab === "plans" && <PlanEditor />}
      {tab === "pricing" && <PricingPanel />}
      {tab === "codes" && <CodesPanel />}
    </div>
  );
}
