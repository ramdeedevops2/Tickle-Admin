export const CASE_ACTIONS = ['create', 'review', 'note', 'evidence', 'containment', 'confirm', 'authority', 'dismiss', 'close'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseCaseAction(input: unknown, now = Date.now()) {
  if (!input || typeof input !== 'object') throw new Error('Invalid request.');
  const body = input as Record<string, unknown>;
  const action = String(body.action ?? '');
  const note = String(body.note ?? '').trim();
  if (!CASE_ACTIONS.includes(action as typeof CASE_ACTIONS[number])) throw new Error('Unknown case action.');
  if (note.length < 3 || note.length > 4000) throw new Error('Write a reason between 3 and 4000 characters.');
  const report = action === 'create' ? String(body.report_id ?? '') : null;
  const id = action === 'create' ? null : String(body.case_id ?? '');
  if (!UUID.test(report ?? id ?? '')) throw new Error('A valid report or case ID is required.');
  const version = action === 'create' ? null : Number(body.version);
  if (version !== null && (!Number.isInteger(version) || version < 1)) throw new Error('Refresh this case before saving.');
  const raw = body.details && typeof body.details === 'object' ? body.details as Record<string, unknown> : {};
  const details: Record<string, string> = {};
  if (['evidence', 'containment', 'authority'].includes(action)) {
    details.reference = String(raw.reference ?? '').trim();
    if (details.reference.length < 3 || details.reference.length > 1000) throw new Error('Provide an internal record or submission reference.');
  }
  if (action === 'authority') {
    details.authority = String(raw.authority ?? '').trim();
    const date = new Date(String(raw.reported_at ?? ''));
    if (details.authority.length < 3 || details.authority.length > 200 || !Number.isFinite(date.getTime()) || date.getTime() > now) {
      throw new Error('Provide the authority and actual past submission date/time.');
    }
    details.reported_at = date.toISOString();
  }
  return { action, note, report, id, version, details };
}
