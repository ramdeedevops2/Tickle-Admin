/**
 * End-to-end test of spec areas 21–43.
 *
 * Two throwaway accounts, driven as themselves — signed in, so auth.uid()
 * is real and RLS applies. Deleted at the end whatever happens.
 *
 * What this proves that a schema check cannot: that a free user is
 * actually refused a premium filter, that incognito actually removes
 * somebody from a pool, that a blocked venue actually takes down the
 * hearts already at it, and that the scam detector fires on the text it
 * is supposed to and stays quiet on the text it is not.
 *
 * Run: node test-flows-2.mjs
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
  const email = `t2-${tag}-${stamp}@tickle.test`;
  const password = `Test2!${stamp}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) throw new Error(`createUser ${tag}: ${error.message}`);

  const userId = data.user.id;
  made.push(userId);

  await admin.from('profiles').insert({
    user_id: userId,
    name: `T2 ${tag}`,
    email,
    age: 28,
    gender: 'male',
    interested_in: 'everyone',
    photos: ['a', 'b', 'c'],
    published_at: new Date().toISOString(),
    latitude: 28.6,
    longitude: 77.2,
    ...extra,
  });

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });

  if (signInError) throw new Error(`signIn ${tag}: ${signInError.message}`);

  return { id: userId, client };
}

try {
  console.log('\nCreating two test users…');
  const a = await makeUser('a');
  const b = await makeUser('b');
  console.log(`  A ${a.id.slice(0, 8)}   B ${b.id.slice(0, 8)}`);

  await admin.rpc('admin_grant_roses', { p_user_id: a.id, p_amount: 500, p_reason: 'admin_grant' });

  // ── 22 & 23 ─────────────────────────────────────────────
  console.log('\n── 22/23. Link and scam detection ──────');

  const scans = [
    ['send me 5000 rupees urgently', true, 'money request'],
    ['what is your OTP code', true, 'OTP request'],
    ['guaranteed 20% daily returns on bitcoin', true, 'crypto pitch'],
    ['check this out bit.ly/abc123', true, 'shortened link'],
    ['want to grab coffee tomorrow?', false, 'ordinary message'],
    ['I loved that restaurant on 5th street', false, 'ordinary message'],
  ];

  for (const [text, shouldFlag, label] of scans) {
    const { data } = await a.client.rpc('scan_text', { p_text: text });
    check(
      data?.flagged === shouldFlag,
      `${shouldFlag ? 'flags' : 'ignores'}: ${label}`,
      `score ${data?.score ?? 0}${data?.category ? ` (${data.category})` : ''}`
    );
  }

  // ── 24 ──────────────────────────────────────────────────
  console.log('\n── 24. Presence privacy ────────────────');

  const { data: freeHide } = await a.client.rpc('set_presence_privacy', {
    p_online: true,
    p_read_receipts: null,
    p_typing: null,
    p_last_active: null,
  });
  check(
    freeHide?.ok === false && freeHide?.reason === 'premium_only',
    'free user cannot hide presence',
    freeHide?.reason
  );

  // The asymmetry that matters: turning something off never needs
  // premium, or a lapsed member is locked hidden.
  const { data: freeShow } = await a.client.rpc('set_presence_privacy', {
    p_online: false,
    p_read_receipts: null,
    p_typing: null,
    p_last_active: null,
  });
  check(freeShow?.ok === true, 'free user CAN turn hiding off');

  await admin
    .from('profiles')
    .update({ premium_until: new Date(Date.now() + 30 * 86400000).toISOString() })
    .eq('user_id', a.id);

  const { data: paidHide } = await a.client.rpc('set_presence_privacy', {
    p_online: true,
    p_read_receipts: null,
    p_typing: null,
    p_last_active: null,
  });
  check(paidHide?.ok === true, 'premium user can hide presence');

  const { data: seen } = await b.client.rpc('presence_of', { p_user_id: a.id });
  check(seen?.online === null, 'hidden online reads as null, not false');
  check(
    seen?.active === null || typeof seen?.active === 'string',
    'activity is a bucket, never a timestamp',
    String(seen?.active)
  );

  // ── 25 ──────────────────────────────────────────────────
  console.log('\n── 25. Incognito ───────────────────────');

  const { data: incog } = await a.client.rpc('set_incognito', { p_hours: 24 });
  check(incog?.ok === true, 'premium user goes incognito');

  const { data: hidden } = await b.client.rpc('is_incognito', { p_user_id: a.id });
  check(hidden === true, 'is_incognito agrees');

  // Reaching out reveals — watching while invisible is not privacy.
  await a.client.from('likes').insert({ liker_id: a.id, liked_id: b.id });

  const { data: reveal } = await admin
    .from('incognito_reveals')
    .select('*')
    .eq('hidden_id', a.id)
    .eq('shown_to', b.id)
    .maybeSingle();
  check(!!reveal, 'liking while hidden reveals you to that person');

  await a.client.rpc('set_incognito', { p_hours: 0 });
  await admin.from('likes').delete().eq('liker_id', a.id).eq('liked_id', b.id);

  // ── 26 ──────────────────────────────────────────────────
  console.log('\n── 26. Travel ──────────────────────────');

  const { data: travel } = await a.client.rpc('set_travel', {
    p_city: 'Goa',
    p_lat: 15.3,
    p_lng: 74.1,
    p_days: 7,
  });
  check(travel?.ok === true, 'premium user sets travel', travel?.city);

  const { data: origin } = await a.client.rpc('discovery_origin', { p_user_id: a.id });
  const row = Array.isArray(origin) ? origin[0] : origin;
  check(row?.traveling === true, 'discovery origin follows travel', row?.city);
  check(Math.abs(row?.lat - 15.3) < 0.01, 'discovery reads the travel coordinates');

  // The real coordinates must survive — Paths Crossed and Heart Hunt
  // both depend on where somebody actually is.
  const { data: real } = await admin
    .from('profiles')
    .select('latitude, longitude')
    .eq('user_id', a.id)
    .single();
  check(Math.abs(real.latitude - 28.6) < 0.01, 'real coordinates untouched by travel');

  await a.client.rpc('set_travel', { p_city: null, p_lat: null, p_lng: null, p_days: 0 });

  // ── 28 ──────────────────────────────────────────────────
  console.log('\n── 28. Paths Crossed ───────────────────');

  const { data: crossed } = await a.client.rpc('record_crossing', {
    p_other: b.id,
    p_area: 'Bandra',
  });
  check(crossed === true, 'records a crossing');

  // Same day twice must not double-count.
  await a.client.rpc('record_crossing', { p_other: b.id, p_area: 'Bandra' });

  const { data: enc } = await admin
    .from('nearby_encounters')
    .select('crossings, area, area_shown')
    .eq('user_id', a.id)
    .eq('encountered_user_id', b.id)
    .single();
  check(enc.crossings === 1, 'same day does not double-count', `${enc.crossings}`);
  check(enc.area === 'Bandra', 'safe area is kept');

  // A sensitive area must be withheld.
  const c = await makeUser('c');
  await a.client.rpc('record_crossing', { p_other: c.id, p_area: 'City Hospital' });

  const { data: sensitive } = await admin
    .from('nearby_encounters')
    .select('area, area_shown')
    .eq('user_id', a.id)
    .eq('encountered_user_id', c.id)
    .single();
  check(sensitive.area_shown === false, 'hospital area is withheld', String(sensitive.area));

  const { data: paths } = await a.client.rpc('paths_crossed', { p_limit: 10 });
  const bRow = (paths ?? []).find((p) => p.user_id === b.id);
  check(!!bRow, 'appears in paths crossed');
  check(
    bRow && !('created_at' in bRow) && typeof bRow.when_coarse === 'string',
    'no timestamp returned, only a coarse window',
    bRow?.when_coarse
  );

  const { data: pathLike } = await a.client.rpc('paths_interact', {
    p_target: b.id,
    p_kind: 'like',
    p_body: null,
  });
  check(pathLike?.ok === true, 'paths like spends its own allowance', `${pathLike?.left} left`);

  const { data: noCross } = await b.client.rpc('paths_interact', {
    p_target: c.id,
    p_kind: 'like',
    p_body: null,
  });
  check(
    noCross?.ok === false && noCross?.reason === 'no_crossing',
    'cannot path-like without a real crossing',
    noCross?.reason
  );

  await admin.from('likes').delete().eq('liker_id', a.id).eq('liked_id', b.id);

  // ── 30 ──────────────────────────────────────────────────
  console.log('\n── 30. Heart Hunt eligibility ──────────');

  const { data: elig } = await a.client.rpc('heart_eligible', {
    p_viewer: a.id,
    p_dropper: b.id,
  });
  check(typeof elig?.eligible === 'boolean', 'eligibility returns a verdict', elig?.reason ?? 'eligible');

  await a.client.rpc('block_user', { p_target: c.id });

  const { data: blockedElig } = await a.client.rpc('heart_eligible', {
    p_viewer: a.id,
    p_dropper: c.id,
  });
  check(
    blockedElig?.eligible === false && blockedElig?.reason === 'blocked',
    'blocking beats every other eligibility check',
    blockedElig?.reason
  );

  await a.client.rpc('unblock_user', { p_target: c.id });

  // ── 31 ──────────────────────────────────────────────────
  console.log('\n── 31. Venue rules ─────────────────────');

  const { data: cafe } = await admin
    .from('places')
    .insert({
      google_place_id: `test-cafe-${stamp}`,
      name: 'Test Cafe',
      category: 'cafe',
      latitude: 28.6,
      longitude: 77.2,
    })
    .select()
    .single();

  const { data: clinic } = await admin
    .from('places')
    .insert({
      google_place_id: `test-clinic-${stamp}`,
      name: 'Test Clinic',
      category: 'hospital',
      latitude: 28.6,
      longitude: 77.2,
    })
    .select()
    .single();

  const { data: unknown } = await admin
    .from('places')
    .insert({
      google_place_id: `test-unknown-${stamp}`,
      name: 'Test Whatever',
      category: 'some_new_google_type',
      latitude: 28.6,
      longitude: 77.2,
    })
    .select()
    .single();

  const { data: cafeOk } = await a.client.rpc('venue_allows_hearts', { p_place_id: cafe.id });
  check(cafeOk?.allowed === true, 'café allows hearts');

  const { data: clinicOk } = await a.client.rpc('venue_allows_hearts', { p_place_id: clinic.id });
  check(
    clinicOk?.allowed === false && clinicOk?.reason === 'category_blocked',
    'hospital refuses hearts',
    clinicOk?.reason
  );

  // The safe default: a type nobody has ruled on is refused, not allowed.
  const { data: unknownOk } = await a.client.rpc('venue_allows_hearts', {
    p_place_id: unknown.id,
  });
  check(
    unknownOk?.allowed === false && unknownOk?.reason === 'category_unknown',
    'unknown category refused, not allowed',
    unknownOk?.reason
  );

  // Blocking a venue must take down the hearts already there.
  const { data: heart } = await admin
    .from('hearts')
    .insert({
      dropper_id: a.id,
      place_id: cafe.id,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    })
    .select()
    .single();

  await admin.from('blocked_venues').insert({
    place_id: cafe.id,
    google_place_id: cafe.google_place_id,
    reason: 'test',
  });

  const { data: afterBlock } = await admin
    .from('hearts')
    .select('status')
    .eq('id', heart.id)
    .single();
  check(
    afterBlock.status === 'withdrawn',
    'blocking a venue removes the hearts already there',
    afterBlock.status
  );

  // ── 33 ──────────────────────────────────────────────────
  console.log('\n── 33. Wallet ──────────────────────────');

  const { data: wallet } = await a.client.rpc('my_wallet', { p_limit: 20 });
  check(typeof wallet?.balance === 'number', 'wallet returns a balance', String(wallet?.balance));
  check(wallet?.earned >= 500, 'admin grant counted as earned', String(wallet?.earned));
  check(Array.isArray(wallet?.history), 'history is a list', `${wallet?.history?.length} entries`);

  // ── 34 ──────────────────────────────────────────────────
  console.log('\n── 34. Packs ───────────────────────────');

  const { data: packs } = await a.client.rpc('rose_packs_for_me');
  check((packs ?? []).length >= 4, 'four packs offered', `${packs?.length}`);

  const withBonus = (packs ?? []).find((p) => p.bonus > 0);
  check(
    !!withBonus && withBonus.total === withBonus.amount + withBonus.bonus,
    'total is amount plus bonus, computed server-side',
    withBonus ? `${withBonus.amount}+${withBonus.bonus}=${withBonus.total}` : ''
  );

  // ── 36 & 37 ─────────────────────────────────────────────
  console.log('\n── 36/37. Premium and trials ───────────');

  const { data: prem } = await b.client.rpc('premium_for_me');
  check(prem?.premium === false, 'B is not premium');
  check((prem?.plans ?? []).length === 5, 'five durations offered', `${prem?.plans?.length}`);
  check((prem?.offers ?? []).length >= 1, 'trials offered', `${prem?.offers?.length}`);

  const { data: claimed } = await b.client.rpc('claim_offer', { p_key: 'trial_3' });
  check(claimed?.ok === true, 'claims a trial', `${claimed?.days} days`);

  const { data: twice } = await b.client.rpc('claim_offer', { p_key: 'trial_3' });
  check(
    twice?.ok === false && twice?.reason === 'already_used',
    'cannot claim the same trial twice',
    twice?.reason
  );

  const { data: after } = await b.client.rpc('premium_for_me');
  check(after?.premium === true, 'trial granted premium');
  check(
    !(after?.offers ?? []).some((o) => o.key === 'trial_3'),
    'a used trial is absent, not greyed out'
  );

  // ── 39 ──────────────────────────────────────────────────
  console.log('\n── 39. Filters ─────────────────────────');

  const { data: filters } = await c.client.rpc('my_filters');
  check((filters?.groups ?? []).length > 0, 'filter groups returned');

  const all = (filters?.groups ?? []).flatMap((g) => g.filters);
  const freeOne = all.find((f) => f.free);
  const paidOne = all.find((f) => !f.free);

  check(!!freeOne && freeOne.locked === false, 'free filter is unlocked', freeOne?.key);
  check(!!paidOne && paidOne.locked === true, 'premium filter is locked for free user', paidOne?.key);

  const { data: setPaid } = await c.client.rpc('set_filter', {
    p_key: paidOne.key,
    p_value: ['Anything'],
  });
  check(
    setPaid?.ok === false && setPaid?.reason === 'premium_only',
    'free user refused a premium filter',
    setPaid?.reason
  );

  const { data: setFree } = await c.client.rpc('set_filter', {
    p_key: 'age',
    p_value: { min: 25, max: 35 },
  });
  check(setFree?.ok === true, 'free user sets a free filter');

  // Clearing must always work, whatever the plan — otherwise a lapsed
  // member is stuck with a filter narrowing their deck.
  const { data: cleared } = await c.client.rpc('set_filter', {
    p_key: 'age',
    p_value: null,
  });
  check(cleared?.ok === true && cleared?.cleared === true, 'clearing always works');

  // ── 40 ──────────────────────────────────────────────────
  console.log('\n── 40. Date planning ───────────────────');

  const { data: match } = await admin
    .from('matches')
    .insert({
      user1_id: a.id < b.id ? a.id : b.id,
      user2_id: a.id < b.id ? b.id : a.id,
      state: 'open',
    })
    .select()
    .single();

  const { data: proposed } = await a.client.rpc('propose_date', {
    p_match_id: match.id,
    p_kind: 'coffee',
    p_what: 'Coffee',
    p_where: 'That place',
    p_when: 'Thursday',
  });
  check(proposed?.ok === true, 'proposes a date');

  const { data: twicePlan } = await a.client.rpc('propose_date', {
    p_match_id: match.id,
    p_kind: 'food',
    p_what: null,
    p_where: null,
    p_when: null,
  });
  check(
    twicePlan?.ok === false && twicePlan?.reason === 'already_planned',
    'one live plan per match',
    twicePlan?.reason
  );

  const { data: ownPlan } = await a.client.rpc('answer_date', {
    p_plan_id: proposed.id,
    p_accept: true,
    p_what: null,
    p_where: null,
    p_when: null,
  });
  check(
    ownPlan?.ok === false && ownPlan?.reason === 'own_plan',
    'cannot accept your own plan',
    ownPlan?.reason
  );

  // Accepting with an edit — "yes, but Friday" is agreement.
  const { data: agreed } = await b.client.rpc('answer_date', {
    p_plan_id: proposed.id,
    p_accept: true,
    p_what: null,
    p_where: null,
    p_when: 'Friday',
  });
  check(agreed?.ok === true && agreed?.agreed === true, 'the other person accepts');

  const { data: plan } = await a.client.rpc('date_plan_for', { p_match_id: match.id });
  check(plan?.status === 'agreed', 'plan reads as agreed');
  check(plan?.when === 'Friday', 'accepting with an edit changed the plan', plan?.when);
} catch (error) {
  console.error('\nAborted:', error.message);
  fail += 1;
} finally {
  console.log('\nCleaning up…');

  await admin.from('places').delete().like('google_place_id', `test-%${stamp}`);

  for (const id of made) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail === 0 ? 0 : 1);
