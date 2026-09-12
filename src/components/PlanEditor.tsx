"use client";
import { useCallback, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";
import { Plus, Pencil, Star } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { NewTierWizard, type Draft } from "@/components/plans/NewTierWizard";

/**
 * Tiers, as cards.
 *
 * A tier used to be one of exactly two fixed columns. Now there can be
 * any number, so the screen is a grid of what exists plus a way to add
 * one — and editing happens in a panel rather than inline, because a
 * tier is eighteen fields and eighteen fields on a card is not a card.
 *
 * The grid answers "what are we selling and for how much" at a glance.
 * The panel answers "what does this one actually give you".
 */

type Plan = {
  key: string;
  label: string;
  tagline: string;
  days: number | null;
  price_minor: number | null;
  compare_minor: number | null;
  currency: string;
  featured: boolean;
  active: boolean;
  sort_order: number;
  product_id: string | null;

  daily_interactions: number | null;
  daily_comments: number;
  daily_super_likes: number;
  daily_flares: number;
  flare_rose_cost: number;
  daily_paths_likes: number;
  visibility_multiplier: number;
  active_chat_limit: number;
  super_like_rose_cost: number;
  signup_roses: number;
  expired_history: string;

  sees_who_liked: boolean;
  can_hide_presence: boolean;
  can_incognito: boolean;
};

type Payload = {
  plans: Plan[];
  activePremium: number;
  lapsedPremium: number;
  membersByPlan: Record<string, number>;
};


/** "30 days" → 30. Anything unparseable falls back to a week. */
function historyDays(interval: string | null): number {
  const match = /(\d+)/.exec(interval ?? "");
  return match ? Number(match[1]) : 7;
}

/**
 * A blank tier, seeded from free.
 *
 * Starting the allowances at free rather than at zero means the first
 * screen of the wizard already holds sensible numbers — and a tier
 * somebody is charged for can never begin worse than the free one.
 */
function blankDraft(free?: Plan): Draft {
  const n = (value: number | null | undefined, fallback: string) =>
    value === null || value === undefined ? fallback : String(value);

  return {
    label: "",
    tagline: "",
    price: "",
    compare: "",
    days: "30",
    product_id: "",
    daily_interactions: free?.daily_interactions == null ? "" : String(free.daily_interactions),
    daily_comments: n(free?.daily_comments, "3"),
    daily_super_likes: n(free?.daily_super_likes, "1"),
    daily_flares: n(free?.daily_flares, "0"),
    flare_rose_cost: n(free?.flare_rose_cost, "5"),
    daily_paths_likes: n(free?.daily_paths_likes, "5"),
    active_chat_limit: n(free?.active_chat_limit, "5"),
    super_like_rose_cost: n(free?.super_like_rose_cost, "5"),
    visibility_multiplier: n(free?.visibility_multiplier, "1"),
    expired_history_days: String(historyDays(free?.expired_history ?? null)),
    sees_who_liked: false,
    /*
     * Inherited from free rather than hardcoded off, like the numbers
     * above it.
     *
     * Private mode is on every plan, so a new tier starting with it off
     * would take it away from whoever upgraded to that tier — paying
     * money to lose something. The other three gates stay off by
     * default because they genuinely are what a tier adds.
     */
    can_incognito: free?.can_incognito ?? true,
    can_hide_presence: false,
  };
}

/**
 * An existing tier, as wizard fields.
 *
 * Editing and creating are the same eighteen questions, so they are the
 * same form — one asked with empty answers, one with the tier's own.
 * Two forms meant a field added to the wizard had to be remembered in
 * the editor, and the editor is where it was forgotten.
 *
 * Paise back to rupees, because the wizard collects rupees.
 */
function draftFrom(plan: Plan): Draft {
  const n = (value: number | null | undefined, fallback: string) =>
    value === null || value === undefined ? fallback : String(value);

  const rupees = (minor: number | null) => (minor == null ? "" : String(minor / 100));

  return {
    label: plan.label,
    tagline: plan.tagline,
    price: rupees(plan.price_minor),
    compare: rupees(plan.compare_minor),
    days: plan.days == null ? "" : String(plan.days),
    product_id: plan.product_id ?? "",
    daily_interactions:
      plan.daily_interactions == null ? "" : String(plan.daily_interactions),
    daily_comments: n(plan.daily_comments, "3"),
    daily_super_likes: n(plan.daily_super_likes, "1"),
    daily_flares: n(plan.daily_flares, "0"),
    flare_rose_cost: n(plan.flare_rose_cost, "5"),
    daily_paths_likes: n(plan.daily_paths_likes, "5"),
    active_chat_limit: n(plan.active_chat_limit, "5"),
    super_like_rose_cost: n(plan.super_like_rose_cost, "5"),
    visibility_multiplier: n(plan.visibility_multiplier, "1"),
    expired_history_days: String(historyDays(plan.expired_history)),
    sees_who_liked: plan.sees_who_liked,
    can_incognito: plan.can_incognito,
    can_hide_presence: plan.can_hide_presence,
  };
}

const money = (minor: number | null) =>
  minor == null ? "Free" : `₹${(minor / 100).toLocaleString("en-IN")}`;

export function PlanEditor() {
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await adminFetch<Payload>("/api/plans");

    if (error || !data) {
      setError(error ?? "Failed to load plans.");
      return;
    }

    setData(data);
    setError(null);
  }, []);

  useLoadOnMount(load);

  const patch = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      const { error } = await adminFetch("/api/plans", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (error) setError(error);
      else await load();
      setBusy(false);
    },
    [load],
  );

  /*
   * Creating writes the row the form filled in.
   *
   * "Add a tier" used to insert an empty row called New tier and leave
   * you to find and edit it — which is a tier that briefly exists with
   * no price and no name anybody chose. Now the panel opens first and
   * nothing is written until it is saved.
   */
  const create = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      const { error } = await adminFetch("/api/plans", {
        method: "POST",
        body: JSON.stringify(body),
      });
      if (error) setError(error);
      else await load();
      setBusy(false);
    },
    [load],
  );

  const remove = useCallback(
    async (plan: Plan) => {
      const members = data?.membersByPlan[plan.key] ?? 0;

      const yes = await confirm({
        title: members > 0 ? `Retire ${plan.label}?` : `Delete ${plan.label}?`,
        body:
          members > 0
            ? `${members} ${members === 1 ? "person is" : "people are"} on this tier. They keep it until it runs out; nobody new can buy it.`
            : "Nobody is on this tier, so it goes for good.",
        confirmLabel: members > 0 ? "Retire it" : "Delete it",
        tone: "danger",
      });

      if (!yes) return;

      setBusy(true);
      const { error } = await adminFetch(`/api/plans?key=${encodeURIComponent(plan.key)}`, {
        method: "DELETE",
      });
      if (error) setError(error);
      else await load();
      setBusy(false);
    },
    [confirm, data, load],
  );

  const open = useMemo(
    () => data?.plans.find((plan) => plan.key === editing) ?? null,
    [data, editing],
  );

  /*
   * A skeleton in the shape of the grid, not a blank screen.
   *
   * This returned null while loading, so the page showed its heading
   * over nothing and then snapped into a three-card grid — which reads
   * as a failed request until the moment it does not.
   */
  if (!data) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-4 w-24 rounded-md" />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <div
              key={index}
              className="space-y-4 rounded-xl border border-foreground/[0.06] p-5"
            >
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-3 w-40 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-lg" />
              <Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
        {data.activePremium} paying
        {data.lapsedPremium > 0 && `, ${data.lapsedPremium} lapsed`}
      </p>

      {error && <p className="text-[0.92rem] text-destructive">{error}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.plans.map((plan) => {
          const members = data.membersByPlan[plan.key] ?? 0;
          const free = plan.key === "free";

          return (
            <div
              key={plan.key}
              className={`space-y-4 rounded-xl border p-5 ${
                plan.featured
                  ? "border-foreground/25 bg-foreground/[0.02]"
                  : "border-foreground/[0.06]"
              } ${plan.active ? "" : "opacity-60"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-[0.92rem] font-bold">{plan.label}</h3>
                    {plan.featured && (
                      <Star className="size-3.5 shrink-0 fill-current text-foreground/70" />
                    )}
                  </div>
                  <p className="truncate text-[0.8rem] text-muted-foreground">
                    {plan.tagline || (free ? "What everybody starts on" : "No tagline yet")}
                  </p>
                </div>

                {/* Free has no switch: every gate falls back to it, so
                    turning it off would leave members with no plan. */}
                {!free && (
                  <Switch
                    checked={plan.active}
                    disabled={busy}
                    onCheckedChange={(next) => patch({ key: plan.key, active: next })}
                  />
                )}
              </div>

              <div className="flex items-baseline gap-2">
                <span className="text-[1.6rem] font-light tracking-tight tabular-nums">
                  {money(plan.price_minor)}
                </span>
                {plan.days != null && (
                  <span className="text-[0.86rem] text-muted-foreground">
                    / {plan.days} days
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {members > 0 && (
                  <Badge variant="outline" className="text-[0.8rem]">
                    {members} on it
                  </Badge>
                )}
                {!free && !plan.product_id && (
                  <Badge variant="secondary" className="text-[0.8rem]">
                    no store id
                  </Badge>
                )}
                {!free && plan.active && plan.price_minor == null && (
                  <Badge variant="secondary" className="text-[0.8rem]">
                    no price
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-foreground/[0.06] pt-3">
                <Button
                  variant="outline"
                  onClick={() => setEditing(plan.key)}
                  className="h-9 text-[0.86rem]"
                >
                  <Pencil className="mr-1.5 size-3.5" />
                  Edit plan
                </Button>

                {!free && (
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => remove(plan)}
                    className="h-9 text-[0.86rem] text-muted-foreground"
                  >
                    {members > 0 ? "Retire" : "Delete"}
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        {/* Adding one is the same size and shape as having one, so the
            grid does not reflow when a tier appears. */}
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex min-h-[13rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-foreground/15 text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
        >
          <Plus className="size-5" />
          <span className="text-[0.86rem] font-medium">Add a tier</span>
        </button>
      </div>

      {/*
        Editing and creating are the same modal.

        They were a side sheet and a wizard: two forms asking the same
        eighteen questions in two layouts, which meant a field added to
        one had to be remembered in the other. The wizard's grouping is
        the better of the two — four short steps rather than a column
        nobody reads to the bottom of — so editing uses it, with every
        step open at once because the answers already exist.

        Keyed on the tier, so opening a different one is a fresh
        component with freshly seeded fields rather than one that has to
        notice the row underneath it changed.
      */}
      {open && (
        <NewTierWizard
          key={open.key}
          mode="edit"
          planKey={open.key}
          defaults={draftFrom(open)}
          busy={busy}
          onCancel={() => setEditing(null)}
          onCreate={async (body) => {
            await patch({ key: open.key, ...body });
            setEditing(null);
          }}
        />
      )}

      {/*
        A tier that does not exist yet.

        Same modal, seeded from the free row so the numbers start
        somewhere sensible rather than at zero, and stepped rather than
        open: eighteen empty boxes at once is how a tier ends up created
        with no price and defaults nobody read.
      */}
      {adding && (
        <NewTierWizard
          defaults={blankDraft(data.plans.find((p) => p.key === "free"))}
          busy={busy}
          onCancel={() => setAdding(false)}
          onCreate={async (body) => {
            await create(body);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}

