-- Putting the old Mohali matches back.
--
-- Nine conversations from testing were hidden so the chat list would
-- show only the London five for the store screenshots. Hiding meant
-- setting state to 'unmatched'; nothing was deleted, and every message
-- is still attached to its match.
--
-- Their original states were mixed, so restoring is not one UPDATE.
-- These are the values as they were on 2026-10-12, read straight from
-- the table before the change.
--
-- Safe to run once the screenshots are taken.

UPDATE matches SET state = 'open'
WHERE id IN (
  'fde649d9-6591-4018-a352-5bb80d4bbc6a',  -- Gurleen Randhawa
  '989eb5e1-fddf-445c-bb61-0b42e5bd7fa2',  -- Sukhmani Randhawa
  '491a3dc6-2b1a-4268-9165-74b9e2065c85',  -- Kritika Verma
  'f85bbeec-d6e9-4232-80b5-f2f8fb4665dc',  -- Divya Yadav
  'ebf00dfe-174b-49e2-8566-70995723401d'   -- Kajal Bhangu
);

UPDATE matches SET state = 'expired'
WHERE id IN (
  '71cb76f1-b1e9-4314-8cc9-cdeb620d9adc',  -- Nishtha Verma
  '5bd563cc-6f93-47aa-908a-08e096626923'   -- Simran Bajwa
);

-- Shivani Chauhan and Riddhima Verma were already 'unmatched' before
-- any of this, so they are deliberately not listed here.

SELECT state, count(*) FROM matches
WHERE user1_id = '93fc92f9-1024-47b9-b9b9-7f3700f4c9b4'
   OR user2_id = '93fc92f9-1024-47b9-b9b9-7f3700f4c9b4'
GROUP BY state ORDER BY state;
