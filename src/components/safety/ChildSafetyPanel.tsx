"use client";

import { useCallback, useRef, useState } from 'react';
import Link from 'next/link';
import { adminFetch } from '@/lib/adminFetch';
import { useLoadOnMount } from '@/lib/useLoadOnMount';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { useConfirm } from '@/components/ui/confirm';
import { RefreshCw } from 'lucide-react';

type Case = {
  id: string; report_id: string; target_user_id: string | null; status: string;
  assigned_to: string | null; evidence_reference: string | null; containment_note: string | null;
  authority: string | null; authority_reference: string | null; authority_reported_at: string | null;
  created_at: string; updated_at: string; version: number;
};
type Report = { id: string; reason: string; reason_key: string; detail: string | null; reported_user_id: string };
type Flag = { id: string; owner_id: string; kind: string; reason: string | null };
type Event = { id: string; actor_id: string; action: string; note: string; created_at: string; details: Record<string,string> };
type Payload = { cases: Case[]; reports: Report[]; flags: Flag[] };
const ACTIONS = [
  { value: 'review', label: 'Take ownership and review' },
  { value: 'note', label: 'Add review note' },
  { value: 'evidence', label: 'Record preserved evidence reference' },
  { value: 'containment', label: 'Record completed containment action' },
  { value: 'confirm', label: 'Confirm CSAM finding' },
  { value: 'authority', label: 'Record an authority report already submitted' },
  { value: 'dismiss', label: 'Dismiss with reason' },
  { value: 'close', label: 'Close completed case' },
];

export function ChildSafetyPanel() {
  const confirm = useConfirm();
  const [data, setData] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState('');
  const [action, setAction] = useState('review');
  const [note, setNote] = useState('');
  const [reference, setReference] = useState('');
  const [authority, setAuthority] = useState('');
  const [reportedAt, setReportedAt] = useState('');
  const [flag, setFlag] = useState('');
  const selectionRequest = useRef(0);

  const load = useCallback(async () => {
    const result = await adminFetch<Payload>('/api/child-safety');
    setError(result.error);
    if (result.data) setData(result.data);
  }, []);
  useLoadOnMount(load);
  const item = data?.cases.find(c => c.id === selected);
  const closed = item && ['closed','dismissed'].includes(item.status);

  async function selectCase(id: string) {
    const request = ++selectionRequest.current;
    setSelected(id); setEvents([]); setNote(''); setReference(''); setError(null);
    const result = await adminFetch<{ events: Event[] }>(`/api/child-safety?case=${encodeURIComponent(id)}`);
    if (request !== selectionRequest.current) return;
    if (result.error) setError(result.error);
    setEvents(result.data?.events ?? []);
  }

  async function save(create = false) {
    if (busy || (!create && !item)) return;
    if (action === 'authority' && !create && !(await confirm({
      title: 'Record a completed authority submission?',
      body: 'This only records the receipt. It does not send a report. Confirm that your designated person has already submitted it through the authority’s official channel.',
      confirmLabel: 'Record submission',
    }))) return;
    setBusy(true); setError(null);
    const result = await adminFetch<{ id: string }>('/api/child-safety', {
      method: 'POST', body: JSON.stringify({ action: create ? 'create' : action,
        report_id: create ? report : undefined, case_id: item?.id, version: item?.version,
        note, details: { reference, authority, reported_at: reportedAt ? new Date(reportedAt).toISOString() : '' } }),
    });
    if (result.error) setError(result.error);
    else { await load(); if (result.data) await selectCase(result.data.id); }
    setBusy(false);
  }

  async function removeFlag() {
    if (!item || !flag || busy) return;
    const yes = await confirm({ title: 'Preserve evidence and remove this item?',
      body: 'A copy is held in restricted evidence storage before the original is removed from member access. This does not report the case to an authority.',
      confirmLabel: 'Preserve and remove', tone: 'danger' });
    if (!yes) return;
    setBusy(true); setError(null);
    const result = await adminFetch('/api/moderation', { method: 'PATCH', body: JSON.stringify({ id: flag, keep: false, reason: `Case ${item.id}: ${note}` }) });
    if (result.error) setError(result.error);
    else {
      const logged = await adminFetch('/api/child-safety', { method: 'POST', body: JSON.stringify({
        action: 'containment', case_id: item.id, version: item.version, note,
        details: { reference: `moderation_evidence flag_id=${flag}` },
      }) });
      if (logged.error) setError(`Content removed and evidence preserved. Record its containment reference manually: ${logged.error}`);
      else { await load(); await selectCase(item.id); setFlag(''); }
    }
    setBusy(false);
  }

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="max-w-3xl text-sm text-muted-foreground">Record facts and internal references only. Do not paste illegal media or public evidence links. Authority submissions are made by your designated person through the authority’s official channel.</p>
      <Button variant="outline" onClick={load} disabled={busy}><RefreshCw className="size-4" /> Refresh</Button>
    </div>
    {error && <p role="alert" className="rounded-md border border-destructive/30 p-3 text-sm text-destructive">{error}</p>}
    {!data ? <p className="text-sm text-muted-foreground">{error ? 'Child Safety is unavailable. Check database setup and your moderation permissions.' : 'Loading restricted case records…'}</p> : <>
      <div className="grid gap-6 lg:grid-cols-[minmax(15rem,1fr)_minmax(0,2fr)]">
        <section className="space-y-4" aria-label="Child safety cases">
          <h2 className="text-lg font-medium">Cases <span className="text-muted-foreground">{data.cases.length}</span></h2>
          {!data.cases.length && <p className="text-sm text-muted-foreground">No cases yet. Open a case from a report that needs child-safety review.</p>}
          {data.cases.map(c => <button key={c.id} disabled={busy} onClick={() => selectCase(c.id)} aria-pressed={selected === c.id}
            className={`w-full rounded-xl border p-4 text-left focus-visible:outline-2 focus-visible:outline-ring ${selected === c.id ? 'border-foreground bg-muted' : 'border-border'}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm">{c.id.slice(0,8)}</span><Badge variant="outline">{c.status}</Badge></div>
            <p className="mt-2 text-xs text-muted-foreground">Updated {new Date(c.updated_at).toLocaleString()}</p>
          </button>)}
          <Card><CardHeader><CardTitle className="text-base">Open from a report</CardTitle></CardHeader><CardContent className="space-y-3">
            <Select value={report} onChange={value => { ++selectionRequest.current; setReport(value); setSelected(null); setEvents([]); setNote(''); }} placeholder="Choose report" disabled={busy} options={data.reports.filter(r => !data.cases.some(c => c.report_id === r.id)).map(r => ({ value:r.id, label:`${r.reason} · ${r.id.slice(0,8)}` }))} />
            <p className="text-xs text-muted-foreground">Write the reason for opening the case in Review note, then create it.</p>
            <Button disabled={busy || !report || note.trim().length < 3} onClick={() => save(true)}>Open case</Button>
          </CardContent></Card>
        </section>
        <section className="space-y-5" aria-label="Case details">
          {item ? <>
            <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-medium">Case {item.id.slice(0,8)}</h2><Badge>{item.status}</Badge>
              {item.target_user_id && <Link className="ml-auto text-sm underline" href={`/members/${item.target_user_id}`}>Review account / suspend</Link>}</div>
            <dl className="grid gap-3 border-y py-4 text-sm sm:grid-cols-2">
              {[['Assigned admin',item.assigned_to],['Evidence reference',item.evidence_reference],['Containment record',item.containment_note],['Authority receipt',item.authority_reference && `${item.authority}: ${item.authority_reference}`]].map(([label,value]) => <div key={label}><dt className="text-muted-foreground">{label}</dt><dd className="mt-1 break-words">{value || 'Not recorded'}</dd></div>)}
            </dl>
            {!closed && <div className="space-y-4">
              <Label>Case action</Label><Select disabled={busy} value={action} onChange={setAction} options={ACTIONS} />
              {['evidence','containment','authority'].includes(action) && <div className="space-y-2"><Label htmlFor="cs-reference">{action === 'authority' ? 'Authority receipt / submission reference' : 'Internal record reference'}</Label><Input id="cs-reference" value={reference} onChange={e => setReference(e.target.value)} maxLength={1000} /></div>}
              {action === 'authority' && <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="cs-authority">Authority name</Label><Input id="cs-authority" value={authority} onChange={e => setAuthority(e.target.value)} maxLength={200} /></div><div className="space-y-2"><Label htmlFor="cs-reported">Actual submission time (local)</Label><Input id="cs-reported" type="datetime-local" value={reportedAt} onChange={e => setReportedAt(e.target.value)} /></div></div>}
            </div>}
          </> : <h2 className="text-lg font-medium">Select a case or open one from a report</h2>}
          <div className="space-y-2"><Label htmlFor="cs-note">Review note / reason</Label><textarea id="cs-note" rows={4} value={note} onChange={e => setNote(e.target.value)} maxLength={4000} disabled={busy || !!closed} className="w-full rounded-xl border border-input bg-transparent p-3 text-sm focus-visible:outline-2 focus-visible:outline-ring" /></div>
          {item && !closed && <Button disabled={busy || note.trim().length < 3} onClick={() => save()}>{busy ? 'Saving…' : 'Save case action'}</Button>}
          {item && !closed && <Card><CardHeader><CardTitle className="text-base">Preserve and remove flagged content</CardTitle></CardHeader><CardContent className="space-y-3">
            <Select value={flag} onChange={setFlag} disabled={busy} placeholder="Choose this account’s flagged item" options={data.flags.filter(f => f.owner_id === item.target_user_id).map(f => ({ value:f.id, label:`${f.kind} · ${f.reason || f.id.slice(0,8)}` }))} />
            <p className="text-xs text-muted-foreground">Supported: profile photos, profile video, voice prompts, bio and Dailies. Chat messages and unsupported items require manual containment and an evidence reference. Copies already downloaded by members cannot be recalled.</p>
            <Button variant="destructive" disabled={busy || !flag || note.trim().length < 3} onClick={removeFlag}>Preserve and remove</Button>
          </CardContent></Card>}
          {item && <section className="space-y-3" aria-label="Case activity"><h3 className="font-medium">Activity</h3>{!events.length && <p className="text-sm text-muted-foreground">No activity loaded.</p>}{events.map(e => <div key={e.id} className="border-l-2 pl-4 text-sm"><p className="font-medium">{e.action} <span className="font-normal text-muted-foreground">· {new Date(e.created_at).toLocaleString()}</span></p><p className="mt-1 whitespace-pre-wrap">{e.note}</p><p className="mt-1 break-words text-xs text-muted-foreground">Admin {e.actor_id}{e.details.reference ? ` · ${e.details.reference}` : ''}</p></div>)}</section>}
        </section>
      </div>
    </>}
  </div>;
}
