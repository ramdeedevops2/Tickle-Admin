"use client";

import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useModalLock } from "@/lib/useModalLock";
import { Check, X } from "lucide-react";

/**
 * Creating a tier, one question at a time.
 *
 * A tier is eighteen fields. Put on one screen they read as a wall and
 * get filled in wrongly — the price gets typed into the comments box,
 * the entitlements get skipped entirely, and the result is a tier
 * somebody is charged for that gives them less than free.
 *
 * So it is four short steps, and a step will not open until the one
 * before it is answerable. That is not decoration: it means every tier
 * that reaches the database has a name, a price and a decided set of
 * features, rather than defaults nobody looked at.
 *
 * Nothing is written until the last step. Cancelling leaves no row.
 */

export type Draft = {
  label: string;
  tagline: string;
  price: string;
  compare: string;
  days: string;
  /** Store product id. Empty until the product exists in the store. */
  product_id: string;
  daily_interactions: string;
  daily_comments: string;
  daily_flares: string;
  flare_rose_cost: string;
  daily_paths_likes: string;
  active_chat_limit: string;
  visibility_multiplier: string;
  expired_history_days: string;
  sees_who_liked: boolean;
  can_incognito: boolean;
  can_hide_presence: boolean;
};

type FieldSpec = {
  key: keyof Draft;
  label: string;
  hint: string;
  /** Marked with a dot and blocks the step until it has a value. */
  required?: boolean;
  /** Blank is a legitimate answer meaning "no limit". */
  unlimited?: boolean;
  prefix?: string;
  /** Words, not a number. The input must not be type=number. */
  text?: boolean;
};

type Step = {
  title: string;
  blurb: string;
  fields?: FieldSpec[];
  gates?: { key: keyof Draft; label: string; hint: string }[];
};

const STEPS: Step[] = [
  {
    title: "Name it",
    blurb: "What members see on the pricing card.",
    fields: [
      {
        key: "label",
        label: "Tier name",
        hint: "Short. It is the heading on the card.",
        required: true,
      },
      {
        key: "tagline",
        label: "One line under it",
        hint: "Who this tier is for, in a sentence.",
      },
    ],
  },
  {
    title: "Price it",
    blurb: "What it costs and how long it lasts.",
    fields: [
      {
        key: "price",
        label: "Price",
        hint: "In rupees. What one purchase costs.",
        required: true,
        prefix: "₹",
      },
      {
        key: "days",
        label: "Length in days",
        hint: "How long a purchase lasts. 30 is a month.",
        required: true,
      },
      {
        key: "compare",
        label: "Compare at",
        hint: "Struck-through price, for a saving. Leave blank for none.",
        prefix: "₹",
      },
      {
        key: "product_id",
        label: "Store product id",
        hint: "From Play Console or App Store Connect, like premium_30d. Nothing can be charged without it. Leave blank until the product exists.",
        text: true,
      },
    ],
  },
  {
    title: "Allowances",
    blurb: "What somebody on this tier can do each day.",
    fields: [
      {
        key: "daily_interactions",
        label: "Interactions a day",
        hint: "Likes and comments share this. Blank means unlimited.",
        unlimited: true,
      },
      { key: "daily_comments", label: "Comments a day", hint: "Counts against interactions too.", required: true },
      /*
       * Zero is the ordinary answer here.
       *
       * Flares are a Rose purchase by default — the free allowance
       * exists so a tier can hand some out, not because every tier
       * should. A blank would read as "unlimited" like the
       * interactions field above, so this one is required and starts
       * at 0.
       */
      { key: "daily_flares", label: "Free Flares a day", hint: "0 means every Flare costs Roses.", required: true },
      { key: "flare_rose_cost", label: "Flare costs", hint: "Roses each, once the free ones are gone.", required: true },
      /*
       * Paths likes share the deck's budget.
       *
       * paths_settings.share_deck_budget is on, so this number is
       * ignored while that stays true — a Paths like spends an
       * interaction like any swipe. Left here because the setting can
       * be turned back off, at which point this governs again.
       */
      { key: "daily_paths_likes", label: "Paths Crossed likes", hint: "Ignored while Paths shares the swipe budget.", required: true },
      { key: "active_chat_limit", label: "Open chats", hint: "Conversations at once.", required: true },
      /*
       * No "Roses on signup" here.
       *
       * grant_signup_roses() reads that number from the free row, and
       * only the free row — everybody is on free when their profile
       * goes live, because nobody signs up having already paid. So on
       * any tier this wizard can edit, the field was a box that
       * accepted a number and changed nothing.
       *
       * Free's copy is real and still editable, on the Roses page under
       * "Signing up", which is where the rest of the rose economy lives.
       */
      { key: "visibility_multiplier", label: "Visibility boost", hint: "Multiplies deck position. Never the compatibility score.", required: true },
      { key: "expired_history_days", label: "Expired matches kept", hint: "Days an expired match can still be revived.", required: true },
    ],
  },
  {
    title: "Unlocks",
    blurb: "The three things this tier either gives or does not.",
    gates: [
      { key: "sees_who_liked", label: "Sees who liked them", hint: "The main thing people pay for." },
      { key: "can_incognito", label: "Private mode", hint: "Hides them from everyone. They can still look and still like, and liking someone shows them to that person. On every plan by default." },
      { key: "can_hide_presence", label: "Hide presence", hint: "Hides online status, read receipts and typing." },
    ],
  },
];

/**
 * How a step arrives and leaves.
 *
 * Variants rather than inline objects, because `custom` — the number
 * saying which way we are going — is only threaded through to variant
 * functions. Forward slides in from the right and out to the left;
 * going back does the reverse, so the motion matches the direction of
 * travel instead of always looking like progress.
 */
const SLIDE = {
  enter: (direction: number) => ({ opacity: 0, x: direction * 24 }),
  settled: { opacity: 1, x: 0 },
  leave: (direction: number) => ({ opacity: 0, x: direction * -24 }),
};

/**
 * Whether a step has everything it needs.
 *
 * A required field has to be non-empty, and anything numeric has to
 * actually be a number — "abc" in the price box is not a filled-in
 * price, and letting it through only moves the failure to the server.
 */
function stepComplete(step: Step, draft: Draft): boolean {
  for (const field of step.fields ?? []) {
    if (!field.required) continue;

    const value = String(draft[field.key] ?? "").trim();
    if (!value) return false;

    const words = field.text || field.key === "label" || field.key === "tagline";
    if (!words && !Number.isFinite(Number(value))) {
      return false;
    }
  }
  return true;
}

export function NewTierWizard({
  defaults,
  busy,
  mode = "create",
  planKey,
  onCancel,
  onCreate,
}: {
  /** Seeded from the free tier when creating, from the tier when editing. */
  defaults: Draft;
  busy: boolean;
  /**
   * Creating walks the steps in order; editing opens them all.
   *
   * The gating exists so a new tier cannot reach the database without a
   * price or a decided set of features. An existing tier already has
   * those, so making somebody click through four steps to change one
   * number is a wizard imposed on a form.
   */
  mode?: "create" | "edit";
  /** Editing only. Free hides price and length, which it cannot have. */
  planKey?: string;
  onCancel: () => void;
  onCreate: (body: Record<string, unknown>) => Promise<void>;
}) {
  const editing = mode === "edit";
  const free = planKey === "free";

  /*
   * Free has no price and no length.
   *
   * The API strips both for the free tier, so showing the boxes would
   * offer a change that is silently discarded. Hiding the whole step
   * keeps the progress bar honest about how much there is to do.
   */
  const steps = useMemo(
    () => (free ? STEPS.filter((entry) => entry.title !== "Price it") : STEPS),
    [free],
  );

  const [draft, setDraft] = useState<Draft>(defaults);
  const [step, setStep] = useState(0);
  /*
   * Which way the panels slide.
   *
   * Held in state rather than derived, because by the time the
   * animation runs the index has already changed and there is nothing
   * left to compare against.
   */
  const [direction, setDirection] = useState(1);

  useModalLock(true);

  const current = steps[step];
  const complete = useMemo(() => stepComplete(current, draft), [current, draft]);
  const last = step === steps.length - 1;

  /*
   * Every step has to be answerable before an edit can be saved.
   *
   * When creating, the Next button enforces this one step at a time. An
   * edit can jump straight to the last step and save, so the same rule
   * is checked across all of them — otherwise clearing the price on
   * step two and saving from step four writes a tier the constraint
   * then rejects with a message nobody can act on.
   */
  const allComplete = useMemo(
    () => steps.every((entry) => stepComplete(entry, draft)),
    [steps, draft],
  );

  const set = useCallback(
    (key: keyof Draft, value: string | boolean) =>
      setDraft((prev) => ({ ...prev, [key]: value })),
    [],
  );

  const go = useCallback((next: number) => {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }, [step]);

  const submit = useCallback(async () => {
    const num = (value: string) => (value.trim() === "" ? null : Number(value));

    await onCreate({
      label: draft.label.trim(),
      tagline: draft.tagline.trim(),
      /*
       * Free sends no price and no length.
       *
       * The API discards both for the free tier anyway, but sending
       * them means every free edit carries two fields that are silently
       * dropped — and the step that collects them is hidden, so the
       * values would be whatever the draft was seeded with.
       */
      ...(free
        ? {}
        : {
            // Rupees in, paise out. Typing 29900 for ₹299 is the mistake
            // that ships a tier at ₹29,900.
            price_minor:
              draft.price.trim() === "" ? null : Math.round(Number(draft.price) * 100),
            compare_minor:
              draft.compare.trim() === "" ? null : Math.round(Number(draft.compare) * 100),
            days: num(draft.days),
            // Empty means "no store product yet", which the API stores
            // as NULL — not as an empty string that would then be a
            // product id nothing in the store answers to.
            product_id: draft.product_id.trim(),
          }),
      daily_interactions: num(draft.daily_interactions),
      daily_comments: Number(draft.daily_comments),
      daily_flares: Number(draft.daily_flares),
      flare_rose_cost: Number(draft.flare_rose_cost),
      daily_paths_likes: Number(draft.daily_paths_likes),
      active_chat_limit: Number(draft.active_chat_limit),
      visibility_multiplier: Number(draft.visibility_multiplier),
      expired_history_days: Number(draft.expired_history_days),
      sees_who_liked: draft.sees_who_liked,
      can_incognito: draft.can_incognito,
      can_hide_presence: draft.can_hide_presence,
    });
  }, [draft, free, onCreate]);

  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-foreground/[0.12] p-4"
      // The backdrop cancels, matching Escape and the button. Nothing
      // has been written, so there is nothing to lose by leaving.
      onClick={onCancel}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        onClick={(event) => event.stopPropagation()}
        className="surface-float flex max-h-[86vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-foreground/[0.06] p-5">
          {/* Editing names the tier, because four steps deep it is the
              one thing the screen otherwise stops saying. */}
          <div className="min-w-0">
            <h2 className="truncate text-[1.05rem] font-bold">
              {editing ? defaults.label || "Edit tier" : current.title}
            </h2>
            <p className="text-[0.86rem] leading-relaxed text-muted-foreground">
              {current.blurb}
            </p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Cancel"
          >
            <X className="size-4" />
          </button>
        </div>

        {/*
          Progress as a row of bars.

          A step already passed stays filled and stays clickable, so
          going back to correct the price does not mean cancelling. A
          step ahead is not reachable, which is the whole point.
        */}
        <div className="flex gap-1.5 px-5 pt-4">
          {steps.map((entry, index) => (
            <button
              key={entry.title}
              type="button"
              // Editing, every step is reachable: the tier already has
              // answers, so this is a set of tabs rather than a gate.
              disabled={!editing && index > step}
              onClick={() => go(index)}
              className={`h-1 flex-1 rounded-full transition-colors ${
                index <= step || editing ? "bg-foreground" : "bg-foreground/10"
              } ${index !== step ? "cursor-pointer" : ""} ${
                editing && index !== step ? "opacity-40" : ""
              }`}
              aria-label={entry.title}
            />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              variants={SLIDE}
              initial="enter"
              animate="settled"
              exit="leave"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="space-y-5"
            >
              {current.fields?.map((field) => (
                <div key={String(field.key)} className="space-y-1.5">
                  <label
                    htmlFor={String(field.key)}
                    className="flex items-center gap-1 text-[0.86rem] font-medium"
                  >
                    {field.label}
                    {/* A dot, not an asterisk. It marks the field without
                        making the label read like a footnote. */}
                    {field.required && (
                      <span
                        className="size-1.5 rounded-full bg-destructive"
                        aria-label="required"
                      />
                    )}
                  </label>

                  <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
                    {field.hint}
                  </p>

                  <div className="relative">
                    {field.prefix && (
                      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[0.86rem] text-muted-foreground">
                        {field.prefix}
                      </span>
                    )}
                    <Input
                      id={String(field.key)}
                      value={String(draft[field.key] ?? "")}
                      onChange={(event) => set(field.key, event.target.value)}
                      placeholder={field.unlimited ? "Unlimited" : ""}
                      /* Name, tagline and the store id are words. */
                      type={
                        field.text || field.key === "label" || field.key === "tagline"
                          ? undefined
                          : "number"
                      }
                      min={0}
                      className={`h-11 ${field.prefix ? "pl-7" : "px-3"}`}
                    />
                  </div>
                </div>
              ))}

              {current.gates?.map((gate) => (
                <div
                  key={String(gate.key)}
                  className="flex items-start justify-between gap-4 border-t border-foreground/[0.06] pt-4 first:border-0 first:pt-0"
                >
                  <div className="min-w-0">
                    <div className="text-[0.86rem] font-medium">{gate.label}</div>
                    <p className="text-[0.8rem] leading-relaxed text-muted-foreground">
                      {gate.hint}
                    </p>
                  </div>
                  <Switch
                    checked={Boolean(draft[gate.key])}
                    onCheckedChange={(next) => set(gate.key, next)}
                  />
                </div>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2 border-t border-foreground/[0.06] p-4">
          <Button
            variant="outline"
            onClick={() => (step === 0 ? onCancel() : go(step - 1))}
            className="h-10 text-[0.86rem]"
          >
            {step === 0 ? "Cancel" : "Back"}
          </Button>

          <div className="flex-1 text-center text-[0.8rem] text-muted-foreground">
            {current.title} · {step + 1} of {steps.length}
          </div>

          {/*
            Editing can save from anywhere; creating saves at the end.

            Somebody who opened a tier to change its price should not
            have to walk to step four to keep the change.
          */}
          {editing ? (
            <div className="flex items-center gap-2">
              {!last && (
                <Button
                  variant="outline"
                  onClick={() => go(step + 1)}
                  className="h-10 text-[0.86rem]"
                >
                  Next
                </Button>
              )}
              <Button
                onClick={submit}
                disabled={busy || !allComplete}
                className="h-10 text-[0.86rem]"
              >
                <Check className="mr-1.5 size-3.5" />
                {busy ? "Saving" : "Save"}
              </Button>
            </div>
          ) : last ? (
            <Button onClick={submit} disabled={busy || !complete} className="h-10 text-[0.86rem]">
              <Check className="mr-1.5 size-3.5" />
              {busy ? "Creating" : "Create tier"}
            </Button>
          ) : (
            <Button
              onClick={() => go(step + 1)}
              // Disabled until this step is answerable. The alternative
              // is a tier created with an empty price that then fails a
              // constraint nobody can see.
              disabled={!complete}
              className="h-10 text-[0.86rem]"
            >
              Next
            </Button>
          )}
        </div>

        {/*
          Said once, at the end, because it changes what somebody does
          next: a new tier is not on sale until it is switched on.
        */}
        {last && !editing && (
          <p className="border-t border-foreground/[0.06] px-4 py-3 text-[0.8rem] text-muted-foreground">
            It is created switched off. Turn it on from its card when you are
            happy with it.
          </p>
        )}

        {/* Editing: say why Save is refusing, rather than leaving a
            greyed-out button with no explanation on a step that looks
            perfectly filled in. */}
        {editing && !allComplete && (
          <p className="border-t border-foreground/[0.06] px-4 py-3 text-[0.8rem] text-muted-foreground">
            Something on another step is empty. Check each one before saving.
          </p>
        )}
      </motion.div>
    </div>,
    document.body,
  );
}
