/**
 * End-to-end test of areas 11–20, with two real users.
 *
 * Structural checks prove the functions exist. This proves they do what
 * the spec says — that a decline actually refunds, that a second view of
 * a "view once" photo is actually refused, that a saved message actually
 * cannot be unsent.
 *
 * Two throwaway accounts are created, driven through every flow as
 * themselves — signed in, so auth.uid() is real and RLS applies — and
 * deleted at the end whatever happens.
 *
 * Run: node test-flows.mjs
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env', 'utf8');
const read = (name) => (env.match(new RegExp(`${name}=(.*)`)) ?? [])[1]?.trim();

const url = read('NEXT_PUBLIC_SUPABASE_URL') ?? read('SUPABASE_URL');
const serviceKey = read('SUPABASE_SERVICE_ROLE_KEY') ?? read('SERVICE_ROLE_KEY');
const anonKey = read('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? read('SUPABASE_ANON_KEY');

if (!url || !serviceKey || !anonKey) {
  console.error('Need SUPABASE_URL, SERVICE_ROLE_KEY and ANON_KEY in .env');
  process.exit(1);
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

let pass = 0;
let fail = 0;

const check = (ok, label, detail = '') => {
  if (ok) pass += 1;
  else fail += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};

const stamp = Date.now();
const created = [];

/** A real signed-in client, so auth.uid() works and RLS is in force. */
async function makeUser(tag) {
  const email = `test-${tag}-${stamp}@tickle.test`;
  const password = `Test!${stamp}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw new Error(`createUser ${tag}: ${error.message}`);

  const userId = data.user.id;
  created.push(userId);

  await admin.from('profiles').upsert({
    user_id: userId,
    name: `Test ${tag}`,
    email,
    age: 28,
    gender: 'male',
    interested_in: 'everyone',
    photos: ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg'],
    published_at: new Date().toISOString(),
    latitude: 28.6,
    longitude: 77.2,
    // A profile row already exists by the time createUser returns —
    // there is a signup trigger creating a bare one. An insert here
    // fails on the duplicate key and leaves the row unpopulated.
  }, { onConflict: 'user_id' });

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });

  if (signInError) throw new Error(`signIn ${tag}: ${signInError.message}`);

  return { id: userId, client };
}

async function cleanup() {
  for (const id of created) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

try {
  console.log('\nCreating two test users…');
  const a = await makeUser('a');
  const b = await makeUser('b');
  console.log(`  A ${a.id.slice(0, 8)}   B ${b.id.slice(0, 8)}`);

  // Roses, so the paid paths can actually be exercised.
  await admin.rpc('admin_grant_roses', { p_user_id: a.id, p_amount: 500, p_reason: 'test' });
  await admin.rpc('admin_grant_roses', { p_user_id: b.id, p_amount: 500, p_reason: 'test' });

  const { data: match } = await admin
    .from('matches')
    .insert({
      user1_id: a.id < b.id ? a.id : b.id,
      user2_id: a.id < b.id ? b.id : a.id,
    })
    .select()
    .single();

  const matchId = match.id;

  // ── Area 12 ─────────────────────────────────────────────
  console.log('\n── 12. Conversations ───────────────────');

  const { data: opened } = await a.client.rpc('open_conversation', { p_match_id: matchId });
  check(opened?.ok === true, 'open a pending match', JSON.stringify(opened));

  const { data: convos } = await a.client.rpc('my_conversations');
  check(convos?.open === 1, 'appears as one open conversation', `limit ${convos?.limit}`);
  check(convos?.slots_left === 4, 'slots left reported', String(convos?.slots_left));

  // ── Area 14 ─────────────────────────────────────────────
  console.log('\n── 14. Ephemeral messages ──────────────');

  const { data: sent } = await a.client.rpc('send_message', {
    p_match_id: matchId,
    p_kind: 'text',
    p_content: 'hello',
    p_retention: '24h',
  });
  check(sent?.ok === true, 'send a 24h text', sent?.expires_at ? 'has expiry' : 'NO EXPIRY');

  const { data: onceMsg } = await a.client.rpc('send_message', {
    p_match_id: matchId,
    p_kind: 'photo',
    p_media_path: 'test/fake.jpg',
    p_retention: 'once',
  });
  check(onceMsg?.ok === true, 'send a view-once photo');

  // The heart of area 14: the second view must be refused.
  const { data: view1 } = await b.client.rpc('view_message', { p_message_id: onceMsg.id });
  check(view1?.ok === true, 'recipient opens it once');

  const { data: view2 } = await b.client.rpc('view_message', { p_message_id: onceMsg.id });
  check(view2?.ok === false && view2?.reason === 'used_up', 'second view refused', view2?.reason);

  const { data: thread } = await b.client.rpc('thread_messages', {
    p_match_id: matchId,
    p_limit: 10,
  });
  const spentRow = (thread ?? []).find((row) => row.id === onceMsg.id);
  check(spentRow?.spent === true, 'spent message is a tombstone');
  check(!spentRow?.media_path, 'spent message withholds its path');

  // ── Area 17 ─────────────────────────────────────────────
  console.log('\n── 17. Saving with Roses ───────────────');

  const { data: priced } = await a.client.rpc('send_message', {
    p_match_id: matchId,
    p_kind: 'photo',
    p_media_path: 'test/priced.jpg',
    p_retention: '24h',
    p_save_price: 20,
  });
  check(priced?.ok === true, 'send priced media');

  const { data: beforeA } = await admin
    .from('profiles')
    .select('roses')
    .eq('user_id', a.id)
    .single();

  const { data: saved } = await b.client.rpc('save_message', { p_message_id: priced.id });
  check(saved?.ok === true, 'recipient saves it', `paid ${saved?.paid}`);

  const { data: afterA } = await admin
    .from('profiles')
    .select('roses')
    .eq('user_id', a.id)
    .single();

  // 70% of 20 = 14 to the sender, the rest to the platform.
  check(afterA.roses - beforeA.roses === 14, 'sender got their share', `+${afterA.roses - beforeA.roses}`);

  const { data: saveTwice } = await b.client.rpc('save_message', { p_message_id: priced.id });
  check(saveTwice?.ok === false, 'cannot save the same item twice', saveTwice?.reason);

  const { data: unsendSaved } = await a.client.rpc('unsend_message', { p_message_id: priced.id });
  check(
    unsendSaved?.ok === false && unsendSaved?.reason === 'was_saved',
    'saved media cannot be unsent',
    unsendSaved?.reason
  );

  // ── Area 18 ─────────────────────────────────────────────
  console.log('\n── 18. Messaging tools ─────────────────');

  const { data: edited } = await a.client.rpc('edit_message', {
    p_message_id: sent.id,
    p_content: 'hello, edited',
  });
  check(edited?.ok === true, 'edit inside the window');

  const { data: editTheirs } = await b.client.rpc('edit_message', {
    p_message_id: sent.id,
    p_content: 'not mine',
  });
  check(editTheirs?.ok === false, 'cannot edit their message', editTheirs?.reason);

  const { error: reactError } = await b.client
    .from('message_reactions')
    .upsert({ message_id: sent.id, user_id: b.id, emoji: '❤️' });
  check(!reactError, 'react to a message', reactError?.message);

  const { data: unsent } = await a.client.rpc('unsend_message', { p_message_id: sent.id });
  check(unsent?.ok === true, 'unsend an unsaved message');

  // ── Area 13 ─────────────────────────────────────────────
  console.log('\n── 13. Close / Unmatch / Block ─────────');

  const { data: closed } = await a.client.rpc('close_conversation', { p_match_id: matchId });
  check(closed?.ok === true, 'close the conversation');

  const { data: afterClose } = await a.client.rpc('my_conversations');
  check(afterClose?.open === 0, 'slot freed', `${afterClose?.slots_left} left`);

  // Closed is not revivable — that is the rule the spec is explicit about.
  const { data: reviveClosed } = await a.client.rpc('request_revival', { p_match_id: matchId });
  check(
    reviveClosed?.ok === false && reviveClosed?.reason === 'not_expired',
    'closed conversation cannot be revived',
    reviveClosed?.reason
  );

  const { data: sendClosed } = await a.client.rpc('send_message', {
    p_match_id: matchId,
    p_kind: 'text',
    p_content: 'still there?',
  });
  check(sendClosed?.ok === false, 'closed conversation takes no messages', sendClosed?.reason);

  // ── Area 11 ─────────────────────────────────────────────
  console.log('\n── 11. Expired match revival ───────────');

  // Backdated so there is something genuinely expired to act on.
  await admin
    .from('matches')
    .update({
      state: 'expired',
      ended_at: new Date(Date.now() - 3600_000).toISOString(),
      expires_at: new Date(Date.now() - 3600_000).toISOString(),
    })
    .eq('id', matchId);

  const { data: expiredList } = await a.client.rpc('my_expired_matches');
  check((expiredList ?? []).length === 1, 'appears in the expired list');
  check(expiredList?.[0]?.cost === 5, 'cost reported', String(expiredList?.[0]?.cost));

  const { data: rosesBefore } = await admin
    .from('profiles')
    .select('roses')
    .eq('user_id', a.id)
    .single();

  const { data: asked } = await a.client.rpc('request_revival', { p_match_id: matchId });
  check(asked?.ok === true, 'request revival', `cost ${asked?.cost}`);

  const { data: rosesAfter } = await admin
    .from('profiles')
    .select('roses')
    .eq('user_id', a.id)
    .single();
  check(rosesBefore.roses - rosesAfter.roses === 5, 'Roses were spent');

  const { data: askedTwice } = await a.client.rpc('request_revival', { p_match_id: matchId });
  check(askedTwice?.ok === false, 'cannot ask twice', askedTwice?.reason);

  const { data: bList } = await b.client.rpc('my_expired_matches');
  check(bList?.[0]?.awaiting_me === true, 'recipient sees it awaiting them');

  // A decline must refund in full. This is the promise the whole
  // feature rests on.
  const { data: declined } = await b.client.rpc('answer_revival', {
    p_match_id: matchId,
    p_accept: false,
  });
  check(declined?.ok === true && declined?.accepted === false, 'decline');

  const { data: rosesRefunded } = await admin
    .from('profiles')
    .select('roses')
    .eq('user_id', a.id)
    .single();
  check(
    rosesRefunded.roses === rosesBefore.roses,
    'decline refunded in full',
    `${rosesBefore.roses} → ${rosesRefunded.roses}`
  );

  // And accepting gives a fresh window.
  await a.client.rpc('request_revival', { p_match_id: matchId });
  const { data: accepted } = await b.client.rpc('answer_revival', {
    p_match_id: matchId,
    p_accept: true,
  });
  check(accepted?.accepted === true, 'accept');

  const { data: revived } = await admin
    .from('matches')
    .select('state, expires_at, revival_count')
    .eq('id', matchId)
    .single();
  check(revived.state === 'pending', 'match is pending again');
  check(revived.revival_count === 1, 'revival counted');

  const hoursLeft = (new Date(revived.expires_at) - Date.now()) / 3600_000;
  check(hoursLeft > 71 && hoursLeft < 73, 'fresh 72-hour window', `${hoursLeft.toFixed(1)}h`);

  // ── Blocking ────────────────────────────────────────────
  console.log('\n── 13. Blocking ────────────────────────');

  const { data: blocked } = await a.client.rpc('block_user', { p_target: b.id });
  check(blocked?.ok === true, 'block');

  const { data: isBlocked } = await a.client.rpc('is_blocked', { p_a: a.id, p_b: b.id });
  check(isBlocked === true, 'is_blocked agrees');

  const { data: afterBlock } = await admin
    .from('matches')
    .select('state')
    .eq('id', matchId)
    .single();
  check(afterBlock.state === 'unmatched', 'blocking ended the match', afterBlock.state);

  const { data: blockList } = await a.client.rpc('my_blocks');
  check((blockList ?? []).length === 1, 'appears in my blocks');

  // The blocked person must not see the block.
  const { data: theirBlocks } = await b.client.rpc('my_blocks');
  check((theirBlocks ?? []).length === 0, 'blocked person is not told');

  const { data: expiredAfterBlock } = await a.client.rpc('my_expired_matches');
  check((expiredAfterBlock ?? []).length === 0, 'blocked pair leaves the expired list');

  const { data: unblocked } = await a.client.rpc('unblock_user', { p_target: b.id });
  check(unblocked?.ok === true, 'unblock');

  // ── Area 20 ─────────────────────────────────────────────
  console.log('\n── 20. Match media ─────────────────────');

  const { data: media } = await a.client.rpc('match_media', { p_match_id: matchId });
  const paths = (media ?? []).map((m) => m.media_path);
  check(paths.includes('test/priced.jpg'), 'saved media is listed');
  check(!paths.includes('test/fake.jpg'), 'consumed media is not listed');
} catch (error) {
  console.error('\nAborted:', error.message);
  fail += 1;
} finally {
  console.log('\nCleaning up…');
  await cleanup();
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail === 0 ? 0 : 1);
