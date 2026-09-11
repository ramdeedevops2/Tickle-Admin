"use client";
import { useCallback, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { PagedList } from "@/components/ui/paged-list";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { Skeleton } from "@/components/ui/skeleton";
import { NewCodeWizard, type CodeDraft } from "@/components/plans/NewCodeWizard";
import {
  CodeRow,
  type PromoCode,
  type PromoReward,
} from "@/components/plans/CodeRow";
import {
  MilestoneRow,
  type Milestone,
  type Reward,
  type RewardPlan,
} from "@/components/plans/MilestoneRow";

/**
 * Codes you hand out, and rewards for inviting friends.
 *
 * Two things that look alike and are not. A promo code is something you
 * publish — anybody with the letters can redeem it. A referral reward
 * is paid automatically when somebody a member invited does something
 * real. One is a campaign, the other is a standing rule.
 *
 * Both used to be edited through the same wall of unlabelled boxes and
 * raw database values. Creating now happens in a wizard that asks one
 * question at a time; this screen just lists what exists and lets it be
 * switched on or off.
 */

type City = { slug: string; name: string; live?: boolean };

type Payload = {
  codes: PromoCode[];
  milestones: Milestone[];
  /** What each step pays. One row per reward, per side. */
  rewards: Reward[];
  /** What each promo code pays. */
  promoRewards: PromoReward[];
  /** Plans a reward can grant. Free is never one. */
  rewardPlans: RewardPlan[];
  rewardKinds: string[];
  referralCaps: { referral_daily_cap: number; referral_total_cap: number } | null;
  cities: City[];
  referral: {
    awarded: number;
    referrers: number;
    perMilestone: Record<string, number>;
  };
  totalRedemptions: number;
};

export function CodesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await adminFetch<Payload>("/api/promos");

    if (error) setError(error);
    else setData(data ?? null);

    setLoading(false);
  }, []);

  useLoadOnMount(load);

  const create = useCallback(
    async (draft: CodeDraft) => {
      setBusy(true);

      const { error } = await adminFetch("/api/promos", {
        method: "POST",
        body: JSON.stringify({
          code: draft.code.trim(),
          label: draft.label.trim(),
          reward_kind: draft.kind,
          reward_value: Number(draft.value),
          plan_key: draft.plan_key || null,
          // Blank means no limit, and Number("") is 0 — which would be
          // a code nobody can redeem rather than one anybody can.
          max_uses: draft.maxUses.trim() ? Number(draft.maxUses) : null,
          city: draft.city || null,
          segment: draft.segment || null,
          days: draft.days.trim() ? Number(draft.days) : null,
        }),
      });

      if (error) setError(error);
      else {
        setAdding(false);
        await load();
      }

      setBusy(false);
    },
    [load],
  );

  /*
   * Editing one invite reward.
   *
   * Saved per row rather than behind a page-wide Save: there are four
   * of them, they are independent, and a single button would make
   * changing one look like changing all four.
   */
  const save = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      setBusy(true);

      const { error } = await adminFetch("/api/promos", {
        method: "PATCH",
        body: JSON.stringify({ entity: "milestone", id, ...patch }),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const toggle = useCallback(
    async (entity: string, id: string, active: boolean) => {
      setBusy(true);

      const { error } = await adminFetch("/api/promos", {
        method: "PATCH",
        body: JSON.stringify({ entity, id, active }),
      });

      if (error) setError(error);
      else await load();

      setBusy(false);
    },
    [load],
  );

  const referral = data?.referral;

  return (
    <div className="space-y-10">
      {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

      {/* ── Promo codes ──────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h3 className="text-[0.92rem] font-bold">Promo codes</h3>
            <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
              Codes you hand out. {data?.totalRedemptions ?? 0} redeemed so far.
            </p>
          </div>

          <Button onClick={() => setAdding(true)} className="h-9 text-[0.86rem]">
            <Plus className="mr-1.5 size-3.5" />
            New code
          </Button>
        </div>

        <div className="rounded-xl border border-foreground/[0.06]">
          <PagedList
            items={data?.codes ?? []}
            perPage={10}
            /*
             * A skeleton while loading, not an empty box.
             *
             * This rendered nothing at all mid-request, so the panel
             * looked like a campaign list with no campaigns in it —
             * which is a different thing from one that has not arrived.
             */
            empty={
              loading ? (
                <div className="divide-y divide-foreground/[0.06]">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="flex items-center gap-3 p-4">
                      <Skeleton className="h-4 w-24 rounded-md" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-40 rounded-md" />
                        <Skeleton className="h-3 w-56 rounded-md" />
                      </div>
                      <Skeleton className="h-9 w-20 rounded-lg" />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="p-6 text-center text-[0.92rem] text-muted-foreground">
                  No codes yet.
                </p>
              )
            }
          >
            {(promo) => (
              <CodeRow
                key={promo.id}
                promo={promo}
                rewards={(data?.promoRewards ?? []).filter(
                  (reward) => reward.promo_id === promo.id,
                )}
                plans={data?.rewardPlans ?? []}
                busy={busy}
                onToggle={() => toggle("code", promo.id, !promo.active)}
                onChanged={load}
              />
            )}
          </PagedList>
        </div>
      </div>

      {/* ── Invite rewards ───────────────────────────── */}
      <div className="space-y-3">
        <div>
          <h3 className="text-[0.92rem] font-bold">Invite rewards</h3>
          <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
            Paid automatically when somebody they invited reaches each step.{" "}
            {referral?.awarded ?? 0} paid out across {referral?.referrers ?? 0} members.
          </p>
          {/*
            Worth saying out loud on this screen. Past these numbers
            awards stop without any error — which is correct, but it is
            also the first thing to check when a reward looks right and
            somebody insists it did not pay.
          */}
          {data?.referralCaps && (
            <p className="mt-1 text-[0.8rem] leading-relaxed text-muted-foreground">
              However these are set, one member can earn from{" "}
              {data.referralCaps.referral_daily_cap} invites a day and{" "}
              {data.referralCaps.referral_total_cap} in total. Past that, rewards stop
              quietly so invite farming does not pay.
            </p>
          )}
        </div>

        <div className="rounded-xl border border-foreground/[0.06]">
          {(data?.milestones ?? []).map((milestone, index) => (
            <MilestoneRow
              key={milestone.id}
              milestone={milestone}
              rewards={(data?.rewards ?? []).filter(
                (reward) => reward.milestone === milestone.key,
              )}
              plans={data?.rewardPlans ?? []}
              paid={referral?.perMilestone[milestone.key] ?? 0}
              busy={busy}
              first={index === 0}
              onSave={save}
              onToggle={() => toggle("milestone", milestone.id, !milestone.active)}
              onChanged={load}
            />
          ))}
        </div>
      </div>

      {adding && (
        <NewCodeWizard
          rewardKinds={data?.rewardKinds ?? []}
          plans={data?.rewardPlans ?? []}
          cities={data?.cities ?? []}
          busy={busy}
          onCancel={() => setAdding(false)}
          onCreate={create}
        />
      )}
    </div>
  );
}

/**
 * A pill that is on or off.
 *
 * Two of these rather than a pair of checkboxes because the question is
 * "who is paid", and the answer is one, the other, or both — which
 * reads better as two things you press than as a list you tick.
 */
function Toggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-lg border px-3 py-2 text-[0.86rem] font-medium transition-colors ${
        on
          ? "border-foreground/20 bg-foreground text-background"
          : "border-foreground/[0.12] text-muted-foreground hover:border-foreground/25"
      }`}
    >
      {children}
    </button>
  );
}

/** The reward names, for the dropdown. */
const REWARD_LABEL: Record<string, string> = {
  roses: "Free roses",
  premium_days: "Free Premium",
  super_likes: "Free Super Likes",
  premium_discount: "Money off Premium",
  pack_bonus: "Bonus on a rose pack",
};
