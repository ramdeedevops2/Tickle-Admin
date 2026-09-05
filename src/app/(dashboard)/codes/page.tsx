"use client";

import { PageHeader, Explainer } from "@/components/ui/page";
import { CodesPanel } from "@/components/plans/CodesPanel";

/*
 * Promo codes, and rewards for inviting friends.
 *
 * This was a tab inside Plans & money. It came out because it is not
 * a pricing question: nobody opens the tier editor in order to check
 * whether a campaign code is still live, or why an invite reward did
 * not pay. Two unrelated jobs sharing a screen meant one of them was
 * always the one you had to remember was in there.
 */

export default function CodesPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        title="Codes & invites"
        description="Codes you hand out, and what inviting a friend earns."
      />

      <Explainer>
        A code is published — anybody with the letters can redeem it. An invite
        reward is paid automatically when somebody a member brought in reaches a
        step. One is a campaign, the other is a standing rule.
      </Explainer>

      <CodesPanel />
    </div>
  );
}
