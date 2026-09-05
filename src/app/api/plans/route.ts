import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Tiers: what each one costs, and what it entitles you to.
 *
 * A tier used to be one of exactly two rows, free and premium, and this
 * route only knew how to update them. Now any number can exist — each
 * with its own price, length and entitlements — so this creates,
 * updates and retires them.
 *
 * ── Two things it refuses to do ────────────────────────────
 *
 * Free is not deletable and not sellable. Every gate check falls back
 * to it, so a database without a free row has no answer for a
 * signed-out member.
 *
 * A tier somebody has bought is never hard-deleted, only retired. The
 * profiles.plan_key referencing it would be nulled by the cascade, and
 * that member would silently drop to free mid-subscription.
 *
 * ── What it still cannot touch ─────────────────────────────
 *
 * Compatibility. A tier can buy allowances and visibility; it can never
 * move the percentage on a card. That separation is the product
 * promise, and it is kept by there being no such column to write.
 */

/** Every numeric entitlement, with the range it is allowed to take. */
const NUMERIC_LIMITS: Record<string, { min: number; max: number }> = {
  daily_comments: { min: 0, max: 500 },
  daily_super_likes: { min: 0, max: 100 },
  visibility_multiplier: { min: 1, max: 5 },

  // How many conversations can be open at once. The constraint is the
  // product — an inbox of forty half-conversations is how a dating app
  // becomes a chore — so this is a lever, not a cap to raise freely.
  active_chat_limit: { min: 1, max: 100 },

  // super_like_rose_cost is a price rather than an allowance: what a
  // Super Like costs out of the wallet once the free ones are gone.
  super_like_rose_cost: { min: 0, max: 100 },
  signup_roses: { min: 0, max: 1000 },
  daily_paths_likes: { min: 0, max: 200 },
};

/** The four things a tier either unlocks or does not. */
const GATES = [
  "sees_who_liked",
  "can_hide_presence",
  "can_incognito",
  "can_travel",
] as const;

/** Free text and flags that describe the tier rather than entitle it. */
const PRESENTATION = ["label", "tagline"] as const;

/** Price fields, in paise. */
const MONEY = ["price_minor", "compare_minor"] as const;

/**
 * Turn a request body into a validated column patch.
 *
 * Shared by create and update so a tier cannot be created with values
 * an update would reject — which is how a plan ends up existing in a
 * state the editor then refuses to save.
 */
function buildUpdate(
  body: Record<string, unknown>,
): { update: Record<string, unknown> } | { error: string } {
  const update: Record<string, unknown> = {};

  for (const [field, limits] of Object.entries(NUMERIC_LIMITS)) {
    if (!(field in body)) continue;

    const value = Number(body[field]);
    if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
      return { error: `${field} must be between ${limits.min} and ${limits.max}.` };
    }

    update[field] =
      field === "visibility_multiplier" ? Number(value.toFixed(2)) : Math.round(value);
  }

  for (const gate of GATES) {
    if (typeof body[gate] === "boolean") update[gate] = body[gate];
  }

  for (const field of PRESENTATION) {
    if (typeof body[field] === "string") {
      const text = (body[field] as string).trim();
      if (field === "label" && text.length < 2) {
        return { error: "A tier needs a name." };
      }
      update[field] = text;
    }
  }

  for (const field of MONEY) {
    if (!(field in body)) continue;

    const raw = body[field];
    if (raw === null || raw === "") {
      update[field] = null;
      continue;
    }

    const value = Number(raw);
    // Ten lakh rupees is not a price, it is a typo with a bill attached.
    if (!Number.isFinite(value) || value < 0 || value > 100_000_000) {
      return { error: `${field} is out of range.` };
    }
    update[field] = Math.round(value);
  }

  if ("days" in body) {
    const raw = body.days;
    if (raw === null || raw === "") {
      update.days = null;
    } else {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 1 || value > 3650) {
        return { error: "Length must be between 1 and 3650 days." };
      }
      update.days = Math.round(value);
    }
  }

  if (typeof body.featured === "boolean") update.featured = body.featured;
  if (typeof body.active === "boolean") update.active = body.active;

  if ("sort_order" in body) {
    const value = Number(body.sort_order);
    if (Number.isFinite(value)) update.sort_order = Math.round(value);
  }

  if ("product_id" in body) {
    update.product_id =
      typeof body.product_id === "string" && body.product_id.trim()
        ? body.product_id.trim()
        : null;
  }

  /*
   * daily_interactions accepts null, which is what makes a tier
   * unlimited. Handled apart from the numeric limits because "absent"
   * and "explicitly null" mean different things and Number(null) is 0
   * — which would silently give a paying member zero likes a day.
   */
  if ("daily_interactions" in body) {
    const raw = body.daily_interactions;

    if (raw === null || raw === "") {
      update.daily_interactions = null;
    } else {
      const value = Number(raw);
      if (!Number.isFinite(value) || value < 1 || value > 1000) {
        return { error: "Daily interactions must be between 1 and 1000, or unlimited." };
      }
      update.daily_interactions = Math.round(value);
    }
  }

  /*
   * How long an expired match stays revivable. Apart from the rest
   * because the column is a Postgres interval and takes '30 days',
   * not 30.
   */
  if ("expired_history_days" in body) {
    const days = Number(body.expired_history_days);

    if (!Number.isFinite(days) || days < 1 || days > 365) {
      return { error: "Expired history must be between 1 and 365 days." };
    }

    update.expired_history = `${Math.round(days)} days`;
  }

  return { update };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [planRes, countRes] = await Promise.all([
      auth.supabase.from("plans").select("*").order("sort_order").order("key"),
      auth.supabase
        .from("profiles")
        .select("premium_until, plan_key")
        .not("premium_until", "is", null)
        .limit(20000),
    ]);

    if (planRes.error) throw planRes.error;

    const now = Date.now();
    const subs = (countRes.data ?? []) as {
      premium_until: string;
      plan_key: string | null;
    }[];

    const live = subs.filter((row) => new Date(row.premium_until).getTime() > now);

    // Per tier, so retiring one shows how many people it would affect.
    const byPlan: Record<string, number> = {};
    for (const row of live) {
      const key = row.plan_key ?? "premium";
      byPlan[key] = (byPlan[key] ?? 0) + 1;
    }

    return NextResponse.json({
      plans: planRes.data ?? [],
      // Active and lapsed are different numbers and mean different
      // things: one is revenue, the other is churn.
      activePremium: live.length,
      lapsedPremium: subs.length - live.length,
      membersByPlan: byPlan,
    });
  } catch (error) {
    return failed(error, "Failed to load plans.");
  }
}

/**
 * Create a tier.
 *
 * The key is derived from the name rather than typed. It ends up in
 * receipts and in every profile row that buys it, so it must be stable
 * and URL-safe — and a human typing one is a human eventually typing
 * "Pro " with a trailing space.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const label = typeof body.label === "string" ? body.label.trim() : "";
    if (label.length < 2) {
      return NextResponse.json({ error: "A tier needs a name." }, { status: 400 });
    }

    const key = label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 32);

    if (!key) {
      return NextResponse.json(
        { error: "That name has no letters or numbers in it." },
        { status: 400 },
      );
    }

    if (key === "free") {
      return NextResponse.json(
        { error: "There is already a free tier." },
        { status: 400 },
      );
    }

    const built = buildUpdate(body);
    if ("error" in built) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }

    /*
     * A new tier starts inactive whatever was sent.
     *
     * The form collects a price and entitlements, so the row is not
     * empty — but switching a tier on is what puts it in front of
     * paying members, and that should be a separate, deliberate act
     * once somebody has looked at the card.
     *
     * Entitlements not sent fall back to the free tier's rather than
     * to Postgres defaults, because a tier somebody is charged for
     * should never start out worse than free.
     */
    const { data: freeRow } = await auth.supabase
      .from("plans")
      .select(
        "daily_interactions, daily_comments, daily_super_likes, daily_paths_likes," +
          " active_chat_limit, super_like_rose_cost, signup_roses," +
          " visibility_multiplier, expired_history",
      )
      .eq("key", "free")
      .single();

    // Cast because the select returns a narrowed row type the spread
    // cannot see through; the columns are named literally above.
    const defaults = (freeRow ?? {}) as Record<string, unknown>;

    const { error } = await auth.supabase.from("plans").insert({
      ...defaults,
      key,
      label,
      active: false,
      ...built.update,
    });

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A tier with that name already exists." },
          { status: 400 },
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true, key });
  } catch (error) {
    return failed(error, "Failed to create that tier.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown> & { key?: string };

    if (!body.key || typeof body.key !== "string") {
      return NextResponse.json({ error: "Which tier?" }, { status: 400 });
    }

    const built = buildUpdate(body);
    if ("error" in built) {
      return NextResponse.json({ error: built.error }, { status: 400 });
    }

    const { update } = built;

    /*
     * Free stays free and stays available.
     *
     * Every gate falls back to it, so a priced or retired free tier
     * would leave signed-out members with no plan at all.
     */
    if (body.key === "free") {
      delete update.price_minor;
      delete update.compare_minor;
      delete update.days;
      delete update.active;
      delete update.featured;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    /*
     * One featured tier at a time.
     *
     * Two highlighted cards is no highlight, and the app draws the
     * featured one differently — so this is cleared elsewhere before
     * being set here rather than left to whoever edits last.
     */
    if (update.featured === true) {
      await auth.supabase
        .from("plans")
        .update({ featured: false })
        .neq("key", body.key);
    }

    const { error } = await auth.supabase
      .from("plans")
      .update(update)
      .eq("key", body.key);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update that tier.");
  }
}

/**
 * Retire or remove a tier.
 *
 * Anything with members on it is retired rather than deleted: the
 * foreign key would null their plan_key and drop them to free
 * mid-subscription, which is taking away something they paid for.
 */
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const key = new URL(request.url).searchParams.get("key");

    if (!key) {
      return NextResponse.json({ error: "Which tier?" }, { status: 400 });
    }

    if (key === "free") {
      return NextResponse.json(
        { error: "The free tier cannot be removed — every check falls back to it." },
        { status: 400 },
      );
    }

    const { count } = await auth.supabase
      .from("profiles")
      .select("user_id", { count: "exact", head: true })
      .eq("plan_key", key)
      .gt("premium_until", new Date().toISOString());

    if ((count ?? 0) > 0) {
      const { error } = await auth.supabase
        .from("plans")
        .update({ active: false, featured: false })
        .eq("key", key);

      if (error) throw error;

      return NextResponse.json({
        ok: true,
        retired: true,
        members: count,
      });
    }

    const { error } = await auth.supabase.from("plans").delete().eq("key", key);
    if (error) throw error;

    return NextResponse.json({ ok: true, retired: false });
  } catch (error) {
    return failed(error, "Failed to remove that tier.");
  }
}
