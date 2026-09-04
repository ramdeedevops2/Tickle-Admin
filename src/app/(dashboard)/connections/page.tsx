"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, Explainer, PageSkeleton } from "@/components/ui/page";
import { Segmented } from "@/components/ui/select";
import { MatchesPanel } from "@/components/connections/MatchesPanel";
import { InterestPanel } from "@/components/connections/InterestPanel";

/**
 * Who reached out, and what came of it.
 *
 * Matches and Interest were two screens telling one story from opposite
 * ends. Interest is what somebody sends before there is a match — a
 * comment, a Super Like — and Matches is whether any of it turned into a
 * conversation. Read apart, neither answers "is this working".
 */

type Tab = "matches" | "interest";

const TABS: { value: Tab; label: string }[] = [
  { value: "matches", label: "Matches" },
  { value: "interest", label: "Interest" },
];

const BLURB: Record<Tab, string> = {
  matches: "Every match, and whether the two ever talked.",
  interest: "Comments and Super Likes members send, and where they led.",
};

export default function ConnectionsPage() {
  // useSearchParams bails out of prerendering up to the nearest boundary,
  // and a production build fails outright without one.
  return (
    <Suspense fallback={<PageSkeleton sections={2} />}>
      <ConnectionsView />
    </Suspense>
  );
}

function ConnectionsView() {
  const searchParams = useSearchParams();

  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get("tab") === "interest" ? "interest" : "matches",
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Connections"
        description="Who reached out to whom, and whether it went anywhere."
        actions={<Segmented value={tab} onChange={setTab} options={TABS} />}
      />

      <Explainer>{BLURB[tab]}</Explainer>

      {tab === "matches" && <MatchesPanel />}
      {tab === "interest" && <InterestPanel />}
    </div>
  );
}
