/*
 * Give everybody back their invite code.
 *
 * 045 generated a referral code the first time somebody opened the
 * Invite friends screen:
 *
 *     SELECT referral_code INTO v_code FROM profiles WHERE user_id = v_me;
 *     IF v_code IS NULL THEN
 *       v_code := generate_referral_code();
 *       UPDATE profiles SET referral_code = v_code WHERE user_id = v_me;
 *     END IF;
 *
 * 077 rewrote my_referrals() for the new per-side rewards and, in doing
 * so, dropped that block and marked the function STABLE. A STABLE
 * function cannot write, so even restoring the block without changing
 * the volatility would have failed at runtime.
 *
 * The result: the function only ever *reads* referral_code, and nothing
 * anywhere creates one. Of 203 profiles, 3 hold a code — the ones that
 * opened the screen before 077 — and 200 do not. Every one of those 200
 * sees "— — — — —" where their code should be, cannot copy it, cannot
 * share it, and cannot be credited for an invite. The whole referral
 * feature has been dead for them since 077 shipped.
 *
 * This restores generation and backfills the accounts that missed out.
 *
 * Idempotent. Safe to re-run.
 */

-- ─────────────────────────────────────────────────────────────────────
-- 1. Backfill everybody who should already have one.
-- ─────────────────────────────────────────────────────────────────────

/*
 * One at a time, because generate_referral_code() re-rolls on collision
 * and the column is UNIQUE — a set-based UPDATE calling it once per row
 * would be fine, but a loop makes the retry behaviour obvious and this
 * runs over a few hundred rows, once.
 */
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT user_id FROM profiles WHERE referral_code IS NULL LOOP
    UPDATE profiles
       SET referral_code = generate_referral_code()
     WHERE user_id = r.user_id;
  END LOOP;
END $$;


-- ─────────────────────────────────────────────────────────────────────
-- 2. Generate on first look again, for accounts made from now on.
-- ─────────────────────────────────────────────────────────────────────

/*
 * Verbatim from 077 apart from two things: the volatility, and the
 * block that makes a code when there is not one.
 *
 * VOLATILE rather than STABLE, because this function writes. That is
 * what 077 could not do and why the generation could not simply be
 * pasted back.
 *
 * Generated on first look rather than at signup, which is 045's
 * reasoning and still right: nobody who never opens this screen needs
 * to be holding a code.
 */
CREATE OR REPLACE FUNCTION my_referrals()
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me   UUID := auth.uid();
  v_code TEXT;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('code', NULL, 'invited', 0, 'milestones', '[]'::JSONB);
  END IF;

  SELECT referral_code INTO v_code FROM profiles WHERE user_id = v_me;

  IF v_code IS NULL THEN
    v_code := generate_referral_code();
    UPDATE profiles SET referral_code = v_code WHERE user_id = v_me;
  END IF;

  RETURN jsonb_build_object(
    'code', v_code,

    'invited', (SELECT COUNT(*) FROM profiles WHERE referred_by = v_me),

    -- Roses earned from invites, which is the number the screen has
    -- always shown.
    'earned', COALESCE((
      SELECT SUM(amount) FROM rose_ledger
      WHERE user_id = v_me AND reason = 'referral' AND amount > 0
    ), 0),

    -- Whether they were themselves invited, so the screen knows not to
    -- offer the code box to somebody who has already used one.
    'was_invited', (SELECT referred_by IS NOT NULL FROM profiles WHERE user_id = v_me),

    'milestones', COALESCE((
      SELECT jsonb_agg(row_to_json(m) ORDER BY m.sort_order)
      FROM (
        SELECT
          s.key,
          s.label,
          s.invitee_label,
          s.sort_order,
          -- Already paid for at least one invitee.
          EXISTS (
            SELECT 1 FROM referral_awards
            WHERE referrer_id = v_me AND milestone = s.key
          ) AS reached,
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'side', r.side,
              'kind', r.kind,
              'text', referral_reward_text(r)
            ) ORDER BY r.side, r.sort_order)
            FROM referral_rewards r
            WHERE r.milestone = s.key AND r.active
          ), '[]'::JSONB) AS rewards
        FROM referral_milestones s
        WHERE s.active
      ) m
    ), '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION my_referrals() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- Receipt.
-- ─────────────────────────────────────────────────────────────────────

SELECT
  (SELECT count(*) FROM profiles WHERE referral_code IS NOT NULL) AS have_a_code,
  (SELECT count(*) FROM profiles WHERE referral_code IS NULL)     AS still_missing,
  (SELECT count(DISTINCT referral_code) FROM profiles WHERE referral_code IS NOT NULL)
    AS distinct_codes,
  -- my_referrals must be able to write again, or it cannot generate.
  (SELECT p.provolatile = 'v'
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'my_referrals') AS can_generate;
