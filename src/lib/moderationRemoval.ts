import type { SupabaseClient } from '@supabase/supabase-js';

const BUCKETS = new Set(['photos', 'profile-videos', 'voice-prompts', 'dailies']);
export function ownedMediaPath(bucket: string, value: string, owner: string, base: string) {
  if (!BUCKETS.has(bucket)) throw new Error('Unsupported storage bucket.');
  let path = value;
  if (/^https?:/i.test(value)) {
    const url = new URL(value);
    if (url.origin !== new URL(base).origin) throw new Error('Media is outside this project.');
    const prefix = `/storage/v1/object/public/${bucket}/`;
    if (!url.pathname.startsWith(prefix)) throw new Error('Unexpected storage URL.');
    path = decodeURIComponent(url.pathname.slice(prefix.length));
  }
  if (!path.startsWith(owner + '/') || path.split('/').some(p => !p || p === '.' || p === '..') || /[\\?#\u0000]/.test(path)) {
    throw new Error('Media path does not belong to the reported account.');
  }
  return path;
}

/** A verified private copy must exist before the member-accessible object goes. */
export async function preserveStorageObject(db: SupabaseClient, bucket: string, source: string, destination: string) {
  const restricted = await db.storage.getBucket('moderation-evidence');
  if (restricted.error || !restricted.data || restricted.data.public) throw new Error('Private evidence storage is not configured.');
  const original = await db.storage.from(bucket).info(source);
  let copy = await db.storage.from('moderation-evidence').info(destination);
  if (copy.error) {
    if (original.error) throw new Error('Original and evidence copy are unavailable. No removal performed.');
    const result = await db.storage.from(bucket).copy(source, destination, { destinationBucket: 'moderation-evidence' });
    if (result.error) throw new Error('Evidence preservation failed. Original retained.');
    copy = await db.storage.from('moderation-evidence').info(destination);
  }
  if (copy.error || !copy.data || (original.data && (copy.data.size == null || copy.data.size !== original.data.size))) {
    throw new Error('Evidence copy verification failed. Original retained.');
  }
  // A previous attempt may already have removed the original before its final
  // database transaction failed. The preserved copy makes that retry safe.
  if (!original.error) {
    const removed = await db.storage.from(bucket).remove([source]);
    if (removed.error) throw new Error('Evidence preserved, but original removal failed. Retry this action.');
  }
}

export async function preserveAndRemoveFlag(db: SupabaseClient, id: string, actor: string, reason: string, base: string) {
  const flagResult = await db.from('content_flags').select('*').eq('id', id).single();
  if (flagResult.error) throw flagResult.error;
  const flag = flagResult.data;
  const previous = await db.from('moderation_evidence').select('*').eq('flag_id', id).maybeSingle();
  if (previous.error) throw previous.error;
  let evidence = previous.data;
  if (!evidence) {
    let snapshot: Record<string, unknown>;
    let bucket: string | null = null;
    let value: string | null = null;
    if (flag.kind === 'daily') {
      const found = await db.from('dailies').select('id,user_id,kind,payload,caption,expires_at').eq('id', flag.target_id).eq('user_id', flag.owner_id).single();
      if (found.error) throw found.error;
      snapshot = found.data;
      const payload = snapshot.payload as { path?: string; url?: string } | null;
      if (['photo','video','voice'].includes(String(snapshot.kind))) {
        if (!payload?.path) throw new Error('Daily media has no supported storage path. Contain manually.');
        bucket = 'dailies'; value = payload.path;
      }
    } else {
      const found = await db.from('profiles').select('photos,profile_video,voice_prompts,bio').eq('user_id', flag.owner_id).single();
      if (found.error) throw found.error;
      const profile = found.data;
      if (flag.kind === 'photo' && profile.photos?.includes(flag.target_path)) {
        snapshot = { photo: flag.target_path }; bucket = 'photos'; value = flag.target_path;
      } else if (flag.kind === 'video' && profile.profile_video === flag.target_path) {
        snapshot = { profile_video: profile.profile_video }; bucket = 'profile-videos'; value = flag.target_path;
      } else if (flag.kind === 'voice' && profile.voice_prompts?.some((v: { path: string }) => v.path === flag.target_path)) {
        snapshot = { voice_prompt: profile.voice_prompts.find((v: { path: string }) => v.path === flag.target_path) };
        bucket = 'voice-prompts'; value = flag.target_path;
      } else if (flag.kind === 'bio') {
        snapshot = { bio: profile.bio };
      } else throw new Error('This flag has no current, supported target. Review it manually; it has not been marked removed.');
    }
    const path = bucket && value ? ownedMediaPath(bucket, value, flag.owner_id, base) : null;
    const created = await db.from('moderation_evidence').insert({ flag_id: id, owner_id: flag.owner_id,
      kind: flag.kind, snapshot, source_bucket: bucket, source_path: path,
      quarantine_path: path ? `${id}/original` : null, actor_id: actor, reason }).select('*').single();
    if (created.error) throw created.error;
    evidence = created.data;
  }
  if (evidence.removed_at) return;
  if (evidence.source_bucket) {
    const path = ownedMediaPath(evidence.source_bucket, evidence.source_path, evidence.owner_id, base);
    await preserveStorageObject(db, evidence.source_bucket, path, evidence.quarantine_path);
  }
  const marked = await db.from('moderation_evidence').update({ preserved_at: new Date().toISOString() }).eq('id', evidence.id);
  if (marked.error) throw marked.error;
  const result = await db.rpc('finish_content_removal', { p_flag: id, p_actor: actor });
  if (result.error) throw result.error;
}
