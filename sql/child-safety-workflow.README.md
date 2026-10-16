# Child Safety admin workflow

Run `child-safety-workflow.sql` in Supabase SQL Editor, then deploy Tickle-Admin.
No production SQL was executed automatically. Open **Moderation > Child safety**
(`/safety?view=child-safety`). Access requires the existing `moderation.act` grant.

The designated person reviews incoming child-safety reports, opens a case, takes
ownership, records findings and references to restricted evidence, and takes the
appropriate containment action. An urgent Child safety or exploitation category
is added to the app's database-driven reporting form by this SQL.

The tab records an authority submission's name, receipt/reference and actual date.
It does not send emails or reports to authorities. The responsible person uses
the relevant authority's official reporting channel and records the receipt only
after submission. Confirmed cases cannot close without evidence, containment and
authority-submission references. Every case action has an actor, note and time;
version checks prevent stale changes overwriting another reviewer.

Flagged profile photos, profile video, voice prompts, bio and Dailies can be
contained with Preserve and remove. Media is copied server-side into the private
`moderation-evidence` bucket and verified before the member-accessible original
is removed. Original database metadata is kept in the restricted evidence table.
The final database function verifies preservation and object removal before
clearing public profile references/deleting a Daily and marking its flag removed.
Failures are reported and can be retried. Unsupported targets are refused rather
than falsely marked removed. Chat messages require manual containment/preservation
and an internal case reference; this feature does not implement chat quarantine.

Do not use the generic Daily delete action for an evidence-bearing child-safety
case: use Preserve and remove instead. Existing signed URLs/caches and member
downloads cannot all be recalled; previously downloaded copies remain outside
the service's control. Account suspension uses the existing member actions.

Evidence records/bucket are service-role-only; no evidence preview, public URL,
download endpoint or browser upload has been added. A restrictive storage policy
blocks this bucket even if another authenticated-user policy grants broad access.
No automatic evidence deletion is scheduled. The operator must set lawful
preservation/retention and access procedures with its designated safety person.
The tools support those procedures and do not certify legal compliance.

Verification:

```
node scripts/test-child-safety.cjs
node scripts/test-child-safety-ui.cjs
# With @electric-sql/pglite installed in a temporary tool directory:
# PGLITE_MODULE=<absolute package path> node scripts/test-child-safety-sql.cjs
```

Browser QA runs against a local admin dev server on port 3108 using synthetic
sessions and intercepted API responses. It never files a real report or writes
production data. Start the server with `npm run dev -- --port 3108` first.

UI references: existing Moderation components are the primary design target.
Refero's shadcn style (c14c0a94-1037-449e-bf5b-4cb972656ac7) informs neutral borders,
compact sans-serif controls and semantic-only destructive red; Zendesk ticket
detail (fb1fb436-92ff-4d64-b2d2-624cc06b4911) informs the case list/detail/activity
hierarchy. Existing admin tokens and controls are reused; no new palette or media.
