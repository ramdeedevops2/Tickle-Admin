const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const moduleValue = { exports: {} };
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/pathsSettings.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module: moduleValue, exports: moduleValue.exports });
const { PATHS_DEFAULTS: defaults, parsePathsSettingsPatch: parse, pathsFeedControlsReady: ready } = moduleValue.exports;
assert.equal(ready(defaults), true);
assert.equal(ready({ crossing_radius_m: 100 }), false);
for (const value of [null, '', false, -1, 3651, 1.5]) assert.throws(() => parse({ history_days: value }, defaults));
assert.equal(parse({ history_days: 0 }, defaults).history_days, 0, 'Admin can include all stored days');
assert.equal(parse({ history_days: 365 }, defaults).history_days, 365);
for (const key of ['respect_gender_preference', 'hide_liked', 'hide_passed']) {
  assert.equal(parse({ [key]: false }, defaults)[key], false);
  assert.throws(() => parse({ [key]: 'false' }, defaults));
}
assert.throws(() => parse({ feed_limit: 201 }, defaults));
assert.throws(() => parse({ sort_order: 'sql' }, defaults));
assert.equal(parse({ sort_order: 'most_recent' }, defaults).sort_order, 'most_recent');
assert.throws(() => parse({ crossing_radius_m: 20 }, defaults), 'Partial PATCH must check the saved accuracy');
assert.throws(() => parse({ max_accuracy_m: 300 }, defaults));
assert.equal(parse({ crossing_radius_m: 200, max_accuracy_m: 300 }, defaults).max_accuracy_m, 300);
assert.throws(() => parse({ history_days: 30, hide_liked: null }, defaults));
console.log('PASS admin feed controls, all-days option, boolean types, bounds and partial-update GPS validation');

// Exercise the real route with a synthetic authenticated service client.
function routeFixture(current = defaults, denied = false) {
  const writes = [];
  const permissions = [];
  let reads = 0;
  const json = (body, options) => ({ body, status: options?.status || 200 });
  const denial = json({ error: 'Denied' }, { status: 403 });
  const client = {
    rpc: async () => ({ error: null }),
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => { reads++; return { data: current, error: null }; } }) }),
      update: patch => ({ eq: async () => { writes.push(patch); return { error: null }; } }),
    }),
  };
  const modules = {
    'next/server': { NextResponse: { json } },
    '@/lib/pathsSettings': moduleValue.exports,
    '@/lib/supabase/admin': {
      requireAdmin: async (_request, permission) => {
        permissions.push(permission);
        return denied ? { error: denial } : { supabase: client, user: { id: 'test-admin' } };
      },
      failed: (_error, message) => json({ error: message }, { status: 500 }),
    },
  };
  const routeModule = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/api/paths-settings/route.ts', 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { module: routeModule, exports: routeModule.exports, require: name => {
    assert.ok(Object.hasOwn(modules, name), `Unexpected dependency ${name}`);
    return modules[name];
  } });
  return { ...routeModule.exports, writes, permissions, reads: () => reads };
}

(async () => {
  const request = body => ({ json: async () => body });
  const denied = routeFixture(defaults, true);
  assert.equal((await denied.GET(request())).status, 403);
  assert.equal((await denied.PATCH(request({ history_days: 0 }))).status, 403);
  assert.equal(denied.reads(), 0, 'denial prevents database access');
  assert.equal(denied.writes.length, 0);
  assert.ok(denied.permissions.every(permission => permission === 'page.geo'));

  const legacy = routeFixture({ crossing_radius_m: 100, max_accuracy_m: 150,
    max_time_gap_min: 15, ping_retention_hours: 24, share_deck_budget: false });
  const legacyGet = await legacy.GET(request());
  assert.equal(legacyGet.body.feed_controls_ready, false);
  assert.equal((await legacy.PATCH(request({ history_days: 0 }))).status, 409);
  assert.equal(legacy.writes.length, 0, 'no write before migration');
  assert.equal((await legacy.PATCH(request({ max_time_gap_min: 20 }))).status, 200,
    'existing controls still save before migration');

  const ready = routeFixture({ ...defaults, extra_internal_column: 'not returned' });
  const get = await ready.GET(request());
  assert.equal(get.body.feed_controls_ready, true);
  assert.equal(get.body.settings.extra_internal_column, undefined);
  assert.equal((await ready.PATCH(request({ history_days: 0, hide_liked: false, sort_order: 'most_recent' }))).status, 200);
  assert.equal(ready.writes[0].history_days, 0);
  assert.equal(ready.writes[0].hide_liked, false);
  assert.equal(ready.writes[0].sort_order, 'most_recent');
  const before = ready.writes.length;
  for (const body of [{ crossing_radius_m: 20 }, { history_days: '' }, { hide_passed: 'false' }, null]) {
    assert.equal((await ready.PATCH(request(body))).status, 400);
  }
  assert.equal(ready.writes.length, before, 'invalid updates never write');
  console.log('PASS settings API permissions, migration guard, legacy compatibility, saved feed rules and invalid-update rejection');
})().catch(error => { console.error(error); process.exitCode = 1; });
