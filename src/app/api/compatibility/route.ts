import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

/**
 * The compatibility engine, from the outside.
 *
 * Two things an admin needs and cannot get from the app: which questions
 * people actually answer, and how the scores are distributed. A questionnaire
 * where question 22 is answered by 4% of people is a question phrased badly,
 * and a score distribution bunched at 90% means the weights are too generous
 * to distinguish anyone.
 *
 * Individual answers are never returned. They are private, and an admin
 * reading them would learn what one named person said about jealousy or
 * money — which is not moderation, it is surveillance.
 */

type DimensionRow = {
  key: string;
  label: string;
  question: string;
  kind: string;
  section: string;
  sort: number;
  quick_start: boolean;
  active: boolean;
};

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const { supabase } = auth;

    const [dimensionRes, answerRes, scoreRes, poolRes, stateRes] = await Promise.all([
      supabase.from("compat_dimensions").select("*").order("sort"),
      // Keys and importances only — never the answers themselves.
      supabase.from("compat_answers").select("key, importance, user_id").limit(20000),
      supabase.from("compat_scores").select("score, blocked").limit(20000),
      supabase.from("discovery_pools").select("user_id, ranked_at, blocked").limit(50000),
      supabase.from("discovery_pool_state").select("user_id, refreshed_at").limit(20000),
    ]);

    if (dimensionRes.error) throw dimensionRes.error;

    const dimensions = (dimensionRes.data ?? []) as DimensionRow[];
    const answers = (answerRes.data ?? []) as {
      key: string;
      importance: string;
      user_id: string;
    }[];
    const scores = (scoreRes.data ?? []) as { score: number; blocked: boolean }[];

    const answered = new Map<string, number>();
    const mustCount = new Map<string, number>();

    for (const row of answers) {
      answered.set(row.key, (answered.get(row.key) ?? 0) + 1);
      if (row.importance === "must") {
        mustCount.set(row.key, (mustCount.get(row.key) ?? 0) + 1);
      }
    }

    const people = new Set(answers.map((row) => row.user_id)).size;

    // Ten-point buckets. Finer than that reads as precision the score does
    // not have.
    const buckets = Array.from({ length: 10 }, (_, index) => ({
      from: index * 10,
      to: index * 10 + 9,
      count: 0,
    }));

    for (const row of scores) {
      const index = Math.min(9, Math.floor(row.score / 10));
      buckets[index].count += 1;
    }

    /*
     * Pool health.
     *
     * Two numbers say whether the pipeline is working. A high unranked
     * share means ranking is not keeping up with pool growth — the deck
     * will be showing cards with no score. Pools that have not refreshed
     * in days belong to people who stopped opening the app, which is
     * churn rather than a bug, but worth being able to see.
     */
    const pools = (poolRes.data ?? []) as { ranked_at: string | null; blocked: boolean }[];
    const states = (stateRes.data ?? []) as { refreshed_at: string }[];
    const dayAgo = Date.now() - 86_400_000;

    return NextResponse.json({
      people,
      pairs: scores.length,
      blocked: scores.filter((row) => row.blocked).length,
      pool: {
        rows: pools.length,
        unranked: pools.filter((row) => row.ranked_at === null).length,
        blocked: pools.filter((row) => row.blocked).length,
        withPools: states.length,
        refreshedToday: states.filter(
          (row) => new Date(row.refreshed_at).getTime() > dayAgo,
        ).length,
      },
      median: scores.length
        ? [...scores].sort((a, b) => a.score - b.score)[Math.floor(scores.length / 2)].score
        : null,
      buckets,
      dimensions: dimensions.map((row) => ({
        ...row,
        answered: answered.get(row.key) ?? 0,
        must: mustCount.get(row.key) ?? 0,
        // The number that says whether a question is working: of everyone
        // who has answered anything, how many answered this one.
        rate: people > 0 ? Math.round(((answered.get(row.key) ?? 0) / people) * 100) : 0,
      })),
    });
  } catch (error) {
    return failed(error, "Failed to load compatibility data.");
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as {
      key?: string;
      active?: boolean;
      quick_start?: boolean;
    };

    if (!body.key) {
      return NextResponse.json({ error: "A dimension key is required." }, { status: 400 });
    }

    const update: Record<string, boolean> = {};
    if (typeof body.active === "boolean") update.active = body.active;
    if (typeof body.quick_start === "boolean") update.quick_start = body.quick_start;

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from("compat_dimensions")
      .update(update)
      .eq("key", body.key);

    if (error) throw error;

    /*
     * Every cached score is now wrong.
     *
     * Turning a dimension off changes the denominator for every pair that
     * had answered it, so leaving the cache in place would show scores
     * computed against a questionnaire that no longer exists. They are
     * recomputed on demand, so clearing costs nothing but the first read.
     */
    if (typeof body.active === "boolean") {
      await auth.supabase.from("compat_scores").delete().gte("score", 0);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return failed(error, "Failed to update that dimension.");
  }
}
