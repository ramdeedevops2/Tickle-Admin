-- Admin owns Paths feed rules. Existing defaults are preserved.
BEGIN;
ALTER TABLE public.paths_settings
  ADD COLUMN IF NOT EXISTS history_days integer NOT NULL DEFAULT 30 CHECK (history_days BETWEEN 0 AND 3650),
  ADD COLUMN IF NOT EXISTS respect_gender_preference boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hide_liked boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS hide_passed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS min_crossings integer NOT NULL DEFAULT 1 CHECK (min_crossings BETWEEN 1 AND 10000),
  ADD COLUMN IF NOT EXISTS feed_limit integer NOT NULL DEFAULT 40 CHECK (feed_limit BETWEEN 1 AND 200),
  ADD COLUMN IF NOT EXISTS sort_order text NOT NULL DEFAULT 'most_crossings'
    CHECK (sort_order IN ('most_crossings', 'most_recent'));

CREATE OR REPLACE FUNCTION public.paths_crossed(p_limit integer DEFAULT 40)
RETURNS TABLE (
  user_id uuid, name text, photo text, age integer, crossings integer,
  area text, when_coarse text, compat integer, reasons jsonb,
  is_online boolean, last_active timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_gender text;
  v_wants text;
  v_set public.paths_settings%ROWTYPE;
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  SELECT * INTO v_set FROM public.paths_settings WHERE id = 1;
  IF NOT FOUND THEN RETURN; END IF;
  SELECT p.gender, p.interested_in INTO v_gender, v_wants
    FROM profiles p WHERE p.user_id = v_me;
  v_wants := COALESCE(v_wants, CASE v_gender WHEN 'male' THEN 'female' WHEN 'female' THEN 'male' ELSE NULL END);

  RETURN QUERY SELECT
    p.user_id, p.name,
    CASE WHEN COALESCE(array_length(p.photos, 1), 0) > 0 THEN p.photos[1] END,
    p.age, e.crossings,
    CASE WHEN e.area_shown THEN e.area END,
    CASE WHEN e.last_day = CURRENT_DATE THEN 'today'
      WHEN e.last_day > CURRENT_DATE - 7 THEN 'this week' ELSE 'recently' END,
    COALESCE((compat_score(LEAST(v_me, p.user_id), GREATEST(v_me, p.user_id)) ->> 'score')::integer, 0),
    COALESCE(compat_score(LEAST(v_me, p.user_id), GREATEST(v_me, p.user_id)) -> 'reasons', '[]'::jsonb),
    visible_online(p.user_id), visible_last_active(p.user_id)
  FROM nearby_encounters e
  JOIN profiles p ON p.user_id = e.encountered_user_id
  WHERE e.user_id = v_me AND p.user_id <> v_me
    AND p.suspended_at IS NULL AND p.published_at IS NOT NULL
    AND (NOT v_set.respect_gender_preference OR v_wants IS NULL OR v_wants = 'everyone' OR p.gender = v_wants)
    -- Blocks, private visibility and moderation always apply.
    AND NOT is_blocked(v_me, p.user_id)
    AND (NOT is_incognito(p.user_id) OR EXISTS (
      SELECT 1 FROM incognito_reveals r WHERE r.hidden_id = p.user_id AND r.shown_to = v_me
    ))
    AND (NOT v_set.hide_liked OR NOT EXISTS (
      SELECT 1 FROM likes l WHERE l.liker_id = v_me AND l.liked_id = p.user_id
    ))
    AND (NOT v_set.hide_passed OR NOT EXISTS (
      SELECT 1 FROM passes s WHERE s.passer_id = v_me AND s.passed_id = p.user_id
    ))
    AND (v_set.history_days = 0 OR e.last_day > CURRENT_DATE - v_set.history_days)
    AND e.crossings >= v_set.min_crossings
  ORDER BY
    CASE WHEN v_set.sort_order = 'most_recent' THEN e.last_day END DESC,
    CASE WHEN v_set.sort_order = 'most_crossings' THEN e.crossings END DESC,
    e.last_day DESC, e.crossings DESC, p.user_id
  -- Keep the legacy argument for older apps; the admin controls the actual cap.
  LIMIT v_set.feed_limit;
END;
$$;
REVOKE ALL ON FUNCTION public.paths_crossed(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.paths_crossed(integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
