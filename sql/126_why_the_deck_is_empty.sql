-- Why does the deck say "Try widening your filters"?
--
-- It is not the filters. Checked against the live data, every gate the
-- app can be blamed for passes:
--
--   253 profiles, 138 of them women (this account wants women)
--   137 have a location, a photo, and published_at set
--   all 138 are within 50 km — several at 0 km
--   all 138 were last active 32-36 days ago, inside the 60-day line
--   all clear both age filters, in both directions
--   only 39 likes and 33 passes exist from this account
--   nobody is inside the 12-hour re-show gap
--   nobody is at the 60-a-day exposure cap
--
-- And the deck still returns one person — a man, which the orientation
-- filter alone should have excluded.
--
-- What the data does show:
--
--   discovery_pools       714 rows across all users, 67 of them mine,
--                         66 of those neither liked nor passed
--   discovery_pool_state  ZERO rows. For everybody. The table exists
--                         and answers, it has simply never been written
--
-- discovery_feed ends with an INSERT ... ON CONFLICT into
-- discovery_pool_state on every single call. It has run many times —
-- the pool is full — so that insert is either failing silently or never
-- being reached, and the serving half has no state to read.
--
-- That is a bug in the feed, not a filter anyone set, and it affects
-- every account rather than this one.
--
-- This file proves it and shows the failing clause. Read-only.

SET search_path = public, extensions;


-- ── 1. The pool is full and the state is empty ───────────────────────
--
-- The whole diagnosis in one row. If pool_rows is high and state_rows
-- is 0, the feed is building a pool it never records having built.

SELECT
  (SELECT count(*) FROM discovery_pools)      AS pool_rows,
  (SELECT count(*) FROM discovery_pool_state) AS state_rows,
  (SELECT count(DISTINCT user_id) FROM discovery_pools) AS users_with_a_pool;


-- ── 2. This account specifically ─────────────────────────────────────
--
-- How many people are sitting in the pool, and how many of those have
-- not already been liked or passed — which is how many the deck should
-- be able to show right now.

WITH me AS (
  SELECT p.user_id
  FROM profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE u.email = 'shopbix.info@gmail.com'
  LIMIT 1
)
SELECT
  (SELECT count(*) FROM discovery_pools WHERE user_id = (SELECT user_id FROM me))
    AS in_my_pool,
  (SELECT count(*) FROM discovery_pools d
    WHERE d.user_id = (SELECT user_id FROM me)
      AND NOT d.blocked
      AND NOT EXISTS (SELECT 1 FROM likes l
                      WHERE l.liker_id = d.user_id AND l.liked_id = d.candidate_id)
      AND NOT EXISTS (SELECT 1 FROM passes x
                      WHERE x.passer_id = d.user_id AND x.passed_id = d.candidate_id))
    AS should_be_swipeable,
  (SELECT count(*) FROM discovery_pool_state WHERE user_id = (SELECT user_id FROM me))
    AS my_state_rows;


-- ── 3. What the feed returns, right now ──────────────────────────────
--
-- Run as the member, so auth.uid() is set the way the app has it. If
-- this returns far fewer than should_be_swipeable above, the serving
-- half is the problem rather than the pool.

WITH me AS (
  SELECT p.latitude, p.longitude
  FROM profiles p
  JOIN auth.users u ON u.id = p.user_id
  WHERE u.email = 'shopbix.info@gmail.com'
  LIMIT 1
)
SELECT count(*) AS rows_the_deck_gets
FROM discovery_feed(
  (SELECT latitude FROM me),
  (SELECT longitude FROM me),
  5000,
  50
);


-- ── 4. Does the state table reject the write? ────────────────────────
--
-- The most likely explanation for a table that exists, answers, and has
-- never been written: the INSERT names a column the table does not
-- have, or the ON CONFLICT names a constraint that is not there. Both
-- fail loudly in isolation and can be swallowed inside a larger
-- statement.

SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'discovery_pool_state'
ORDER BY ordinal_position;

SELECT
  conname    AS constraint_name,
  contype    AS kind,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.discovery_pool_state'::regclass;


-- ── 5. The function's own source ─────────────────────────────────────
--
-- Everything above is inference. This is what the database is actually
-- running, and the clause that drops 66 people will be visible in it.

SELECT pg_get_functiondef(p.oid) AS discovery_feed_source
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'discovery_feed'
LIMIT 1;
