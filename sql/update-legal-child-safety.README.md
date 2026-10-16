# Child-safety policy update

1. Open `update-legal-child-safety.sql`. The SQL preserves the existing Terms and
   Privacy text, including business/contact placeholders. It appends child-safety
   standards to both documents and sets their effective date to the execution date.
2. Replace `child_safety_email` with the monitored address when ready. The default
   remains a clearly marked placeholder, as requested. Do not submit the unfinished
   contact text to Google Play as a finished policy.
3. Run the SQL in the project's Supabase SQL editor. Save the initial two-row
   document result if you need a copy of the previous text. This script has not
   been executed automatically.
4. Deploy the local changes in `gogter-landing` to the public website. Its previous
   `revalidate = 3600` route settings and one-hour cached database fetch served an
   older document after admin saves. Both public legal routes now render on each
   request and the database fetch uses `cache: "no-store"`.
5. Deploy the local changes in `Tickle-Admin`. Its legal routes also read fresh
   content; the editor's live-page link opens `https://gogter.com/{slug}`; saving a
   missing database row produces an error instead of reporting a false success.
6. Refresh `https://gogter.com/privacy` and `https://gogter.com/terms`. Confirm the
   new Child Safety Standards headings and the completed contact address. Future
   admin saves are visible on the next full-page request after these deployments.

An SQL change alone cannot invalidate the currently deployed Vercel page cache.
Before the website code is deployed, the existing site may still serve stale
content until its one-hour cache is revalidated. A browser hard refresh alone does
not clear that server cache.

The policy text describes moderation and reporting commitments. The operator must
actually run these processes and designate a child-safety contact before making
the corresponding Google Play self-certifications. This update does not establish
an authority-reporting integration, replace other unfinished legal details, or
guarantee review approval.
