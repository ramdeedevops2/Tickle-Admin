"use client";
import { useCallback, useMemo, useState } from "react";
import { adminFetch } from "@/lib/adminFetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { useLoadOnMount } from "@/lib/useLoadOnMount";
import { useConfirm } from "@/components/ui/confirm";
import { Plus, Pencil, ArrowLeft, Star } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
  daily_paths_likes: number;
  visibility_multiplier: number;
  active_chat_limit: number;
  super_like_rose_cost: number;
  signup_roses: number;
  expired_history: string;

  sees_who_liked: boolean;
  can_hide_presence: boolean;
  can_incognito: boolean;
  can_travel: boolean;
};

type Payload = {
  plans: Plan[];
  activePremium: number;
  lapsedPremium: number;
  membersByPlan: Record<string, number>;
};

type NumField = {
  field: keyof Plan;
  label: string;
  hint: string;
  /** Blank is allowed and means "no limit". */
  unlimited?: boolean;
};

/**
 * The numbers, in groups.
 *
 * Grouped because eighteen fields in one column is a form nobody reads
 * to the bottom of, and because "what you can do each day" and "what
 * things cost" are different questions that share a table.
 */
const GROUPS: { title: string; fields: NumField[] }[] = [
  {
    title: "Each day",
    fields: [
      {
        field: "daily_interactions",
        label: "Interactions",
        hint: "Likes and comments share this. Blank means unlimited.",
        unlimited: true,
      },
      { field: "daily_comments", label: "Comments", hint: "Counts against interactions too." },
      { field: "daily_super_likes", label: "Super Likes", hint: "Its own budget." },
      { field: "daily_paths_likes", label: "Paths Crossed likes", hint: "Likes to people whose path you crossed." },
    ],
  },
  {
    title: "Limits and costs",
    fields: [
      { field: "active_chat_limit", label: "Open chats", hint: "Conversations at once." },
      { field: "super_like_rose_cost", label: "Super Like costs", hint: "Roses per Super Like once the daily ones are gone." },
      { field: "signup_roses", label: "Roses on signup", hint: "Granted once, at account creation." },
      { field: "visibility_multiplier", label: "Visibility boost", hint: "Multiplies deck position. Never the compatibility score." },
    ],
  },
];

/** The four things a tier either unlocks or does not. */
const GATES: { field: keyof Plan; label: string; hint: string }[] = [
  { field: "sees_who_liked", label: "Sees who liked them", hint: "The main thing people pay for." },
  { field: "can_incognito", label: "Incognito browsing", hint: "Look at profiles without appearing in their likes." },
  { field: "can_travel", label: "Travel to another city", hint: "Swipe somewhere they are not." },
  { field: "can_hide_presence", label: "Hide presence", hint: "Hides online status, read receipts and typing." },
];

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
    daily_interactions: free?.daily_interactions == null ? "" : String(free.daily_interactions),
    daily_comments: n(free?.daily_comments, "3"),
    daily_super_likes: n(free?.daily_super_likes, "1"),
    daily_paths_likes: n(free?.daily_paths_likes, "5"),
    active_chat_limit: n(free?.active_chat_limit, "5"),
    super_like_rose_cost: n(free?.super_like_rose_cost, "5"),
    signup_roses: n(free?.signup_roses, "10"),
    visibility_multiplier: n(free?.visibility_multiplier, "1"),
    expired_history_days: String(historyDays(free?.expired_history ?? null)),
    sees_who_liked: false,
    can_incognito: false,
    can_travel: false,
    can_hide_presence: false,
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

  if (!data) return null;

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

      {/* Keyed on the tier, so opening a different one is a fresh
          component with freshly seeded fields rather than one that has
          to notice the row underneath it changed. */}
      {open && (
        <PlanSheet
          key={open.key}
          plan={open}
          busy={busy}
          onClose={() => setEditing(null)}
          onSave={patch}
        />
      )}

      {/* A tier that does not exist yet. Same panel, seeded from the
          free row so the numbers start somewhere sensible rather than
          at zero. */}
      {/*
        Creating is a wizard, not this panel.

        The panel is right for changing one field on a tier that exists.
        It is wrong for building one from nothing: eighteen empty boxes
        at once is how a tier ends up created with no price and defaults
        nobody read. The wizard asks four short questions and writes
        nothing until the last one.
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

/**
 * One tier, in full.
 *
 * A panel rather than an inline form: eighteen fields belong somewhere
 * with room, and opening one tier at a time is what keeps the grid
 * readable as the number of them grows.
 */
function PlanSheet({
  plan,
  busy,
  onClose,
  onSave,
}: {
  plan: Plan;
  busy: boolean;
  onClose: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  /*
   * Seeded once, from the row, by lazy useState.
   *
   * No effect and no set-during-render. The caller mounts this with
   * key={plan.key}, so switching tiers is a fresh component with fresh
   * initial state — which is what a keyed remount is for, and it
   * avoids the re-seed-after-save problem an effect would have.
   */
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const next: Record<string, string> = {};

    for (const group of GROUPS) {
      for (const f of group.fields) {
        const value = plan[f.field];
        next[String(f.field)] = value === null || value === undefined ? "" : String(value);
      }
    }

    next.label = plan.label;
    next.tagline = plan.tagline;
    next.price = plan.price_minor == null ? "" : String(plan.price_minor / 100);
    next.compare = plan.compare_minor == null ? "" : String(plan.compare_minor / 100);
    next.days = plan.days == null ? "" : String(plan.days);
    next.product_id = plan.product_id ?? "";
    next.expired_history_days = String(historyDays(plan.expired_history));

    return next;
  });

  const [gates, setGates] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      GATES.map((gate) => [String(gate.field), Boolean(plan[gate.field])]),
    ),
  );

  // A tier being created is never the free one, whatever it was seeded from.
  const free = plan.key === "free";

  const save = async () => {
    const body: Record<string, unknown> = { key: plan.key };

    for (const group of GROUPS) {
      for (const f of group.fields) {
        const raw = draft[String(f.field)] ?? "";
        body[String(f.field)] = f.unlimited && raw.trim() === "" ? null : Number(raw);
      }
    }

    body.label = draft.label;
    body.tagline = draft.tagline;
    body.expired_history_days = Number(draft.expired_history_days || "7");

    if (!free) {
      // Rupees in, paise out. Asking somebody to type 29900 for ₹299 is
      // asking for the typo that ships a tier at ₹29,900.
      body.price_minor = draft.price.trim() === "" ? null : Math.round(Number(draft.price) * 100);
      body.compare_minor =
        draft.compare.trim() === "" ? null : Math.round(Number(draft.compare) * 100);
      body.days = draft.days.trim() === "" ? null : Number(draft.days);
      body.product_id = draft.product_id;
    }

    for (const gate of GATES) body[String(gate.field)] = gates[String(gate.field)] ?? false;

    await onSave(body);
    onClose();
  };

  return (
    <Sheet open onOpenChange={(next) => !next && onClose()}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{plan.label}</SheetTitle>
          <SheetDescription>
            {free
              ? "What everybody gets before paying anything."
              : "What this tier costs and what it unlocks."}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 overflow-y-auto px-4 pb-24">
          <Section title="Name">
            <Field
              id="label"
              label="Shown in the app"
              hint="The name on the pricing card."
              value={draft.label ?? ""}
              onChange={(v) => setDraft((p) => ({ ...p, label: v }))}
            />
            <Field
              id="tagline"
              label="One line under it"
              hint="What this tier is for, in a sentence."
              value={draft.tagline ?? ""}
              onChange={(v) => setDraft((p) => ({ ...p, tagline: v }))}
            />
          </Section>

          {/* Free is not sold, so it has no price to set. */}
          {!free && (
            <Section title="Price">
              <Field
                id="price"
                label="Price in rupees"
                hint="What it costs. Leave blank to keep it unsellable."
                value={draft.price ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, price: v }))}
              />
              <Field
                id="compare"
                label="Compare at"
                hint="Struck-through price, for a saving. Blank for none."
                value={draft.compare ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, compare: v }))}
              />
              <Field
                id="days"
                label="Length in days"
                hint="How long one purchase lasts."
                value={draft.days ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, days: v }))}
              />
              <Field
                id="product_id"
                label="Store product id"
                hint="From Play Console or App Store Connect. Blank until set up."
                value={draft.product_id ?? ""}
                onChange={(v) => setDraft((p) => ({ ...p, product_id: v }))}
              />
            </Section>
          )}

          {GROUPS.map((group) => (
            <Section key={group.title} title={group.title}>
              {group.fields.map((f) => (
                <Field
                  key={String(f.field)}
                  id={String(f.field)}
                  label={f.label}
                  hint={f.hint}
                  value={draft[String(f.field)] ?? ""}
                  placeholder={f.unlimited ? "Unlimited" : ""}
                  onChange={(v) => setDraft((p) => ({ ...p, [String(f.field)]: v }))}
                />
              ))}
            </Section>
          ))}

          <Section title="History">
            <Field
              id="expired_history_days"
              label="Expired matches kept"
              hint="Days an expired match can still be revived."
              value={draft.expired_history_days ?? ""}
              onChange={(v) => setDraft((p) => ({ ...p, expired_history_days: v }))}
            />
          </Section>

          <Section title="What it unlocks">
            {GATES.map((gate) => (
              <div
                key={String(gate.field)}
                className="flex items-start justify-between gap-4 border-t border-foreground/[0.06] pt-3 first:border-0 first:pt-0"
              >
                <div className="min-w-0">
                  <div className="text-[0.86rem] font-medium">{gate.label}</div>
                  <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
                    {gate.hint}
                  </p>
                </div>
                <Switch
                  checked={gates[String(gate.field)] ?? false}
                  onCheckedChange={(next) =>
                    setGates((p) => ({ ...p, [String(gate.field)]: next }))
                  }
                />
              </div>
            ))}
          </Section>

          {!free && (
            <Section title="Highlight">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[0.86rem] font-medium">Feature this tier</div>
                  <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
                    Drawn larger in the app. Only one tier can be featured.
                  </p>
                </div>
                <Switch
                  checked={plan.featured}
                  disabled={busy}
                  onCheckedChange={(next) => onSave({ key: plan.key, featured: next })}
                />
              </div>
            </Section>
          )}
        </div>

        {/* Pinned, so Save is reachable from the bottom of a long form
            without scrolling back up to find it. */}
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-2 border-t border-foreground/[0.06] bg-card px-4 py-3">
          <Button variant="outline" onClick={onClose} className="h-10 text-[0.86rem]">
            <ArrowLeft className="mr-1.5 size-3.5" />
            Back
          </Button>
          <Button onClick={save} disabled={busy} className="h-10 flex-1 text-[0.86rem]">
            {busy ? "Saving" : "Save changes"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <h4 className="text-[0.8rem] font-bold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

/**
 * One labelled field.
 *
 * The hint sits between the label and the box because it says what to
 * type — underneath means reading it after the mistake.
 */
function Field({
  id,
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-[0.86rem] font-medium">
        {label}
      </label>
      <p className="text-[0.8rem] leading-relaxed text-muted-foreground">{hint}</p>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        /*
         * Everything here is a number except the name, the tagline and
         * the store product id.
         *
         * Declared per field rather than left as text, because a price
         * that accepts letters is a price that reaches the server as
         * NaN — and the failure surfaces as a constraint error nobody
         * can trace back to the box they typed in.
         */
        type={TEXT_FIELDS.has(id) ? undefined : "number"}
        min={0}
        className="h-11 px-3"
      />
    </div>
  );
}

/** The three fields on a tier that are genuinely words. */
const TEXT_FIELDS = new Set(["label", "tagline", "product_id"]);
