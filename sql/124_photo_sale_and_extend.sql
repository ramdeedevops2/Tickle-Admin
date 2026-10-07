/*
 * Making four settings real.
 *
 * An audit of the admin's Roses → Prices tab found four numbers that
 * could be edited and could never take effect:
 *
 *   save_price_min, save_price_max, save_sender_share
 *     Enforced correctly by save_message(), but no screen ever set a
 *     price on a photo, so save_price was always NULL and the "Save"
 *     action never appeared. Three numbers tuning nothing.
 *
 *   extend_rose_cost
 *     Someone had set it to 11 — deliberately, since the default is 5 —
 *     but nothing in the app called extend_heart(), so nobody could
 *     ever pay it.
 *
 * Both backends were already written and correct. What was missing was
 * the way in. This migration adds what the server side still needs:
 *
 *   1. A switch for photo selling, so the feature can ship built but
 *      off and be turned on later from the admin without a release.
 *   2. send_message() refusing a price while that switch is off, so the
 *      gate holds even if a client is stale or someone calls the RPC
 *      directly.
 *   3. media_sale_terms(), so the composer can ask once for the range,
 *      the share, and whether to offer pricing at all.
 *   4. my_hearts(), which returns extended_count and the live extend
 *      price, so the app can show an Extend button that knows whether
 *      there are any extensions left and what the next one costs.
 *
 * Idempotent. Safe to re-run.
 */

-- ─────────────────────────────────────────────────────────────────────
-- 1. The switch.
-- ─────────────────────────────────────────────────────────────────────

/*
 * Off by default, which is the whole point: the feature is being built
 * now and turned on later. A fresh database and the live one therefore
 * agree, and nobody can be charged for a photo until somebody chooses
 * that deliberately.
 */
ALTER TABLE fairness_settings
  ADD COLUMN IF NOT EXISTS paid_media_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN fairness_settings.paid_media_enabled IS
  'Whether a sender may put a rose price on a photo. Off until the '
  'feature is launched; save_price_min/max and save_sender_share only '
  'mean anything while this is true.';


-- ─────────────────────────────────────────────────────────────────────
-- 2. send_message() honours the switch.
-- ─────────────────────────────────────────────────────────────────────

/*
 * Verbatim from 033 apart from the pricing guard.
 *
 * Everything else — the parameter order, the pending/open state check,
 * the block check, the retention fallback, the glimpse_ms CASE, the
 * expires_at in the return — is reproduced exactly, because this is a
 * REPLACE of a function the whole chat depends on and a detail
 * remembered loosely would be a silent regression.
 *
 * The rule the guard already had — drop a price that is out of range
 * rather than clamp it, because the sender meant something specific —
 * now also drops any price at all while the feature is off. Dropping
 * rather than failing keeps a stale client working: the photo still
 * sends, it just sends free, which is what the switch says it should be.
 */
CREATE OR REPLACE FUNCTION send_message(
  p_match_id    UUID,
  p_kind        TEXT DEFAULT 'text',
  p_content     TEXT DEFAULT NULL,
  p_media_path  TEXT DEFAULT NULL,
  p_media_mime  TEXT DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL,
  p_retention   TEXT DEFAULT NULL,
  p_glimpse_ms  INTEGER DEFAULT NULL,
  p_save_price  INTEGER DEFAULT NULL,
  p_reply_to    UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me       UUID := auth.uid();
  v_match    matches%ROWTYPE;
  v_other    UUID;
  v_settings fairness_settings%ROWTYPE;
  v_option   retention_options%ROWTYPE;
  v_expires  TIMESTAMPTZ;
  v_budget   INTEGER;
  v_id       UUID;
BEGIN
  IF v_me IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated');
  END IF;

  SELECT * INTO v_match FROM matches WHERE id = p_match_id;

  IF NOT FOUND OR (v_match.user1_id <> v_me AND v_match.user2_id <> v_me) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Closed, expired and unmatched conversations take no new messages.
  -- Pending does, and sending is what opens it.
  IF v_match.state NOT IN ('pending', 'open') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_active', 'state', v_match.state);
  END IF;

  v_other := CASE WHEN v_match.user1_id = v_me THEN v_match.user2_id ELSE v_match.user1_id END;

  IF is_blocked(v_me, v_other) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable');
  END IF;

  SELECT * INTO v_settings FROM fairness_settings WHERE id = 1;

  SELECT * INTO v_option
  FROM retention_options
  WHERE key = COALESCE(p_retention, v_settings.default_retention) AND active;

  -- An unrecognised key falls back to the default rather than to
  -- permanence: the safe direction for a disappearing message is gone.
  IF NOT FOUND THEN
    SELECT * INTO v_option FROM retention_options
    WHERE key = v_settings.default_retention AND active;
  END IF;

  IF v_option.duration IS NOT NULL THEN
    v_expires := NOW() + v_option.duration;
    v_budget := NULL;
  ELSE
    v_expires := NULL;
    v_budget := v_option.view_budget;
  END IF;

  -- Saving is only offered on media, only while the feature is switched
  -- on, and only inside the configured range. A price outside it is
  -- dropped rather than clamped: the sender meant something specific and
  -- a silently different number is worse.
  IF p_save_price IS NOT NULL AND (
       NOT COALESCE(v_settings.paid_media_enabled, false)
       OR p_kind = 'text'
       OR p_save_price < v_settings.save_price_min
       OR p_save_price > v_settings.save_price_max
     ) THEN
    p_save_price := NULL;
  END IF;

  INSERT INTO messages (
    match_id, sender_id, content, kind,
    media_path, media_mime, duration_ms,
    expires_at, view_budget, glimpse_ms, save_price, reply_to
  )
  VALUES (
    p_match_id, v_me, COALESCE(p_content, ''), p_kind::message_kind,
    p_media_path, p_media_mime, p_duration_ms,
    v_expires, v_budget,
    CASE WHEN p_kind = 'glimpse' THEN p_glimpse_ms END,
    p_save_price, p_reply_to
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'expires_at', v_expires);
END;
$$;

GRANT EXECUTE ON FUNCTION send_message(
  UUID, TEXT, TEXT, TEXT, TEXT, INTEGER, TEXT, INTEGER, INTEGER, UUID
) TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 3. What the sender needs to know before pricing a photo.
-- ─────────────────────────────────────────────────────────────────────

/*
 * The range and the share in one read, plus whether the feature is on
 * at all.
 *
 * The client needs all four together — it cannot offer a price field
 * without bounds, and it should not offer one at all while the switch
 * is off. Returning them as one row means the composer asks once rather
 * than reading a settings table it otherwise has no business in.
 */
CREATE OR REPLACE FUNCTION media_sale_terms()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT jsonb_build_object(
    'enabled',      COALESCE(paid_media_enabled, false),
    'min',          save_price_min,
    'max',          save_price_max,
    'sender_share', save_sender_share
  )
  FROM fairness_settings
  WHERE id = 1;
$$;

GRANT EXECUTE ON FUNCTION media_sale_terms() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 4. Your own hearts, with what it would cost to keep one alive.
-- ─────────────────────────────────────────────────────────────────────

/*
 * The app read hearts directly with a PostgREST select, which could not
 * answer the two questions an Extend button has to ask: how many
 * extensions this heart has left, and what the next one costs.
 *
 * Both live in heart_settings, which the client has no reason to read
 * wholesale. So the server answers per heart.
 *
 * can_extend is the single thing the button should test. It already
 * accounts for the cap, so the client never has to re-derive the rule
 * and drift from extend_heart()'s own check.
 */
CREATE OR REPLACE FUNCTION my_hearts()
RETURNS TABLE (
  heart_id       UUID,
  note           TEXT,
  vibe           TEXT,
  created_at     TIMESTAMPTZ,
  expires_at     TIMESTAMPTZ,
  place_id       UUID,
  place_name     TEXT,
  place_category TEXT,
  extended_count INTEGER,
  extends_left   INTEGER,
  extend_cost    INTEGER,
  can_extend     BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    h.id,
    COALESCE(h.note, ''),
    COALESCE(h.vibe, ''),
    h.created_at,
    h.expires_at,
    p.id,
    COALESCE(p.name, 'Somewhere'),
    COALESCE(p.category, ''),
    h.extended_count,
    GREATEST(0, s.extend_max - h.extended_count),
    s.extend_rose_cost,
    (h.extended_count < s.extend_max)
  FROM hearts h
  LEFT JOIN places p ON p.id = h.place_id
  CROSS JOIN (SELECT extend_max, extend_rose_cost FROM heart_settings WHERE id = 1) s
  WHERE h.dropper_id = auth.uid()
    AND h.status = 'active'
    AND h.expires_at > NOW()
  ORDER BY h.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION my_hearts() TO authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- Receipt.
-- ─────────────────────────────────────────────────────────────────────

SELECT
  (SELECT paid_media_enabled FROM fairness_settings WHERE id = 1)
    AS photo_selling_on,
  (SELECT save_price_min  FROM fairness_settings WHERE id = 1) AS price_floor,
  (SELECT save_price_max  FROM fairness_settings WHERE id = 1) AS price_ceiling,
  (SELECT save_sender_share FROM fairness_settings WHERE id = 1) AS sender_keeps_pct,
  (SELECT extend_rose_cost FROM heart_settings WHERE id = 1) AS extend_costs,
  (SELECT extend_max FROM heart_settings WHERE id = 1) AS extends_allowed,
  -- Both new functions should exist.
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('my_hearts', 'media_sale_terms'))
    AS new_functions,
  -- And send_message should now be gated on the switch.
  (SELECT pg_get_functiondef(p.oid) LIKE '%paid_media_enabled%'
   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'send_message')
    AS send_message_gated;
