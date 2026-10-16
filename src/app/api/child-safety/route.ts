import { NextRequest, NextResponse } from 'next/server';
import { failed, requireAdmin } from '@/lib/supabase/admin';
import { parseCaseAction } from '@/lib/childSafety';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, 'moderation.act');
    if (auth.error) return auth.error;
    const id = request.nextUrl.searchParams.get('case');
    if (id) {
      const { data, error } = await auth.supabase.from('child_safety_events')
        .select('id,action,note,details,actor_id,created_at').eq('case_id', id).order('created_at');
      if (error) throw error;
      return NextResponse.json({ events: data }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const results = await Promise.all([
      auth.supabase.from('child_safety_cases').select('*').order('updated_at', { ascending: false }).limit(200),
      auth.supabase.from('reports').select('id,reason,reason_key,detail,reported_user_id,created_at')
        .in('reason_key', ['child_safety', 'underage', 'content', 'threat', 'other'])
        .in('status', ['open', 'reviewing']).order('created_at', { ascending: false }).limit(200),
      auth.supabase.from('content_flags').select('id,owner_id,kind,reason,status').eq('status', 'open').limit(100),
    ]);
    for (const result of results) if (result.error) throw result.error;
    return NextResponse.json({ cases: results[0].data, reports: results[1].data, flags: results[2].data },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return failed(error, 'Child Safety setup is missing or unavailable. Run child-safety-workflow.sql before opening this tab.');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request, 'moderation.act');
    if (auth.error) return auth.error;
    let action: ReturnType<typeof parseCaseAction>;
    try { action = parseCaseAction(await request.json()); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    const { data, error } = await auth.supabase.rpc('child_safety_action', {
      p_actor: auth.user.id, p_action: action.action, p_case: action.id,
      p_version: action.version, p_report: action.report, p_note: action.note, p_details: action.details,
    });
    if (error) throw error;
    return NextResponse.json({ ok: true, id: data });
  } catch (error) {
    return failed(error, 'Could not update the case.');
  }
}
