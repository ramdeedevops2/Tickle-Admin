/**
 * London places, and hearts left at them.
 *
 * The Nearby tab reads "Not at a place yet" and shows two hearts picked
 * up at Sukhna Lake and a Chandigarh coffee shop. Every one of the 145
 * cached places is in India, so from London there is nothing to stand
 * at and nothing to find.
 *
 * This adds real London places near the account and drops a heart at a
 * few of them from the seeded women, so the screen has something on it.
 *
 * ── On the place rows ────────────────────────────────────────────────
 *
 * Normally places are cached from Google as people walk past them, and
 * google_place_id is the key that stops the same cafe being written
 * twice. These are written by hand, so they carry a 'seed-london-'
 * prefix instead — unmistakable in the table, and it cannot collide
 * with a real Google id.
 *
 *   node scripts/seed-london-hearts.mjs           # dry run
 *   node scripts/seed-london-hearts.mjs --commit
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const COMMIT = process.argv.includes('--commit');
const HOUR = 60 * 60 * 1000;

/*
 * Real places, close to the account's position in Shoreditch.
 *
 * Coordinates are roughly right rather than surveyed — a card shows a
 * name and a distance, and both only need to be plausible.
 */
const PLACES = [
  { key: 'rosa',    name: "Rosa's Thai Shoreditch", category: 'restaurant',  lat: 51.5236, lng: -0.0776, address: '12 Hanbury St, London E1 6QR' },
  { key: 'allpress',name: 'Allpress Espresso',      category: 'coffee_shop', lat: 51.5287, lng: -0.0763, address: '58 Redchurch St, London E2 7DP' },
  { key: 'dishoom', name: 'Dishoom Shoreditch',     category: 'restaurant',  lat: 51.5254, lng: -0.0781, address: '7 Boundary St, London E2 7JE' },
  { key: 'columbia',name: 'Columbia Road Market',   category: 'tourist_attraction', lat: 51.5292, lng: -0.0690, address: 'Columbia Rd, London E2 7RG' },
  { key: 'barber',  name: 'Barber & Parlour',       category: 'cafe',        lat: 51.5248, lng: -0.0770, address: '64 Redchurch St, London E2 7DP' },
  { key: 'hoxton',  name: 'Hoxton Square',          category: 'tourist_attraction', lat: 51.5272, lng: -0.0817, address: 'Hoxton Square, London N1 6NU' },
];

/*
 * Who left what, where.
 *
 * `mine` marks the one the account dropped, so the screen shows both
 * sides of the feature — a heart of your own out there, and other
 * people's to find.
 */
const HEARTS = [
  { place: 'allpress', from: 'Mei Tanaka',      vibe: 'Up for a chat',    note: 'Second coffee of the morning. No regrets.', agoH: 1 },
  { place: 'columbia', from: 'Amara Boateng',   vibe: 'Out walking',      note: 'Bought another plant I do not have room for.', agoH: 2 },
  { place: 'dishoom',  from: 'Hana Park',       vibe: 'Up for a drink',   note: 'Waiting on a table, could be a while.', agoH: 3 },
  { place: 'barber',   from: 'Elif Demir',      vibe: 'Working',          note: 'Pretending to work. Mostly people watching.', agoH: 5 },
  { place: 'hoxton',   from: 'Freya Lindqvist', vibe: 'Just here',        note: 'Sitting in the sun while it lasts.', agoH: 6 },
  { place: 'rosa',     mine: true,              vibe: 'Up for a drink',   note: 'Round the corner all evening if anyone is about.', agoH: 4 },
];

const ME = '93fc92f9-1024-47b9-b9b9-7f3700f4c9b4';

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
    .select('user_id, name, gender, interested_in')
    .eq('draft->>london', 'true');
  const by = Object.fromEntries((london ?? []).map((p) => [p.name, p]));

  for (const h of HEARTS) {
    if (!h.mine && !by[h.from]) throw new Error(`missing profile: ${h.from}`);
    if (!PLACES.some((p) => p.key === h.place)) throw new Error(`unknown place: ${h.place}`);
  }

  if (!COMMIT) {
    for (const p of PLACES) console.log(`  place  ${p.name}`);
    console.log('');
    for (const h of HEARTS) {
      const who = h.mine ? '(me)' : h.from;
      const where = PLACES.find((p) => p.key === h.place).name;
      console.log(`  heart  ${who.padEnd(17)} at ${where.padEnd(27)} "${h.vibe}"`);
    }
    console.log('\nNothing written. Re-run with --commit.');
    return;
  }

  const ids = {};
  for (const p of PLACES) {
    const gid = `seed-london-${p.key}`;

    // Written by hand rather than cached from Google, so upsert on the
    // id keeps a second run from duplicating the row.
    const { data, error } = await db
      .from('places')
      .upsert(
        {
          google_place_id: gid,
          name: p.name,
          category: p.category,
          address: p.address,
          latitude: p.lat,
          longitude: p.lng,
          cached_at: new Date().toISOString(),
        },
        { onConflict: 'google_place_id' }
      )
      .select('id')
      .single();

    if (error) throw new Error(`${p.name}: ${error.message}`);
    ids[p.key] = data.id;
    console.log(`  ✓ place  ${p.name}`);
  }

  // Clear this script's own hearts before writing them again.
  await db.from('hearts').delete().in('place_id', Object.values(ids));

  for (const h of HEARTS) {
    const who = h.mine ? { user_id: ME, gender: 'male', interested_in: 'female' } : by[h.from];
    const at = new Date(Date.now() - h.agoH * HOUR);

    const { error } = await db.from('hearts').insert({
      dropper_id: who.user_id,
      place_id: ids[h.place],
      note: h.note,
      vibe: h.vibe,
      dropper_gender: who.gender,
      dropper_interested_in: who.interested_in,
      status: 'active',
      created_at: at.toISOString(),
      // Hearts fade after a day, so these keep what is left of theirs
      // rather than resetting the clock.
      expires_at: new Date(at.getTime() + 24 * HOUR).toISOString(),
    });

    if (error) throw new Error(`heart at ${h.place}: ${error.message}`);
    console.log(`  ✓ heart  ${(h.mine ? '(me)' : h.from).padEnd(17)} "${h.vibe}"`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
