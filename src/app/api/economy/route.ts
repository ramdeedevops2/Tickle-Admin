import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * Packs, promotions, Premium plans and offers.
 *
 * Everything here is a price or a length, and both get changed often by
 * people who do not deploy. That is the whole reason these are rows.
 *
 * Two guards worth keeping in mind while reading:
 *
 *   Nothing on this route grants anything. Crediting happens in
 *   credit_purchase and credit_premium, which are service-role only and
 *   run after a store receipt is verified.
 *
 *   A campaign without a redemption cap is an open-ended cost, and the
 *   person who created it is not the one who will notice.
 */

const PACK_LIMITS: Record<string, { min: number; max: number }> = {
  amount: { min: 1, max: 100000 },
  bonus: { min: 0, max: 100000 },
  price_minor: { min: 0, max: 10000000 },
  premium_bonus: { min: 0, max: 100000 },
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const [packs, promos, plans, offers, ledger] = await Promise.all([
      auth.supabase.from("rose_packs").select("*").order("sort_order"),
      auth.supabase.from("rose_promotions").select("*").order("created_at", { ascending: false }),
      auth.supabase.from("premium_plans").select("*").order("sort_order"),
      auth.supabase.from("premium_offers").select("*").order("created_at", { ascending: false }),
      // Amount and reason only — never who, and never a balance.
      auth.supabase.from("rose_ledger").select("amount, reason").limit(50000),
    ]);

    if (packs.error) throw packs.error;

    const rows = (ledger.data ?? []) as { amount: number; reason: string }[];

    /*
     * Purchased against everything else.
     *
     * The ratio is the number that matters: a currency where almost
     * nothing is bought is one people are earning faster than they can
     * spend, and the prices are wrong somewhere.
     */
    const purchased = rows
      .filter((row) => row.reason === "purchase")
      .reduce((sum, row) => sum + row.amount, 0);

    const granted = rows
      .filter((row) => row.amount > 0 && row.reason !== "purchase")
      .reduce((sum, row) => sum + row.amount, 0);

    const spent = rows
      .filter((row) => row.amount < 0)
      .reduce((sum, row) => sum + Math.abs(row.amount), 0);

    return NextResponse.json({
      packs: packs.data ?? [],
      promotions: promos.data ?? [],
      premiumPlans: plans.data ?? [],
      premiumOffers: offers.data ?? [],
      economy: { purchased, granted, spent },
    });
  } catch (error) {
    return failed(error, "Failed to load the economy.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;
    const id = String(body.id ?? "");
    const entity = String(body.entity ?? "");

    if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

    const table = {
      pack: "rose_packs",
      promotion: "rose_promotions",
      plan: "premium_plans",
      offer: "premium_offers",
    }[entity];

    if (!table) return NextResponse.json({ error: "Unknown entity." }, { status: 400 });

    const update: Record<string, unknown> = {};

    if (typeof body.active === "boolean") update.active = body.active;

    if (entity === "pack") {
      for (const [field, limits] of Object.entries(PACK_LIMITS)) {
        if (!(field in body)) continue;

        const value = Number(body[field]);
        if (!Number.isFinite(value) || value < limits.min || value > limits.max) {
          return NextResponse.json(
            { error: `${field} must be between ${limits.min} and ${limits.max}.` },
            { status: 400 },
          );
        }

        update[field] = Math.round(value);
      }

      if (typeof body.product_id === "string") {
        // Nothing can be charged without one, so a pack with no product
        // id is a draft however it looks in the list.
        update.product_id = body.product_id.trim() || null;
      }
    }

    if (entity === "plan") {
      for (const field of ["price_minor", "compare_minor", "days"]) {
        if (!(field in body)) continue;

        const value = Number(body[field]);
        if (!Number.isFinite(value) || value < 0) {
          return NextResponse.json({ error: `${field} is out of range.` }, { status: 400 });
        }

        update[field] = Math.round(value);
      }

      if (typeof body.product_id === "string") {
        update.product_id = body.product_id.trim() || null;
      }
    }

    if (entity === "offer" || entity === "promotion") {
      if ("value" in body) {
        const value = Number(body.value);
        if (!Number.isFinite(value) || value < 1 || value > 10000) {
          return NextResponse.json({ error: "Value is out of range." }, { status: 400 });
        }
        update.value = Math.round(value);
      }

      if ("max_redemptions" in body) {
        const max = body.max_redemptions;
        update.max_redemptions = max === null || max === "" ? null : Math.round(Number(max));
      }

      if ("ends_at" in body) {
        update.ends_at = body.ends_at || null;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase.from(table).update(update).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update.");
  }
}

/** New promotions and offers. Packs and plans are seeded, not created here. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as Record<string, unknown>;

    const key = String(body.key ?? "").trim();
    const label = String(body.label ?? "").trim();
    const kind = String(body.kind ?? "");
    const value = Number(body.value ?? 0);

    if (!key || !label) {
      return NextResponse.json({ error: "A key and a label are required." }, { status: 400 });
    }

    if (!Number.isFinite(value) || value < 1 || value > 10000) {
      return NextResponse.json({ error: "Value must be between 1 and 10000." }, { status: 400 });
    }

    const days = body.days == null ? null : Number(body.days);
    const endsAt =
      days && Number.isFinite(days)
        ? new Date(Date.now() + days * 86_400_000).toISOString()
        : null;

    const max = body.max_redemptions == null ? null : Math.round(Number(body.max_redemptions));

    if (body.entity === "promotion") {
      const KINDS = ["first_purchase", "bonus_percent", "bonus_flat", "premium_bonus", "referral"];

      if (!KINDS.includes(kind)) {
        return NextResponse.json({ error: "Unknown promotion kind." }, { status: 400 });
      }

      const { data, error } = await auth.supabase
        .from("rose_promotions")
        .insert({
          key,
          label,
          body: String(body.body ?? "").trim() || null,
          kind,
          value: Math.round(value),
          pack_key: String(body.pack_key ?? "").trim() || null,
          ends_at: endsAt,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "That key already exists." }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({ row: data });
    }

    if (body.entity === "offer") {
      if (!["trial", "discount", "referral"].includes(kind)) {
        return NextResponse.json({ error: "Unknown offer kind." }, { status: 400 });
      }

      const { data, error } = await auth.supabase
        .from("premium_offers")
        .insert({
          key,
          label,
          body: String(body.body ?? "").trim() || null,
          kind,
          value: Math.round(value),
          plan_key: String(body.plan_key ?? "").trim() || null,
          max_redemptions: max,
          ends_at: endsAt,
        })
        .select()
        .single();

      if (error) {
        if (error.code === "23505") {
          return NextResponse.json({ error: "That key already exists." }, { status: 409 });
        }
        throw error;
      }

      return NextResponse.json({ row: data });
    }

    return NextResponse.json({ error: "Unknown entity." }, { status: 400 });
  } catch (error) {
    return failed(error, "Failed to create.");
  }
}
