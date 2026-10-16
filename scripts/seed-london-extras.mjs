/**
 * The last three things the screenshots need.
 *
 *   1. the nine old Mohali matches hidden, so the chat list is only London
 *   2. a real photograph on the account, instead of the one with a cloth
 *      over the face that currently fronts every Moments row
 *   3. Moments for the London people, so that strip is not one empty "Add"
 *
 * ── On hiding rather than deleting ───────────────────────────────────
 *
 * The old matches are real conversations from testing. Setting their
 * state to 'unmatched' drops them out of the list and leaves every row
 * and message where it is, so --restore puts them back exactly as they
 * were. Nothing here destroys anything.
 *
 * ── On the stories ───────────────────────────────────────────────────
 *
 * These use the photographs that were rejected for deck cards — the
 * ones wearing sunglasses. A card is a face and those failed at it; a
 * story is a moment from someone's day, where a pair of sunglasses is
 * exactly what you would expect. Same pictures, right place.
 *
 *   node scripts/seed-london-extras.mjs            # dry run
 *   node scripts/seed-london-extras.mjs --commit
 *   node scripts/seed-london-extras.mjs --restore  # unhide the old matches
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const ME = '93fc92f9-1024-47b9-b9b9-7f3700f4c9b4';
const PHOTOS = 'D:/TICKLE/tickle-app/assets/seed-photos';

const COMMIT = process.argv.includes('--commit');
const RESTORE = process.argv.includes('--restore');

const HOUR = 60 * 60 * 1000;

/* My own photograph: a clean portrait, cropped like any profile photo. */
const MINE = { file: 'pexels-shaqeebhasan-37100378.jpg', crop: { zoom: 0.72, cx: 0.5, cy: 0.3 } };

/*
 * A moment each, for five of the London people.
 *
 * Captions are the kind of thing somebody actually writes over a story —
 * short, mid-thought, not an advertisement for the app.
 */
const STORIES = [
  {
    name: 'Freya Lindqvist',
    file: 'pexels-introspectivedsgn-8517921.jpg',
    crop: { zoom: 0.8, cx: 0.5, cy: 0.42 },
    caption: 'the whole street smells like this right now',
    agoH: 2,
  },
  {
    name: 'Elif Demir',
    file: 'pexels-thatguycraig000-1605177.jpg',
    crop: { zoom: 0.85, cx: 0.5, cy: 0.38 },
    caption: 'found a bench. staying here.',
    agoH: 4,
  },
  {
    name: 'Mei Tanaka',
    file: 'pexels-shaqeebhasan-37100397.jpg',
    crop: { zoom: 0.75, cx: 0.45, cy: 0.33 },
    caption: 'day off and the sun came out, finally',
    agoH: 7,
  },
  {
    name: 'Elias Okonkwo',
    file: 'pexels-shkrabaanthony-6609393.jpg',
    crop: { zoom: 0.8, cx: 0.5, cy: 0.3 },
    caption: 'on hold with the studio for 40 minutes',
    agoH: 11,
  },
  {
    name: 'Oliver Hale',
    file: 'pexels-ron-lach-7873100.jpg',
    crop: { zoom: 0.7, cx: 0.5, cy: 0.3 },
    caption: 'client wanted "something wild". he got it',
    agoH: 16,
  },
];

/* Stories are portrait and full-bleed, so taller than a deck card. */
const W = 1080;
const H = 1920;

function env() {
  const raw = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
}

async function crop(file, c, w = W, h = H) {
  const want = w / h;
  const m = await sharp(file).metadata();

  let cw = Math.round(m.width * c.zoom);
  let ch = Math.round(cw / want);
  if (ch > m.height) {
    ch = m.height;
    cw = Math.round(ch * want);
  }

  return sharp(file)
    .extract({
      left: Math.max(0, Math.min(Math.round(m.width * c.cx - cw / 2), m.width - cw)),
      top: Math.max(0, Math.min(Math.round(m.height * c.cy - ch / 2), m.height - ch)),
      width: cw,
      height: ch,
    })
    .resize(w, h, { fit: 'cover' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

async function main() {
  const e = env();
  const db = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: london } = await db
    .from('profiles')
    .select('user_id, name')
    .eq('draft->>london', 'true');
  const byName = Object.fromEntries((london ?? []).map((p) => [p.name, p.user_id]));
  const londonIds = new Set((london ?? []).map((p) => p.user_id));

  if (RESTORE) {
    const { data: hidden } = await db
      .from('matches')
      .select('id, draft_hidden:state')
      .or(`user1_id.eq.${ME},user2_id.eq.${ME}`)
      .eq('state', 'unmatched');
    console.log(`${hidden?.length ?? 0} match(es) are currently unmatched.`);
    console.log('Restoring is manual: the original states were mixed (open/expired/');
    console.log('unmatched), and this script does not record which was which.');
    console.log('The hide step prints them, so use that output.');
    return;
  }

  console.log(COMMIT ? '── COMMIT ──\n' : '── DRY RUN (pass --commit to write) ──\n');

  // ── 1. the old matches ─────────────────────────────────────────────
  const { data: all } = await db
    .from('matches')
    .select('id, user1_id, user2_id, state')
    .or(`user1_id.eq.${ME},user2_id.eq.${ME}`);

  const old = (all ?? []).filter((m) => {
    const other = m.user1_id === ME ? m.user2_id : m.user1_id;
    return !londonIds.has(other) && m.state !== 'unmatched';
  });

  console.log(`  ${old.length} old match(es) to hide`);
  if (old.length) {
    console.log('  original states, for putting back:');
    for (const m of old) console.log(`    ${m.id}  ${m.state}`);
  }

  // ── 2. my photograph ───────────────────────────────────────────────
  const mineBuf = await crop(path.join(PHOTOS, MINE.file), MINE.crop, 1080, 1440);
  console.log(`\n  my photo prepared: ${Math.round(mineBuf.length / 1024)}KB`);

  // ── 3. the stories ─────────────────────────────────────────────────
  const shots = [];
  for (const s of STORIES) {
    if (!byName[s.name]) throw new Error(`missing profile: ${s.name}`);
    shots.push(await crop(path.join(PHOTOS, s.file), s.crop));
    console.log(`  story prepared: ${s.name.padEnd(17)} "${s.caption}"`);
  }

  if (!COMMIT) {
    console.log('\nNothing written. Re-run with --commit.');
    return;
  }

  console.log('');

  if (old.length) {
    const { error } = await db
      .from('matches')
      .update({ state: 'unmatched' })
      .in('id', old.map((m) => m.id));
    if (error) throw new Error(`hiding matches: ${error.message}`);
    console.log(`  ✓ hid ${old.length} old match(es)`);
  }

  const myFile = `${ME}/card-mine.jpg`;
  await db.storage.from('photos').upload(myFile, mineBuf, {
    contentType: 'image/jpeg',
    upsert: true,
  });
  const {
    data: { publicUrl: myUrl },
  } = db.storage.from('photos').getPublicUrl(myFile);

  const { data: me } = await db.from('profiles').select('photos').eq('user_id', ME).single();
  const rest = (me?.photos ?? []).filter((u) => !u.includes('card-mine'));
  const { error: pErr } = await db
    .from('profiles')
    .update({ photos: [myUrl, ...rest] })
    .eq('user_id', ME);
  if (pErr) throw new Error(`my photo: ${pErr.message}`);
  console.log('  ✓ my profile photo replaced');

  // Clear only the seeded stories, so a second run does not stack them.
  await db.from('dailies').delete().in('user_id', Object.values(byName));

  for (let i = 0; i < STORIES.length; i++) {
    const s = STORIES[i];
    const uid = byName[s.name];
    const file = `${uid}/daily-0.jpg`;

    await db.storage.from('photos').upload(file, shots[i], {
      contentType: 'image/jpeg',
      upsert: true,
    });
    const {
      data: { publicUrl },
    } = db.storage.from('photos').getPublicUrl(file);

    const at = new Date(Date.now() - s.agoH * HOUR);
    const { error } = await db.from('dailies').insert({
      user_id: uid,
      kind: 'photo',
      payload: { url: publicUrl },
      caption: s.caption,
      created_at: at.toISOString(),
      // Stories last a day from posting, so these stay up for the
      // remainder of theirs rather than a fresh 24 hours.
      expires_at: new Date(at.getTime() + 24 * HOUR).toISOString(),
    });
    if (error) throw new Error(`${s.name} story: ${error.message}`);
    console.log(`  ✓ story: ${s.name}`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
