/**
 * End-to-end test of spec areas 51–58.
 *
 * Three throwaway accounts: one who reports, one who gets reported, and
 * an admin-shaped caller for the things only the service role may do.
 *
 * What this proves that a schema check cannot: that a reporter's
 * identity never comes back through a client read, that an internal
 * support note is invisible to the member it is about, that deletion is
 * a grace period rather than an immediate wipe, that an audit row
 * refuses to exist without a reason, that a refund cannot be taken
 * twice, and that revenue counts what was charged rather than today's
 * price.
 *
 * Run: node test-flows-4.mjs
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
  const email = `t4-${tag}-${stamp}@tickle.test`;
  const password = `Test4!${stamp}`;

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
      name: `T4 ${tag}`,
      email,
      age: 27,
      gender: 'male',
      interested_in: 'everyone',
      photos: ['a', 'b', 'c'],
      latitude: 28.6,
      longitude: 77.2,
      city: 'Mumbai',
      published_at: new Date().toISOString(),
      last_active: new Date().toISOString(),
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
  console.log('\nCreating test users…');
  const a = await makeUser('a');
  const b = await makeUser('b');
  console.log(`  A ${a.id.slice(0, 8)}  B ${b.id.slice(0, 8)}`);

  // ─── 51: reporting ─────────────────────────────────────
  console.log('\n51 — reporting and blocking');

  const { data: reasons } = await a.client.from('report_reasons').select('*').eq('active', true);

  check((reasons ?? []).length >= 10, 'ten or more report categories', `${reasons?.length ?? 0}`);
  check(
    (reasons ?? []).some((r) => r.urgent),
    'at least one category is marked urgent',
  );

  const reasonKey = reasons?.[0]?.key;

  const { error: reportError } = await a.client.from('reports').insert({
    reporter_id: a.id,
    reported_user_id: b.id,
    reason_key: reasonKey,
    reason: 'test report',
    detail: 'raised by the test suite',
  });

  check(!reportError, 'a member can file a report', reportError?.message);

  /*
   * The reporter must not be readable by the person reported.
   *
   * This is the one that matters. Everything else about reporting is
   * recoverable; somebody learning who reported them is not.
   */
  const { data: seenByB } = await b.client
    .from('reports')
    .select('reporter_id')
    .eq('reported_user_id', b.id);

  check(
    (seenByB ?? []).length === 0,
    'the reported person cannot read reports about them',
    `${seenByB?.length ?? 0} rows visible`,
  );

  // And the account keeps working until somebody decides otherwise.
  const { data: afterReport } = await admin
    .from('profiles')
    .select('suspended_at, published_at')
    .eq('user_id', b.id)
    .single();

  check(!afterReport?.suspended_at, 'a report alone does not suspend anybody');
  check(!!afterReport?.published_at, 'a report alone does not unpublish anybody');

  // ─── 52: content moderation ────────────────────────────
  console.log('\n52 — content moderation');

  const { data: policy } = await a.client.from('content_policy').select('*');

  check((policy ?? []).length > 0, 'a content policy exists and is readable');
  check(
    (policy ?? []).some((p) => p.allowed === true) &&
      (policy ?? []).some((p) => p.allowed === false),
    'the policy has both allowed and disallowed entries',
  );

  const { data: scan } = await a.client.rpc('scan_text', {
    p_text: 'add me on whatsapp 9876543210 and send 5000 rupees',
  });

  check((scan?.score ?? 0) > 0, 'the scanner scores a scam message', `score ${scan?.score}`);

  const { error: flagError } = await admin.from('content_flags').insert({
    owner_id: b.id,
    kind: 'photo',
    reason: 'test flag',
    target_path: 'photos/test.jpg',
  });

  check(!flagError, 'content can be flagged for review', flagError?.message);

  // ─── 53: deactivation and deletion ─────────────────────
  console.log('\n53 — leaving');

  const { data: deact } = await b.client.rpc('deactivate_account', { p_reason: 'break' });
  check(deact?.ok === true, 'a member can deactivate', JSON.stringify(deact));

  const { data: hidden } = await admin
    .from('profiles')
    .select('deactivated_at, published_at')
    .eq('user_id', b.id)
    .single();

  check(!!hidden?.deactivated_at, 'deactivating stamps the row');

  const { data: react } = await b.client.rpc('reactivate_account');
  check(react?.ok === true, 'and it reverses', JSON.stringify(react));

  const { data: backOn } = await admin
    .from('profiles')
    .select('deactivated_at')
    .eq('user_id', b.id)
    .single();

  check(!backOn?.deactivated_at, 'reactivating clears it — nothing was lost');

  const { data: found } = await b.client.rpc('found_someone');
  check(found?.ok === true, 'found someone is its own exit', JSON.stringify(found));

  await b.client.rpc('reactivate_account');

  const { data: del } = await b.client.rpc('request_deletion');
  check(del?.ok === true, 'deletion can be requested', JSON.stringify(del));

  const { data: pending } = await admin
    .from('profiles')
    .select('delete_requested_at')
    .eq('user_id', b.id)
    .single();

  check(!!pending?.delete_requested_at, 'deletion is a request, not an immediate wipe');

  const { data: stillThere } = await admin
    .from('profiles')
    .select('user_id')
    .eq('user_id', b.id)
    .maybeSingle();

  check(!!stillThere, 'the row survives the grace period so it can be undone');

  // Undo it, so later assertions are not fighting a pending deletion.
  await admin
    .from('profiles')
    .update({ delete_requested_at: null, deactivated_at: null })
    .eq('user_id', b.id);

  // ─── 54: support ───────────────────────────────────────
  console.log('\n54 — support');

  const { data: ticket } = await a.client.rpc('open_ticket', {
    p_category: 'technical',
    p_subject: 'Test ticket',
    p_body: 'Filed by the test suite, please ignore.',
  });

  check(ticket?.ok === true, 'a member can open a ticket', JSON.stringify(ticket));
  check(
    typeof ticket?.reference === 'string' && ticket.reference.length < 20,
    'the reference is short enough to read over a phone',
    ticket?.reference,
  );

  const ticketId = ticket?.id;

  // An internal note, written the way the admin route writes one.
  await admin.from('support_messages').insert({
    ticket_id: ticketId,
    body: 'Internal: do not show this to them.',
    from_admin: true,
    internal: true,
  });

  await admin.from('support_messages').insert({
    ticket_id: ticketId,
    body: 'A public reply.',
    from_admin: true,
    internal: false,
  });

  const { data: memberSees } = await a.client
    .from('support_messages')
    .select('body, internal')
    .eq('ticket_id', ticketId);

  check(
    (memberSees ?? []).every((m) => m.internal === false),
    'internal notes are invisible to the member',
    `${(memberSees ?? []).filter((m) => m.internal).length} leaked`,
  );

  check(
    (memberSees ?? []).some((m) => m.body === 'A public reply.'),
    'but the public reply is visible',
  );

  // ─── 56: payments ──────────────────────────────────────
  console.log('\n56 — payments');

  const { data: pack } = await admin
    .from('rose_packs')
    .select('*')
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (pack) {
    const receipt = `test-receipt-${stamp}`;

    const { data: credited } = await admin.rpc('credit_purchase', {
      p_user_id: a.id,
      p_pack_key: pack.key,
      p_receipt: receipt,
    });

    check(credited?.ok === true, 'a purchase credits', JSON.stringify(credited));

    // The same receipt again must not pay twice.
    const { data: replay } = await admin.rpc('credit_purchase', {
      p_user_id: a.id,
      p_pack_key: pack.key,
      p_receipt: receipt,
    });

    check(
      replay?.ok === false && replay?.reason === 'already_credited',
      'a replayed receipt does not credit twice',
      JSON.stringify(replay),
    );

    /*
     * The price has to be stored on the ledger row, not looked up
     * later — a pack whose price changes must not restate old sales.
     */
    const { data: ledgerRow } = await admin
      .from('rose_ledger')
      .select('pack_key, price_minor, currency')
      .eq('note', receipt)
      .maybeSingle();

    check(
      ledgerRow?.price_minor === pack.price_minor,
      'the price is stamped as charged',
      `${ledgerRow?.price_minor} vs ${pack.price_minor}`,
    );

    check(ledgerRow?.pack_key === pack.key, 'and so is which pack it was');
  } else {
    console.log('  ..    no active Heart pack, skipping purchase checks');
  }

  const { data: plan } = await admin
    .from('premium_plans')
    .select('*')
    .eq('active', true)
    .limit(1)
    .maybeSingle();

  if (plan) {
    const preceipt = `test-premium-${stamp}`;

    const { data: bought } = await admin.rpc('credit_premium', {
      p_user_id: a.id,
      p_plan_key: plan.key,
      p_receipt: preceipt,
    });

    check(bought?.ok === true, 'premium credits', JSON.stringify(bought));

    const { data: refunded } = await admin.rpc('refund_premium', {
      p_receipt: preceipt,
      p_reason: 'test refund',
    });

    check(refunded?.ok === true, 'and can be refunded', JSON.stringify(refunded));

    const { data: twice } = await admin.rpc('refund_premium', {
      p_receipt: preceipt,
      p_reason: 'test refund again',
    });

    check(
      twice?.ok === false && twice?.reason === 'already_refunded',
      'a refund cannot be taken twice',
      JSON.stringify(twice),
    );

    const { data: noReason } = await admin.rpc('refund_premium', {
      p_receipt: preceipt,
      p_reason: '',
    });

    check(noReason?.ok === false, 'and needs a reason', JSON.stringify(noReason));

    // The receipt stays, so it cannot be credited again after a refund.
    const { data: recredit } = await admin.rpc('credit_premium', {
      p_user_id: a.id,
      p_plan_key: plan.key,
      p_receipt: preceipt,
    });

    check(
      recredit?.ok === false && recredit?.reason === 'already_credited',
      'a refunded receipt is still not creditable',
      JSON.stringify(recredit),
    );
  } else {
    console.log('  ..    no active premium plan, skipping premium checks');
  }

  // ─── 57: the admin platform ────────────────────────────
  console.log('\n57 — admin platform');

  const { data: perms } = await admin.from('admin_permissions').select('*');
  check((perms ?? []).length > 0, 'permissions exist as rows, not as an enum');

  const { data: roles } = await admin.from('admin_roles').select('*');
  check((roles ?? []).length > 0, 'roles exist as rows');
  check(
    (roles ?? []).some((r) => r.is_super),
    'one role is super',
  );

  /*
   * An audit row without a reason must not be possible. It is the
   * difference between a trail and a list of timestamps.
   */
  const { error: noReasonAudit } = await admin.rpc('record_admin_action', {
    p_admin_id: a.id,
    p_admin_email: 'test@tickle.test',
    p_action: 'test.action',
    p_target_type: 'profile',
    p_target_id: b.id,
    p_reason: '',
    p_before: null,
    p_after: null,
  });

  check(!!noReasonAudit, 'an audit row refuses to exist without a reason');

  const { data: auditId } = await admin.rpc('record_admin_action', {
    p_admin_id: a.id,
    p_admin_email: 'test@tickle.test',
    p_action: 'test.action',
    p_target_type: 'profile',
    p_target_id: b.id,
    p_reason: 'written by the test suite',
    p_before: { roses: 1 },
    p_after: { roses: 2 },
  });

  check(!!auditId, 'and records one with a reason');

  const { data: auditRow } = await admin
    .from('admin_audit')
    .select('before_state, after_state, reason')
    .eq('id', auditId)
    .maybeSingle();

  check(
    auditRow?.before_state?.roses === 1 && auditRow?.after_state?.roses === 2,
    'the before and after are both kept',
  );

  // Revenue, over a window that includes the purchases just made.
  const { data: revenue } = await admin.rpc('revenue_summary', {
    p_from: new Date(Date.now() - 86400000).toISOString(),
    p_to: new Date(Date.now() + 86400000).toISOString(),
  });

  check(revenue !== null, 'revenue summarises');
  check(
    typeof revenue?.net_minor === 'number' &&
      revenue.net_minor === revenue.gross_minor - revenue.refunded_minor,
    'net is gross minus refunds, not gross relabelled',
    `${revenue?.gross_minor} - ${revenue?.refunded_minor} = ${revenue?.net_minor}`,
  );

  /*
   * Net must not go negative from ordinary sales-and-refunds.
   *
   * The first version of revenue_summary excluded refunded sales from
   * gross *and* subtracted them again, so one refund made net negative.
   * The equality above still held, which is exactly why it needs this
   * second assertion beside it.
   */
  check(revenue?.net_minor >= 0, 'net is not negative', `${revenue?.net_minor}`);

  check(
    revenue?.gross_minor >= revenue?.refunded_minor,
    'gross includes refunded sales, so a refund cannot exceed it',
    `${revenue?.gross_minor} >= ${revenue?.refunded_minor}`,
  );

  const { data: dau } = await admin.rpc('active_users', {
    p_since: new Date(Date.now() - 86400000).toISOString(),
  });
  const { data: mau } = await admin.rpc('active_users', {
    p_since: new Date(Date.now() - 30 * 86400000).toISOString(),
  });

  check(dau <= mau, 'DAU never exceeds MAU', `${dau} <= ${mau}`);

  // Campaign segments.
  const { data: everyone } = await admin.rpc('audience_size', { p_audience: 'everyone' });
  const { data: unpublished } = await admin.rpc('audience_size', {
    p_audience: 'unpublished',
  });

  check(typeof everyone === 'number' && everyone > 0, 'a segment can be sized', `${everyone}`);
  check(unpublished <= everyone, 'a narrower segment is never larger', `${unpublished} <= ${everyone}`);

  const { error: badAudience } = await admin.rpc('send_broadcast', {
    p_title: 'test',
    p_body: 'test',
    p_audience: 'nonsense-segment',
    p_sent_by: null,
  });

  check(!!badAudience, 'an unknown audience reaches nobody rather than everybody');

  // A suspended account is excluded from every segment.
  await admin
    .from('profiles')
    .update({ suspended_at: new Date().toISOString() })
    .eq('user_id', b.id);

  const { data: afterSuspend } = await admin.rpc('audience_size', { p_audience: 'everyone' });

  check(
    afterSuspend === everyone - 1,
    'a suspended account leaves every segment',
    `${everyone} → ${afterSuspend}`,
  );

  await admin.from('profiles').update({ suspended_at: null }).eq('user_id', b.id);

  // ─── 58: data philosophy ───────────────────────────────
  console.log('\n58 — data philosophy');

  const { data: retention } = await admin.from('retention_policy').select('*');
  check((retention ?? []).length > 0, 'the retention policy is written down as rows');

  /*
   * Paths Crossed must not let somebody's week be replayed. It returns
   * a coarse bucket — 'today', 'this week', 'recently' — and a count,
   * never a timestamp or a coordinate.
   *
   * Checked on the shape the caller actually receives, since that is
   * what would leak.
   */
  const { data: paths } = await a.client.rpc('paths_crossed', { p_limit: 5 });

  const pathKeys = Object.keys(paths?.[0] ?? {});

  if (pathKeys.length > 0) {
    check(
      !pathKeys.some((k) => /lat|lng|longitude|latitude|created_at|_at$/i.test(k)),
      'Paths Crossed returns no coordinates or timestamps',
      pathKeys.join(', '),
    );
    check(
      !/\d{4}-\d{2}-\d{2}/.test(String(paths[0].when_coarse ?? '')),
      'and when is a bucket, never a date',
      String(paths[0].when_coarse),
    );
  } else {
    console.log('  ..    no crossings for this account, nothing to inspect');
  }

  // An empty window must answer zero rather than null — a dashboard
  // that renders "null" for a quiet day looks broken.
  const { data: quiet } = await admin.rpc('revenue_summary', {
    p_from: new Date(Date.now() + 86400000).toISOString(),
    p_to: new Date(Date.now() + 2 * 86400000).toISOString(),
  });

  check(quiet?.gross_minor === 0, 'an empty window answers zero, not null', `${quiet?.gross_minor}`);
} catch (error) {
  console.error('\nAborted:', error.message);
  fail += 1;
} finally {
  console.log('\nCleaning up…');

  for (const id of made) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
}

console.log(`\n${pass} passed, ${fail} failed.\n`);
process.exit(fail === 0 ? 0 : 1);
