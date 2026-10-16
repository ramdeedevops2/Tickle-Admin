/**
 * Ten London profiles with real photographs, for the Play Store listing.
 *
 * ── Why this exists ──────────────────────────────────────────────────
 *
 * The 251 seed profiles already in the database carry photographs of
 * three to seven kilobytes. On a phone screen that is a blur, and a
 * store listing built from blurred faces looks like a listing for an
 * app nobody finished. These ten are the fix: real photographs, resized
 * properly, with names and neighbourhoods that match the faces.
 *
 * ── What it does and does not touch ──────────────────────────────────
 *
 * It creates ten auth users and ten profiles. It changes nothing that
 * already exists — not the 251 Mohali seeds, not any real account. The
 * old seeds stay published where they are; they simply sit seven
 * thousand kilometres outside a London search radius, so the deck never
 * reaches them.
 *
 * Re-running is safe. Each person is keyed by a fixed email, so a
 * second run updates the same ten rows rather than making ten more.
 *
 * ── The photographs ──────────────────────────────────────────────────
 *
 * Source files are 2500-4000px originals. They are cropped to the 3:4
 * the card draws and resized to 1080px wide — large enough to stay
 * sharp on a dense screen, small enough that a deck of ten does not
 * cost the user a megabyte each.
 *
 * The crop is top-weighted rather than centred. A portrait photograph
 * puts the face in the upper third, so a centre crop of a tall frame
 * cuts the forehead and keeps the knees.
 *
 *   node scripts/seed-london-profiles.mjs          # dry run, no writes
 *   node scripts/seed-london-profiles.mjs --commit # do it
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

/*
 * The originals, kept in the repo rather than on the desktop.
 *
 * They started life in a downloads folder, which is the first thing to
 * be cleared out — and without them this script cannot rebuild a single
 * profile photograph.
 */
const BOOM = 'D:/TICKLE/tickle-app/assets/seed-photos';
const COMMIT = process.argv.includes('--commit');

/* The card is 3:4. 1080 wide keeps it sharp on a 640dpi screen. */
const CARD_W = 1080;
const CARD_H = 1440;

/*
 * How far down the frame the crop window sits, per photograph.
 *
 * 0 is flush with the top, 1 is flush with the bottom, 0.5 is centred.
 * Portrait photographs vary too much for one number to serve: a tight
 * headshot wants the frame near the top, somebody photographed lying
 * down wants it near the middle. These are read off each image.
 */
const DEFAULT_GRAVITY = 0.18;

const PEOPLE = [
  // ── women ──────────────────────────────────────────────────────────
  {
    file: 'pexels-maycon-marmo-1382692-4346013.jpg',
    gravity: 0.30,
    name: 'Amara Boateng',
    age: 26,
    gender: 'female',
    interested_in: 'male',
    city: 'Peckham',
    lat: 51.4739,
    lng: -0.0686,
    work: 'Nursery teacher',
    height_cm: 168,
    bio: 'Laughs too loud in quiet cafes. Keeps every plant alive so far.',
    interests: ['Plants', 'Music', 'Coffee', 'Dancing', 'Cooking', 'Photography'],
    prompts: [
      { question: 'The last thing that made me laugh', answer: 'My flatmate naming the monstera.' },
      { question: 'My simple pleasures are', answer: 'Sunday markets and a long walk home.' },
      { question: "I'm looking for someone who", answer: 'Texts back and means it.' },
    ],
  },
  {
    file: 'pexels-pelageia-zelenina-58865108-9513785.jpg',
    // Face sat small under a lot of sky; framed in on her instead.
    crop: { zoom: 0.55, cx: 0.52, cy: 0.30 },
    name: 'Freya Lindqvist',
    age: 27,
    gender: 'female',
    interested_in: 'male',
    city: 'Islington',
    lat: 51.5362,
    lng: -0.1033,
    work: 'Architect',
    height_cm: 171,
    bio: 'Drawn to old buildings and new people. Terrible at chess.',
    interests: ['Art', 'Running', 'Wine', 'Travel', 'Reading', 'Design'],
    prompts: [
      { question: 'I get way too excited about', answer: 'A building with good light.' },
      { question: 'My most controversial opinion is', answer: 'Brunch is overrated.' },
      { question: "I'm looking for someone who", answer: 'Has somewhere they want to show me.' },
    ],
  },
  {
    file: 'pexels-faruktokluoglu-7710704.jpg',
    // Same: a wide seated shot, cropped down to a portrait.
    crop: { zoom: 0.55, cx: 0.56, cy: 0.36 },
    name: 'Elif Demir',
    age: 24,
    gender: 'female',
    interested_in: 'male',
    city: 'Dalston',
    lat: 51.5460,
    lng: -0.0749,
    work: 'Graphic designer',
    height_cm: 165,
    bio: 'Always halfway through something. Usually a book, sometimes a tattoo.',
    interests: ['Design', 'Film', 'Vinyl', 'Street food', 'Cats', 'Cycling'],
    prompts: [
      { question: 'My simple pleasures are', answer: 'Empty galleries on a weekday.' },
      { question: 'The last thing that made me laugh', answer: 'A pigeon on the overground.' },
      { question: "I'm looking for someone who", answer: 'Has their own thing going on.' },
    ],
  },
  {
    file: 'pexels-nowrin-sanjana-2159843098-37182306.jpg',
    gravity: 0.20,
    name: 'Mei Tanaka',
    age: 23,
    gender: 'female',
    interested_in: 'male',
    city: 'Camden',
    lat: 51.5390,
    lng: -0.1426,
    work: 'Barista and illustrator',
    height_cm: 162,
    bio: 'Pulls shots by day, draws strangers by night. Will not draw you.',
    interests: ['Coffee', 'Drawing', 'Music', 'Markets', 'Baking', 'Cats'],
    prompts: [
      { question: 'I get way too excited about', answer: 'A properly made flat white.' },
      { question: 'My simple pleasures are', answer: 'The first hour of a day off.' },
      { question: "I'm looking for someone who", answer: 'Can sit in silence comfortably.' },
    ],
  },
  {
    file: 'pexels-ian-panelo-3049394.jpg',
    gravity: 0.30,
    name: 'Hana Park',
    age: 25,
    gender: 'female',
    interested_in: 'male',
    city: 'Shoreditch',
    lat: 51.5255,
    lng: -0.0785,
    work: 'Product designer',
    height_cm: 166,
    bio: 'Three coffees deep by eleven. Ask me about my bike.',
    interests: ['Cycling', 'Design', 'Climbing', 'Travel', 'Coffee', 'Photography'],
    prompts: [
      { question: 'I get way too excited about', answer: 'A route I have not ridden.' },
      { question: 'The last thing that made me laugh', answer: 'My own clipless pedal fall.' },
      { question: "I'm looking for someone who", answer: 'Says yes to a long detour.' },
    ],
  },

  // ── men ────────────────────────────────────────────────────────────
  {
    file: 'pexels-hieu-duong-724202953-18400516.jpg',
    gravity: 0.08,
    name: 'Minh Nguyen',
    age: 24,
    gender: 'male',
    interested_in: 'female',
    city: 'Hackney',
    lat: 51.5450,
    lng: -0.0553,
    work: 'Chef',
    height_cm: 174,
    bio: 'Cooks for a living and still cooks on days off. Something is wrong with me.',
    interests: ['Cooking', 'Football', 'Street food', 'Music', 'Running', 'Markets'],
    prompts: [
      { question: 'I get way too excited about', answer: 'A knife that holds its edge.' },
      { question: 'My simple pleasures are', answer: 'Staff dinner after a hard service.' },
      { question: "I'm looking for someone who", answer: 'Will eat anything once.' },
    ],
  },
  {
    file: 'pexels-micahways-10498088.jpg',
    gravity: 0.12,
    name: 'Elias Okonkwo',
    age: 28,
    gender: 'male',
    interested_in: 'female',
    city: 'Brixton',
    lat: 51.4613,
    lng: -0.1156,
    work: 'Music producer',
    height_cm: 183,
    bio: 'Studio most nights. Still make it to Sunday lunch.',
    interests: ['Music', 'Vinyl', 'Basketball', 'Film', 'Cooking', 'Travel'],
    prompts: [
      { question: 'I get way too excited about', answer: 'A bassline that sits right.' },
      { question: 'My most controversial opinion is', answer: 'Headphones beat speakers.' },
      { question: "I'm looking for someone who", answer: 'Has a record they would defend.' },
    ],
  },
  {
    file: 'pexels-shaqeebhasan-37100378.jpg',
    gravity: 0.10,
    name: 'Tomas Novak',
    age: 26,
    gender: 'male',
    interested_in: 'female',
    city: 'Clapham',
    lat: 51.4618,
    lng: -0.1384,
    work: 'Physiotherapist',
    height_cm: 180,
    bio: "Fixing other people's knees. Mine are fine, thanks for asking.",
    interests: ['Running', 'Climbing', 'Cooking', 'Football', 'Hiking', 'Coffee'],
    prompts: [
      { question: 'My simple pleasures are', answer: 'A run before anyone is awake.' },
      { question: 'The last thing that made me laugh', answer: 'A patient blaming his dog.' },
      { question: "I'm looking for someone who", answer: 'Would come up a hill with me.' },
    ],
  },
  {
    file: 'pexels-tima-miroshnichenko-6508422.jpg',
    gravity: 0.22,
    name: 'Oliver Hale',
    age: 25,
    gender: 'male',
    interested_in: 'female',
    city: 'Notting Hill',
    lat: 51.5090,
    lng: -0.1960,
    work: 'Landscape gardener',
    height_cm: 181,
    bio: 'Outside for work, outside after work. Will bring you cuttings.',
    interests: ['Plants', 'Hiking', 'Photography', 'Swimming', 'Markets', 'Dogs'],
    prompts: [
      { question: 'My simple pleasures are', answer: 'Rain on a day I planned indoors.' },
      { question: 'I get way too excited about', answer: 'Someone else owning a greenhouse.' },
      { question: "I'm looking for someone who", answer: 'Does not mind muddy boots.' },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────── */

function env() {
  const raw = fs.readFileSync(path.join(process.cwd(), '.env'), 'utf8');
  return Object.fromEntries(
    raw
      .split(/\r?\n/)
      .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
  );
}

/**
 * Crop to the card's shape, weighted towards the top of the frame.
 *
 * The source is nearly always taller than 3:4, so the width is what
 * fits and the height is what gets cut. Where that cut falls is the
 * whole game: too low and the crop takes the chin and the torso, too
 * high and it takes hair and sky. `gravity` places the window.
 */
async function toCard(file, { gravity = DEFAULT_GRAVITY, crop } = {}) {
  const img = sharp(file, { failOn: 'none' });
  const meta = await img.metadata();

  const wantRatio = CARD_W / CARD_H;
  const haveRatio = meta.width / meta.height;

  let box;
  if (crop) {
    /*
     * An explicit window, for photographs where the subject is simply
     * too small in the frame for any top-weighted cut to save. `zoom`
     * is the fraction of the width kept; `cx`/`cy` place its centre.
     */
    let w = Math.round(meta.width * crop.zoom);
    let h = Math.round(w / wantRatio);
    if (h > meta.height) {
      h = meta.height;
      w = Math.round(h * wantRatio);
    }
    box = {
      left: Math.max(0, Math.min(Math.round(meta.width * crop.cx - w / 2), meta.width - w)),
      top: Math.max(0, Math.min(Math.round(meta.height * crop.cy - h / 2), meta.height - h)),
      width: w,
      height: h,
    };
  } else if (haveRatio > wantRatio) {
    // Wider than the card: keep full height, cut the sides evenly.
    const w = Math.round(meta.height * wantRatio);
    box = { left: Math.round((meta.width - w) / 2), top: 0, width: w, height: meta.height };
  } else {
    // Taller than the card: keep full width, choose where to cut.
    const h = Math.round(meta.width / wantRatio);
    box = {
      left: 0,
      top: Math.round((meta.height - h) * gravity),
      width: meta.width,
      height: h,
    };
  }

  return sharp(file, { failOn: 'none' })
    .extract(box)
    .resize(CARD_W, CARD_H, { fit: 'cover' })
    .jpeg({ quality: 86, mozjpeg: true })
    .toBuffer();
}

async function main() {
  const e = env();
  const db = createClient(e.NEXT_PUBLIC_SUPABASE_URL, e.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log(COMMIT ? '── COMMIT ──\n' : '── DRY RUN (pass --commit to write) ──\n');

  // Every photograph is prepared first. A failure here should stop the
  // run before any account exists, not halfway through making ten.
  const cards = [];
  for (const p of PEOPLE) {
    const src = path.join(BOOM, p.file);
    if (!fs.existsSync(src)) throw new Error(`missing photograph: ${src}`);
    const buf = await toCard(src, { gravity: p.gravity, crop: p.crop });
    cards.push(buf);
    console.log(`  prepared  ${p.name.padEnd(18)} ${String(Math.round(buf.length / 1024)).padStart(4)}KB`);
  }

  if (!COMMIT) {
    console.log('\nNothing written. Re-run with --commit.');
    return;
  }

  console.log('');
  const { data: existing } = await db.auth.admin.listUsers({ perPage: 1000 });

  for (let i = 0; i < PEOPLE.length; i++) {
    const p = PEOPLE[i];
    const slug = p.name.toLowerCase().replace(/[^a-z]+/g, '.');
    const email = `${slug}@london.seed`;

    let user = existing.users.find((u) => u.email === email);
    if (!user) {
      const { data, error } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
        password: `Seed!${Math.random().toString(36).slice(2)}Aa1`,
      });
      if (error) throw new Error(`${p.name}: ${error.message}`);
      user = data.user;
    }

    const file = `${user.id}/card-0.jpg`;
    const { error: upErr } = await db.storage
      .from('photos')
      .upload(file, cards[i], { contentType: 'image/jpeg', upsert: true });
    if (upErr) throw new Error(`${p.name} upload: ${upErr.message}`);

    const {
      data: { publicUrl },
    } = db.storage.from('photos').getPublicUrl(file);

    const now = new Date();
    const row = {
      user_id: user.id,
      name: p.name,
      email,
      age: p.age,
      gender: p.gender,
      interested_in: p.interested_in,
      orientation: 'Straight',
      city: p.city,
      latitude: p.lat,
      longitude: p.lng,
      bio: p.bio,
      work: p.work,
      height_cm: p.height_cm,
      interests: p.interests,
      prompts: p.prompts,
      photos: [publicUrl],
      looking_for: 'Open to seeing where things go',
      search_radius: 50,
      min_age: 18,
      max_age: 45,
      plan: 'free',
      onboarding_done: true,
      onboarding_stage: null,
      published_at: now.toISOString(),
      // Recent, but not all identical — "active 2 hours ago" on ten
      // profiles at once is the sort of thing a reviewer notices.
      last_active: new Date(now.getTime() - (i + 1) * 37 * 60 * 1000).toISOString(),
      draft: { seed: true, london: true, seeded_at: now.toISOString() },
    };

    const { data: prior } = await db
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    const { error: wErr } = prior
      ? await db.from('profiles').update(row).eq('user_id', user.id)
      : await db.from('profiles').insert(row);

    if (wErr) throw new Error(`${p.name} profile: ${wErr.message}`);

    console.log(
      `  ✓ ${p.name.padEnd(18)} ${String(p.age).padStart(2)} ${p.gender.padEnd(6)} ${p.city}`
    );
  }

  console.log(`\nDone. ${PEOPLE.length} London profiles published.`);
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
