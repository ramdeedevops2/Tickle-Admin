/**
 * Put the database back the way it was before the store screenshots.
 *
 * Everything the London seed added is removed, and the two things it
 * changed on the real account are restored. The screenshots are already
 * saved as files, so nothing here loses work.
 *
 * ── What it undoes ───────────────────────────────────────────────────
 *
 *   hearts, places   the six Shoreditch venues and the hearts at them
 *   dailies          the five Moments stories
 *   messages         the seeded conversations
 *   matches          the five London matches
 *   likes            the four likes from the seeded men
 *   profiles         the nine London people, and their auth users
 *   storage          every photograph uploaded for them
 *
 *   my location      back to the real fix, sharing on
 *   my photo         the seeded portrait dropped from the front
 *   old matches      the seven hidden Mohali conversations unhidden
 *
 * ── What it deliberately leaves ──────────────────────────────────────
 *
 * The name, bio and prompts written onto the account. "himanshu
 * Thakur" was lowercase and the bio said "Nothing Special"; those were
 * real faults rather than screenshot dressing, and putting them back
 * would be restoring a bug. Say so if you want them reverted too.
 *
 *   node scripts/undo-london-seed.mjs          # dry run
 *   node scripts/undo-london-seed.mjs --commit
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const ME = '93fc92f9-1024-47b9-b9b9-7f3700f4c9b4';
const COMMIT = process.argv.includes('--commit');

/* Read from the table before they were hidden, on 2026-10-12. */
const HIDDEN = {
  'fde649d9-6591-4018-a352-5bb80d4bbc6a': 'open',
  '989eb5e1-fddf-445c-bb61-0b42e5bd7fa2': 'open',
  '491a3dc6-2b1a-4268-9165-74b9e2065c85': 'open',
  '71cb76f1-b1e9-4314-8cc9-cdeb620d9adc': 'expired',
  '5bd563cc-6f93-47aa-908a-08e096626923': 'expired',
  'f85bbeec-d6e9-4232-80b5-f2f8fb4665dc': 'open',
  'ebf00dfe-174b-49e2-8566-70995723401d': 'open',
};

/* Mohali, where the account actually is. */
const REAL = { latitude: 30.6874207, longitude: 76.6885926, city: 'Sahibzada Ajit Singh Nagar' };

function env() {
  const raw = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
}

async function main() {
  const e = env();
  const db = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(COMMIT ? '── COMMIT ──\n' : '── DRY RUN (pass --commit to write) ──\n');

  const { data: london } = await db
    .from('profiles')
    .select('user_id, name')
    .eq('draft->>london', 'true');
  const ids = (london ?? []).map((p) => p.user_id);

  const { data: places } = await db
    .from('places')
    .select('id, name')
    .like('google_place_id', 'seed-london-%');
  const placeIds = (places ?? []).map((p) => p.id);

  const { data: matches } = ids.length
    ? await db
        .from('matches')
        .select('id')
        .or(`and(user1_id.eq.${ME},user2_id.in.(${ids})),and(user2_id.eq.${ME},user1_id.in.(${ids}))`)
    : { data: [] };

  console.log(`  ${ids.length} London profile(s)`);
  console.log(`  ${placeIds.length} seeded place(s)`);
  console.log(`  ${matches?.length ?? 0} London match(es)`);
  console.log(`  ${Object.keys(HIDDEN).length} hidden match(es) to unhide`);
  console.log(`  my location -> ${REAL.city}`);

  if (!COMMIT) {
    console.log('\nNothing written. Re-run with --commit.');
    return;
  }

  console.log('');

  // Messages reference matches, hearts reference places: children first.
  if (matches?.length) {
    await db.from('messages').delete().in('match_id', matches.map((m) => m.id));
    await db.from('matches').delete().in('id', matches.map((m) => m.id));
    console.log(`  ✓ removed ${matches.length} match(es) and their messages`);
  }

  if (placeIds.length) {
    await db.from('hearts').delete().in('place_id', placeIds);
    await db.from('places').delete().in('id', placeIds);
    console.log(`  ✓ removed ${placeIds.length} place(s) and their hearts`);
  }

  if (ids.length) {
    await db.from('dailies').delete().in('user_id', ids);
    await db.from('likes').delete().in('liker_id', ids);
    await db.from('likes').delete().in('liked_id', ids);
    await db.from('hearts').delete().in('dropper_id', ids);
    await db.from('discovery_pools').delete().in('candidate_id', ids);
    await db.from('discovery_pools').delete().in('user_id', ids);
    console.log('  ✓ removed stories, likes, hearts and pool rows');

    // Their photographs, then the rows, then the accounts.
    for (const id of ids) {
      const { data: files } = await db.storage.from('photos').list(id);
      if (files?.length) {
        await db.storage.from('photos').remove(files.map((f) => `${id}/${f.name}`));
      }
    }
    console.log('  ✓ removed their photographs from storage');

    await db.from('profiles').delete().in('user_id', ids);
    for (const id of ids) await db.auth.admin.deleteUser(id);
    console.log(`  ✓ removed ${ids.length} profile(s) and auth user(s)`);
  }

  for (const [id, state] of Object.entries(HIDDEN)) {
    await db.from('matches').update({ state }).eq('id', id);
  }
  console.log(`  ✓ unhid ${Object.keys(HIDDEN).length} old match(es)`);

  // My own photograph: drop the seeded one, keep the originals.
  const { data: me } = await db.from('profiles').select('photos').eq('user_id', ME).single();
  const kept = (me?.photos ?? []).filter((u) => !u.includes('card-mine'));
  await db.storage.from('photos').remove([`${ME}/card-mine.jpg`]);
  await db
    .from('profiles')
    .update({ ...REAL, photos: kept, location_sharing: true, search_radius: 10, max_age: 99 })
    .eq('user_id', ME);
  await db.from('discovery_pools').delete().eq('user_id', ME);
  console.log('  ✓ my location, radius and photos restored');

  console.log('\nDone. The deck will rebuild from the real position on next open.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
