/**
 * Schema check for spec areas 11–20.
 *
 * Reads the service-role key from .env and asks the database whether
 * everything the migrations promised is actually there — functions,
 * tables, columns, jobs, RLS.
 *
 * It deliberately checks structure rather than behaviour. Behaviour
 * needs two signed-in people talking to each other, which is the device
 * test; what this catches is the failure that looks like nothing at all
 * — a migration that half-ran and a function that is simply absent
 * until the moment something calls it.
 *
 * Run: node verify-11-20.mjs
 */

import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const env = readFileSync('.env', 'utf8');
const read = (name) => (env.match(new RegExp(`${name}=(.*)`)) ?? [])[1]?.trim();

const url = read('NEXT_PUBLIC_SUPABASE_URL') ?? read('SUPABASE_URL');
const key = read('SUPABASE_SERVICE_ROLE_KEY') ?? read('SERVICE_ROLE_KEY');

if (!url || !key) {
  console.error('Could not read SUPABASE_URL / SERVICE_ROLE_KEY from .env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

let failures = 0;

const mark = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${label}${detail ? ` — ${detail}` : ''}`);
};

/**
 * Every check runs through one SQL entry point.
 *
 * PostgREST cannot query pg_catalog, so introspection needs a function.
 * Creating one temporarily is worse than asking the tables directly
 * where possible, so this only falls back to raw SQL where it must.
 */
async function tableExists(name) {
  const { error } = await supabase.from(name).select('*', { head: true, count: 'exact' }).limit(0);
  // 42P01 is "relation does not exist"; anything else means the table is
  // there and something else objected, which is not what we are testing.
  return !error || error.code !== '42P01';
}

async function functionExists(name, args = {}) {
  const { error } = await supabase.rpc(name, args);
  if (!error) return true;

  // PGRST202 is "function not found in schema cache". Everything else —
  // bad arguments, a raised exception, a null auth.uid() — proves the
  // function is present, which is all this asks.
  return error.code !== 'PGRST202';
}

console.log('\n── Tables ──────────────────────────────');

for (const name of [
  'blocks',
  'match_revivals',
  'retention_options',
  'glimpse_options',
  'message_hides',
  'message_reactions',
  'capture_events',
]) {
  mark(await tableExists(name), name);
}

console.log('\n── Functions ───────────────────────────');

const functions = [
  ['is_blocked', { p_a: '00000000-0000-0000-0000-000000000000', p_b: '00000000-0000-0000-0000-000000000001' }],
  ['my_blocks', {}],
  ['my_expired_matches', {}],
  ['my_conversations', {}],
  ['my_pending_matches', {}],
  ['my_top_emoji', { p_limit: 5 }],
  ['expire_stale_matches', {}],
  ['lapse_stale_revivals', {}],
  ['sweep_expired_messages', {}],
  ['match_media', { p_match_id: '00000000-0000-0000-0000-000000000000' }],
  ['thread_messages', { p_match_id: '00000000-0000-0000-0000-000000000000', p_limit: 1 }],
];

for (const [name, args] of functions) {
  mark(await functionExists(name, args), name);
}

console.log('\n── Columns ─────────────────────────────');

/** One row is enough to see the shape; zero rows still returns the keys. */
async function columnsOf(table, expected) {
  const { data, error } = await supabase.from(table).select(expected.join(',')).limit(1);

  if (error) {
    mark(false, `${table} columns`, error.message);
    return;
  }

  // With no rows there is nothing to inspect, but the select having
  // succeeded already proves every named column exists — PostgREST
  // rejects unknown ones.
  mark(true, `${table}: ${expected.length} columns`, data?.length ? '' : 'table empty');
}

await columnsOf('matches', ['state', 'ended_at', 'ended_by', 'revival_count']);
await columnsOf('messages', [
  'kind',
  'expires_at',
  'view_budget',
  'views_used',
  'glimpse_ms',
  'save_price',
  'saved_at',
  'edited_at',
  'unsent_at',
  'consumed_at',
]);
await columnsOf('plans', ['active_chat_limit', 'expired_history']);
await columnsOf('fairness_settings', [
  'revival_cost',
  'revival_max',
  'save_price_min',
  'save_price_max',
  'save_sender_share',
  'voice_max_seconds',
  'edit_window',
  'default_retention',
]);

console.log('\n── Seed data ───────────────────────────');

const { data: retention } = await supabase
  .from('retention_options')
  .select('key,label,duration,view_budget')
  .eq('active', true)
  .order('sort_order');

mark(
  (retention?.length ?? 0) >= 4,
  `retention options: ${retention?.length ?? 0}`,
  retention?.map((r) => r.key).join(', ')
);

const { data: glimpse } = await supabase
  .from('glimpse_options')
  .select('ms,label')
  .eq('active', true)
  .order('sort_order');

mark(
  (glimpse?.length ?? 0) >= 3,
  `glimpse options: ${glimpse?.length ?? 0}`,
  glimpse?.map((g) => g.label).join(', ')
);

const { data: plans } = await supabase.from('plans').select('key,active_chat_limit,expired_history');

for (const plan of plans ?? []) {
  mark(
    plan.active_chat_limit != null,
    `plan ${plan.key}`,
    `${plan.active_chat_limit} chats, ${plan.expired_history} history`
  );
}

console.log('\n── Match states ────────────────────────');

const { data: matches } = await supabase.from('matches').select('state');

const byState = {};
for (const row of matches ?? []) byState[row.state] = (byState[row.state] ?? 0) + 1;

console.log('       ', JSON.stringify(byState));

/*
 * A closed or unmatched row before anyone has used those features would
 * mean the 030 backfill misread the old columns.
 */
mark(
  !byState.closed && !byState.unmatched,
  'backfill did not invent closed/unmatched rows'
);

console.log('\n── Storage ─────────────────────────────');

const { data: buckets } = await supabase.storage.listBuckets();
const names = (buckets ?? []).map((b) => b.name);

mark(names.includes('chat-media'), 'chat-media bucket', names.join(', '));

const chatBucket = (buckets ?? []).find((b) => b.name === 'chat-media');
if (chatBucket) {
  // A public bucket would make every signed URL pointless — anyone with
  // the path could read an expired photo.
  mark(!chatBucket.public, 'chat-media is private');
}

console.log(
  failures === 0
    ? '\nAll structural checks passed.\n'
    : `\n${failures} check(s) failed.\n`
);

process.exit(failures === 0 ? 0 : 1);
