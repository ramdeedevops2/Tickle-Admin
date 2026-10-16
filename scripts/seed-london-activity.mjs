/**
 * Matches, conversations and likes for the London nine.
 *
 * ── Why ──────────────────────────────────────────────────────────────
 *
 * The deck has good faces now, but every other screen is empty: no
 * matches, no chats, nothing in Sparks. A store listing made of one
 * populated screen and five blank ones tells a reviewer the app does
 * not work.
 *
 * This fills them. It is written for screenshots, so the conversations
 * are short and plausible rather than long — a card only ever shows the
 * last line, and a chat screen shows perhaps a dozen bubbles.
 *
 * ── What it writes ───────────────────────────────────────────────────
 *
 *   matches     one per woman, state 'open'
 *   messages    a handful each, ending on a line worth reading
 *   likes       from the men, so Sparks has something in it
 *
 * Re-running replaces this script's own rows and nothing else: every
 * match it makes is between the account and one of the nine, and those
 * are deleted first. Real matches with real people are untouched.
 *
 *   node scripts/seed-london-activity.mjs          # dry run
 *   node scripts/seed-london-activity.mjs --commit
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';
import path from 'node:path';

const ME = '93fc92f9-1024-47b9-b9b9-7f3700f4c9b4';
const COMMIT = process.argv.includes('--commit');

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/*
 * Conversations, newest last.
 *
 * `mine` is true when the account sent it. The last line of each is
 * what appears in the Chat list, so each ends on something that reads
 * like a conversation worth opening rather than "ok".
 *
 * `agoH` is how many hours ago the exchange started. Spreading them out
 * means the Chat list shows a range of times instead of ten rows all
 * saying the same thing.
 */
const CHATS = [
  {
    name: 'Hana Park',
    agoH: 3,
    unreadFromThem: 1,
    lines: [
      { mine: false, text: 'ok your profile says you cycle. how far are we talking' },
      { mine: true, text: 'Far enough that I regret it halfway' },
      { mine: false, text: 'perfect. same' },
      { mine: false, text: 'I did 60k on sunday and could not feel my hands at the end' },
      { mine: true, text: 'That is not a flex, that is a warning' },
      { mine: false, text: 'it is both' },
      { mine: true, text: 'What were you riding?' },
      { mine: false, text: 'an old steel frame I keep threatening to replace' },
      { mine: true, text: 'Never replace the steel frame' },
      { mine: false, text: 'see this is why I messaged you' },
      { mine: false, text: 'there is a route out past the marshes if you ever want company' },
    ],
  },
  {
    name: 'Freya Lindqvist',
    agoH: 9,
    unreadFromThem: 0,
    lines: [
      { mine: true, text: 'An architect who is bad at chess. There has to be a story there' },
      { mine: false, text: 'I can see the whole board and still pick the worst square on it' },
      { mine: true, text: 'That is extremely relatable' },
      { mine: false, text: 'my dad taught me when I was six and I have not improved since' },
      { mine: true, text: 'Six is young to peak' },
      { mine: false, text: 'brutal' },
      { mine: false, text: 'what do you actually do when you are not insulting strangers' },
      { mine: true, text: 'Mostly looking at buildings and pretending I know why they work' },
      { mine: false, text: 'ok that is my job though' },
      { mine: true, text: 'Then you can tell me if I am wrong' },
      { mine: false, text: 'I will teach you the rules and then lose to you. it is my brand' },
    ],
  },
  {
    name: 'Elif Demir',
    agoH: 26,
    unreadFromThem: 2,
    lines: [
      { mine: false, text: 'empty galleries on a weekday is the correct answer and nobody says it' },
      { mine: true, text: 'Finally someone who gets it' },
      { mine: false, text: 'weekends are for people who like queueing' },
      { mine: true, text: 'And standing behind someone reading every single label' },
      { mine: false, text: 'out loud' },
      { mine: true, text: 'To their friend who is not listening' },
      { mine: false, text: 'you have clearly suffered' },
      { mine: false, text: 'there is a small one near mine that is always dead' },
      { mine: false, text: 'free on thursdays too' },
    ],
  },
  {
    name: 'Mei Tanaka',
    agoH: 52,
    unreadFromThem: 0,
    lines: [
      { mine: true, text: 'Going to need you to settle a flat white argument' },
      { mine: false, text: 'oh I have strong feelings about this' },
      { mine: true, text: 'I knew it' },
      { mine: false, text: 'go on then. what is the argument' },
      { mine: true, text: 'My friend says it is just a small latte' },
      { mine: false, text: 'your friend is wrong and should be told so gently' },
      { mine: true, text: 'I will pass that on word for word' },
      { mine: false, text: 'come by the shop and I will make you the correct one' },
    ],
  },
  {
    name: 'Amara Boateng',
    agoH: 74,
    unreadFromThem: 1,
    lines: [
      { mine: false, text: 'the monstera is called Kevin. my flatmate named it and it stuck' },
      { mine: true, text: 'Kevin is a bold choice for a plant' },
      { mine: false, text: 'there is also a fern called Deborah' },
      { mine: true, text: 'How many are we talking' },
      { mine: false, text: 'do not make me count them' },
      { mine: true, text: 'That is an answer in itself' },
      { mine: false, text: 'he has grown into it honestly' },
    ],
  },
];

/* The men like the account, so Sparks is not an empty screen. */
const ADMIRERS = ['Minh Nguyen', 'Elias Okonkwo', 'Tomas Novak', 'Oliver Hale'];

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
    .select('user_id, name, gender')
    .eq('draft->>london', 'true');

  if (!london?.length) throw new Error('no London profiles — run seed-london-profiles first');
  const byName = Object.fromEntries(london.map((p) => [p.name, p.user_id]));

  for (const c of CHATS) if (!byName[c.name]) throw new Error(`missing profile: ${c.name}`);
  for (const n of ADMIRERS) if (!byName[n]) throw new Error(`missing profile: ${n}`);

  const ids = london.map((p) => p.user_id);

  if (!COMMIT) {
    for (const c of CHATS) {
      const last = c.lines[c.lines.length - 1];
      console.log(
        `  ${c.name.padEnd(17)} ${String(c.lines.length).padStart(2)} messages, ` +
          `${c.unreadFromThem} unread, last: "${last.text.slice(0, 44)}..."`
      );
    }
    console.log(`\n  ${ADMIRERS.length} likes from: ${ADMIRERS.join(', ')}`);
    console.log('\nNothing written. Re-run with --commit.');
    return;
  }

  /*
   * Clear this script's previous run.
   *
   * Only matches between the account and one of the nine, so a real
   * conversation with a real person cannot be caught by it. Messages go
   * first: they reference the match row.
   */
  const { data: old } = await db
    .from('matches')
    .select('id')
    .or(`and(user1_id.eq.${ME},user2_id.in.(${ids})),and(user2_id.eq.${ME},user1_id.in.(${ids}))`);

  if (old?.length) {
    await db.from('messages').delete().in('match_id', old.map((m) => m.id));
    await db.from('matches').delete().in('id', old.map((m) => m.id));
    console.log(`  cleared ${old.length} previous match(es)\n`);
  }

  for (const c of CHATS) {
    const them = byName[c.name];
    const started = Date.now() - c.agoH * HOUR;

    // Each reply lands a few minutes after the one before it, so the
    // thread reads like a conversation rather than a burst.
    const stamps = c.lines.map((_, i) => new Date(started + i * 7 * MIN).toISOString());
    const lastAt = stamps[stamps.length - 1];

    const { data: match, error: mErr } = await db
      .from('matches')
      .insert({
        user1_id: ME,
        user2_id: them,
        state: 'open',
        created_at: new Date(started - 2 * HOUR).toISOString(),
        opened_at: new Date(started - 2 * HOUR).toISOString(),
        last_message_at: lastAt,
        seen1_at: lastAt,
      })
      .select('id')
      .single();

    if (mErr) throw new Error(`${c.name} match: ${mErr.message}`);

    // The newest few from them stay unread, so the Chat tab carries a
    // badge and the list shows the unread treatment.
    const theirIdx = c.lines.map((l, i) => (!l.mine ? i : -1)).filter((i) => i >= 0);
    const unread = new Set(theirIdx.slice(-c.unreadFromThem));

    const rows = c.lines.map((l, i) => ({
      match_id: match.id,
      sender_id: l.mine ? ME : them,
      content: l.text,
      kind: 'text',
      read: l.mine ? true : !unread.has(i),
      created_at: stamps[i],
    }));

    const { error: msgErr } = await db.from('messages').insert(rows);
    if (msgErr) throw new Error(`${c.name} messages: ${msgErr.message}`);

    console.log(`  ✓ ${c.name.padEnd(17)} ${rows.length} messages, ${c.unreadFromThem} unread`);
  }

  // Likes from the men. Upserted rather than inserted so a second run
  // does not trip the unique pair constraint.
  const likes = ADMIRERS.map((n, i) => ({
    liker_id: byName[n],
    liked_id: ME,
    created_at: new Date(Date.now() - (i + 1) * 5 * HOUR).toISOString(),
  }));

  const { error: lErr } = await db
    .from('likes')
    .upsert(likes, { onConflict: 'liker_id,liked_id', ignoreDuplicates: true });
  if (lErr) throw new Error(`likes: ${lErr.message}`);

  console.log(`  ✓ ${likes.length} likes into Sparks`);
  console.log('\nDone.');
}

main().catch((err) => {
  console.error('\nFAILED:', err.message);
  process.exit(1);
});
