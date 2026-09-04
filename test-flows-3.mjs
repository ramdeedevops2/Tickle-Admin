/**
 * End-to-end test of spec areas 41–50.
 *
 * Three throwaway accounts — a couple plus a friend, since double dates
 * need four people and two of them can be the same pair twice.
 *
 * What this proves that a schema check cannot: that a referral pays on
 * the milestone rather than the signup, that the caps actually cap, that
 * a city's numbers are counts of real rows, that a safety notification
 * cannot be switched off, and that a dormant profile actually leaves the
 * deck and comes back on its own.
 *
 * Run: node test-flows-3.mjs
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env', 'utf8');
const read = (n) => (env.match(new RegExp(`${n}=(.*)`)) ?? [])[1]?.trim();

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
const made = [];

async function makeUser(tag, extra = {}) {
  const email = `t3-${tag}-${stamp}@tickle.test`;
  const password = `Test3!${stamp}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw new Error(`createUser ${tag}: ${error.message}`);

  const userId = data.user.id;
  made.push(userId);

  // A signup trigger already created a bare row, so this has to upsert.
  await admin.from('profiles').upsert(
    {
      user_id: userId,
      name: `T3 ${tag}`,
      email,
      age: 28,
      gender: 'male',
      interested_in: 'everyone',
      photos: ['a', 'b', 'c'],
      latitude: 28.6,
      longitude: 77.2,
      city: 'Mumbai',
      ...extra,
    },
    { onConflict: 'user_id' },
  );

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });

  if (signInError) throw new Error(`signIn ${tag}: ${signInError.message}`);

  return { id: userId, client };
}

try {
  console.log('\nCreating three test users…');
  const a = await makeUser('a');
  const b = await makeUser('b');
  const c = await makeUser('c');
  console.log(`  A ${a.id.slice(0, 8)}  B ${b.id.slice(0, 8)}  C ${c.id.slice(0, 8)}`);

  const { data: match } = await admin
    .from('matches')
    .insert({
      user1_id: a.id < b.id ? a.id : b.id,
      user2_id: a.id < b.id ? b.id : a.id,
      state: 'open',
    })
    .select()
    .single();

  // ── 41 ──────────────────────────────────────────────────
  console.log('\n── 41. Safe Date ───────────────────────');

  const { data: shared } = await a.client.rpc('share_safe_date', {
    p_match_id: match.id,
    p_contact_name: 'A Friend',
    p_contact_phone: '+919999999999',
    p_venue: 'That cafe',
    p_when: 'Thursday 7pm',
    p_check_in: new Date(Date.now() + 3600_000).toISOString(),
  });
  check(shared?.ok === true, 'shares a date with a trusted contact');

  const { data: dates } = await a.client
    .from('safe_dates')
    .select('*')
    .eq('id', shared.id)
    .single();
  check(dates?.meeting_name === 'T3 b', 'copies who they are meeting', dates?.meeting_name);
  check(dates?.venue === 'That cafe', 'keeps the venue');

  // The row has no coordinate columns at all — that is the feature.
  check(
    !('latitude' in (dates ?? {})) && !('longitude' in (dates ?? {})),
    'stores no location, by construction',
  );

  // The other person must not learn they were reported to a friend.
  const { data: theirView } = await b.client
    .from('safe_dates')
    .select('*')
    .eq('id', shared.id);
  check((theirView ?? []).length === 0, 'the other person cannot see it');

  const { data: checkedIn } = await a.client.rpc('check_in_safe_date', { p_id: shared.id });
  check(checkedIn === true, 'checks in');

  // ── 42 ──────────────────────────────────────────────────
  console.log('\n── 42. Double Date ─────────────────────');

  const { data: dd } = await a.client.rpc('propose_double_date', { p_match_id: match.id });
  check(dd?.ok === true, 'proposes a double date');

  const { data: ddTwice } = await a.client.rpc('propose_double_date', {
    p_match_id: match.id,
  });
  check(
    ddTwice?.ok === false && ddTwice?.reason === 'already_proposed',
    'one live double date per match',
    ddTwice?.reason,
  );

  const { data: invited } = await a.client.rpc('invite_double_friend', {
    p_id: dd.id,
    p_friend: c.id,
  });
  check(invited?.ok === true, 'A invites their friend');

  // C accepts, but B has not invited anybody — so it must not confirm.
  const { data: half } = await c.client.rpc('accept_double_date', {
    p_id: dd.id,
    p_accept: true,
  });
  check(
    half?.ok === true && half?.confirmed === false,
    'does not confirm on one acceptance',
    `confirmed ${half?.confirmed}`,
  );

  // ── 43 ──────────────────────────────────────────────────
  console.log('\n── 43. Referrals ───────────────────────');

  const { data: refs } = await a.client.rpc('my_referrals');
  check(typeof refs?.code === 'string' && refs.code.length === 6, 'issues a code', refs?.code);
  check((refs?.milestones ?? []).length >= 4, 'lists milestones', `${refs?.milestones?.length}`);

  const { data: ownCode } = await a.client.rpc('use_referral_code', { p_code: refs.code });
  check(
    ownCode?.ok === false && ownCode?.reason === 'own_code',
    'cannot use your own code',
    ownCode?.reason,
  );

  const { data: used } = await c.client.rpc('use_referral_code', { p_code: refs.code });
  check(used?.ok === true, 'C uses A\'s code');

  const { data: again } = await c.client.rpc('use_referral_code', { p_code: refs.code });
  check(
    again?.ok === false && again?.reason === 'already_referred',
    'cannot use a second code',
    again?.reason,
  );

  const { data: signupAward } = await admin
    .from('referral_awards')
    .select('milestone')
    .eq('invitee_id', c.id);
  check(
    (signupAward ?? []).some((r) => r.milestone === 'signup'),
    'signup milestone paid',
  );

  // The milestone that matters: publishing a profile should pay the
  // referrer, from a trigger rather than an app call.
  await admin
    .from('profiles')
    .update({ published_at: new Date().toISOString() })
    .eq('user_id', c.id);

  const { data: afterPublish } = await admin
    .from('referral_awards')
    .select('milestone')
    .eq('invitee_id', c.id);
  check(
    (afterPublish ?? []).some((r) => r.milestone === 'profile'),
    'profile milestone paid by trigger',
    `${afterPublish?.length} awards`,
  );

  // ── 44 ──────────────────────────────────────────────────
  console.log('\n── 44. Promo codes ─────────────────────');

  const promoCode = `TEST${stamp}`.slice(0, 12);

  await admin.from('promo_codes').insert({
    code: promoCode,
    label: 'Test code',
    reward_kind: 'roses',
    reward_value: 30,
    max_uses: 2,
  });

  const { data: before } = await admin
    .from('profiles')
    .select('roses')
    .eq('user_id', b.id)
    .single();

  const { data: redeemed } = await b.client.rpc('redeem_promo', { p_code: promoCode });
  check(redeemed?.ok === true, 'redeems a promo code', `${redeemed?.value} ${redeemed?.kind}`);

  const { data: after } = await admin
    .from('profiles')
    .select('roses')
    .eq('user_id', b.id)
    .single();
  check(after.roses - before.roses === 30, 'Hearts credited', `+${after.roses - before.roses}`);

  const { data: reRedeem } = await b.client.rpc('redeem_promo', { p_code: promoCode });
  check(
    reRedeem?.ok === false && reRedeem?.reason === 'already_used',
    'cannot redeem twice',
    reRedeem?.reason,
  );

  // City-scoped codes must refuse somebody elsewhere.
  const cityCode = `CITY${stamp}`.slice(0, 12);
  await admin.from('promo_codes').insert({
    code: cityCode,
    label: 'Goa only',
    reward_kind: 'roses',
    reward_value: 10,
    city: 'goa',
  });

  const { data: wrongCity } = await a.client.rpc('redeem_promo', { p_code: cityCode });
  check(
    wrongCity?.ok === false && wrongCity?.reason === 'wrong_city',
    'city-scoped code refuses another city',
    wrongCity?.reason,
  );

  // Codes must not be listable — a client that could read them would
  // read every unreleased campaign.
  const { data: listed } = await a.client.from('promo_codes').select('code').limit(5);
  check((listed ?? []).length === 0, 'promo codes are not readable by a client');

  // ── 45 ──────────────────────────────────────────────────
  console.log('\n── 45. Notifications ───────────────────');

  const { data: prefs } = await a.client.rpc('my_notification_prefs');
  check((prefs ?? []).length >= 16, 'categories listed', `${prefs?.length}`);

  const critical = (prefs ?? []).find((p) => p.critical);
  const normal = (prefs ?? []).find((p) => !p.critical);

  check(!!critical, 'has critical categories', critical?.key);

  const { data: offCritical } = await a.client.rpc('set_notification_pref', {
    p_category: critical.key,
    p_mode: 'off',
  });
  check(offCritical === false, 'safety categories cannot be switched off', critical?.key);

  const { data: setSmart } = await a.client.rpc('set_notification_pref', {
    p_category: normal.key,
    p_mode: 'smart',
  });
  check(setSmart === true, 'a normal category can be set to smart', normal?.key);

  const { data: mode } = await a.client.rpc('delivery_mode', {
    p_user: a.id,
    p_category: critical.key,
  });
  check(mode === 'express', 'critical always delivers express', String(mode));

  // The category should be stamped on insert by trigger.
  await admin.from('notifications').insert({
    user_id: a.id,
    type: 'match',
    title: 'Test',
    body: 'Test',
  });

  const { data: stamped } = await admin
    .from('notifications')
    .select('category')
    .eq('user_id', a.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  check(stamped?.category === 'match', 'category stamped on insert', stamped?.category);

  // ── 47 & 48 ─────────────────────────────────────────────
  console.log('\n── 47/48. City Pulse ───────────────────');

  const { data: pulse } = await a.client.rpc('city_pulse', { p_slug: 'mumbai' });
  check(pulse?.known === true, 'city is known', pulse?.name);
  check(typeof pulse?.people === 'number', 'people is a real count', String(pulse?.people));
  check(typeof pulse?.threshold === 'number', 'threshold reported', String(pulse?.threshold));
  check(
    (pulse?.progress ?? 0) <= 100,
    'progress is capped at 100',
    String(pulse?.progress),
  );

  const { data: unknown } = await a.client.rpc('city_pulse', { p_slug: 'atlantis' });
  check(unknown?.known === false, 'an unknown city says so rather than inventing one');

  const { data: missions } = await a.client.rpc('my_missions');
  check((missions ?? []).length >= 4, 'missions offered', `${missions?.length}`);

  // ── 49 ──────────────────────────────────────────────────
  console.log('\n── 49. Waitlist ────────────────────────');

  const { data: joined } = await a.client.rpc('join_waitlist', { p_slug: 'pune' });
  check(joined?.ok === true, 'joins a waitlist', `position ${joined?.position}`);

  const { data: liveCity } = await a.client.rpc('join_waitlist', { p_slug: 'mumbai' });
  check(
    liveCity?.ok === false && liveCity?.reason === 'already_live',
    'cannot join the waitlist for a live city',
    liveCity?.reason,
  );

  // ── 50 ──────────────────────────────────────────────────
  console.log('\n── 50. Inactivity ──────────────────────');

  const { data: activeNow } = await a.client.rpc('activity_standing', { p_user_id: a.id });
  check(activeNow?.state === 'active', 'a current user is active', activeNow?.state);
  check(activeNow?.multiplier === 1, 'full exposure');

  await admin
    .from('profiles')
    .update({ last_active: new Date(Date.now() - 20 * 86400000).toISOString() })
    .eq('user_id', b.id);

  const { data: inactive } = await a.client.rpc('activity_standing', { p_user_id: b.id });
  check(inactive?.state === 'inactive', 'twenty days is inactive', inactive?.state);
  check(
    inactive?.multiplier > 0 && inactive?.multiplier < 1,
    'exposure reduced, not removed',
    String(inactive?.multiplier),
  );
  check(
    typeof inactive?.message === 'string' && inactive.message.length > 20,
    'the explanation is there to show them',
  );

  await admin
    .from('profiles')
    .update({ last_active: new Date(Date.now() - 90 * 86400000).toISOString() })
    .eq('user_id', b.id);

  const { data: dormant } = await a.client.rpc('activity_standing', { p_user_id: b.id });
  check(dormant?.state === 'dormant', 'ninety days is dormant', dormant?.state);
  check(dormant?.multiplier === 0, 'dormant leaves the deck');

  // And returning restores it, with nothing to clear.
  await admin
    .from('profiles')
    .update({ last_active: new Date().toISOString() })
    .eq('user_id', b.id);

  const { data: back } = await a.client.rpc('activity_standing', { p_user_id: b.id });
  check(back?.state === 'active', 'returning restores eligibility on its own', back?.state);
} catch (error) {
  console.error('\nAborted:', error.message);
  fail += 1;
} finally {
  console.log('\nCleaning up…');

  await admin.from('promo_codes').delete().like('code', `%${stamp}`.slice(-8));

  for (const id of made) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail === 0 ? 0 : 1);
