-- Gogter: add child-safety standards to the two existing public documents.
-- Run in the Supabase SQL editor for the project's public.legal_pages table.
-- Existing business, address, support and privacy placeholders are preserved.
-- Replace the child-safety email below with a monitored address before review.
-- These are policy commitments: the operator must implement the described
-- review, removal and authority-reporting processes before certifying them.
-- The website caching fix must be deployed separately; SQL cannot clear Vercel.
-- Re-running this script aborts if either section already exists, preventing
-- duplicate sections or accidental replacement of a later manual revision.

begin;

-- Keep a copy of these two result rows before running the updates if rollback
-- after commit is needed. Nothing outside the two legal-page rows is changed.
select slug, title, body, effective_on, updated_at, updated_by
from public.legal_pages
where slug in ('privacy', 'terms')
order by slug
for update;

do $gogter_update$
declare
  child_safety_email text := '[CHILD SAFETY EMAIL — to be confirmed]';
  privacy_section text;
  terms_section text;
begin
  if (select count(*) from public.legal_pages where slug in ('privacy', 'terms')) <> 2 then
    raise exception 'Both privacy and terms rows must exist. No documents changed.';
  end if;

  if exists (
    select 1 from public.legal_pages
    where slug in ('privacy', 'terms')
      and body ~* '(^|\n)##[[:blank:]]+Child Safety Standards[[:blank:]]*(\r?\n|$)'
  ) then
    raise exception 'Child Safety Standards already exists. Edit that section in Website > Terms and privacy instead of appending it again.';
  end if;

  privacy_section := format($privacy$
## Child Safety Standards

Gogter is an adults-only dating service for people aged 18 or older. Child safety rules apply to all members and all content, including profiles, messages, photos, videos and voice recordings.

### Prohibited content and conduct

Gogter prohibits child sexual abuse and exploitation (CSAE) and child sexual abuse material (CSAM). Users must not create, upload, share, request, promote or distribute material that sexually abuses, exploits or endangers a child. This prohibition includes grooming, sexual solicitation of minors, sexual extortion involving children, trafficking, and material depicting child sexual abuse, including generated or manipulated material.

### Reporting a concern

Members can report safety concerns using the Report option on a profile or in a conversation. Reports may identify a profile, message or media item. Child-safety concerns can also be sent to **%s**. Do not download, forward or attach suspected CSAM to an email; provide the relevant account or content details so the safety team can investigate within the service.

### Review and enforcement

Gogter prioritises reports of suspected child sexual abuse or exploitation. When we become aware of CSAM, we take appropriate action to remove it or disable access in accordance with applicable law. We restrict, suspend or terminate accounts involved in prohibited conduct, and preserve relevant records where legally required. Accounts identified as belonging to people under 18 are removed.

### Reports to authorities

Gogter complies with applicable child-safety laws and maintains a process to report confirmed CSAM to the National Center for Missing & Exploited Children (NCMEC) or the relevant regional authority, as applicable. We cooperate with lawful requests and preserve information as required by law.

### Child-safety point of contact

Contact **%s** for child-safety concerns and notifications from Google Play. Gogter's designated child-safety representative monitors this address and is responsible for coordinating review, enforcement and reports to the appropriate authority.
$privacy$, child_safety_email, child_safety_email);

  terms_section := format($terms$
## Child Safety Standards

Gogter is limited to people aged 18 or older and prohibits child sexual abuse and exploitation (CSAE) and child sexual abuse material (CSAM). You must not create, upload, share, request, promote or distribute content that sexually abuses, exploits or endangers children. Grooming, sexual solicitation of minors, sexual extortion involving children, trafficking, and generated or manipulated material depicting child sexual abuse are prohibited.

Use the in-app Report option on a profile or in a conversation to report a concern. You may also contact **%s**. Do not send suspected CSAM as an email attachment.

We prioritise child-safety reports, remove or disable access to CSAM when we become aware of it, and restrict, suspend or terminate offending accounts in accordance with applicable law. We preserve relevant records where legally required and report confirmed CSAM to NCMEC or the relevant regional authority, as applicable. Our designated child-safety representative handles these concerns and notifications from Google Play.

The [Child Safety Standards in our Privacy Policy](https://gogter.com/privacy#child-safety-standards) describe our reporting and enforcement process.
$terms$, child_safety_email);

  update public.legal_pages
  set body = rtrim(body) || E'\n\n' || trim(privacy_section) || E'\n',
      effective_on = current_date,
      updated_at = now(),
      updated_by = null
  where slug = 'privacy';

  update public.legal_pages
  set body = rtrim(body) || E'\n\n' || trim(terms_section) || E'\n',
      effective_on = current_date,
      updated_at = now(),
      updated_by = null
  where slug = 'terms';
end;
$gogter_update$;

select slug, title, effective_on, updated_at,
       position('## Child Safety Standards' in body) > 0 as child_safety_added
from public.legal_pages
where slug in ('privacy', 'terms')
order by slug;

commit;
