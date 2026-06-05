"use client";

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ArrowLeft,
  Heart,
  MapPin,
  MessageSquare,
  RefreshCw,
  UserRound,
  X,
} from "lucide-react";

type Profile = {
  id: string;
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
  bio: string | null;
  age: number | null;
  gender: string | null;
  created_at: string;
  search_radius: number | null;
  latitude: number | null;
  longitude: number | null;
  is_online: boolean | null;
  last_active: string | null;
  interested_in: string | null;
};

type RelatedProfile = {
  user_id: string;
  name: string | null;
  email: string | null;
  photos: string[] | null;
  age: number | null;
  gender: string | null;
  is_online: boolean | null;
};

type LikeRow = {
  id: string;
  liker_id: string;
  liked_id: string;
  created_at: string;
};

type PassRow = {
  id: string;
  passer_id: string;
  passed_id: string;
  created_at: string;
};

type MatchRow = {
  id: string;
  user1_id: string;
  user2_id: string;
  last_message_at: string;
  created_at: string;
};

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  created_at: string;
};

type StoryRow = {
  id: string;
  user_id: string;
  photo_url: string;
  created_at: string;
  expires_at: string;
};

type EncounterRow = {
  id: string;
  user_id: string | null;
  encountered_user_id: string | null;
  created_at: string | null;
};

type AuthUser = {
  id: string;
  email?: string;
  phone?: string;
  created_at?: string;
  last_sign_in_at?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
};

type DetailPayload = {
  auth_user: AuthUser | null;
  profile: Profile | null;
  related_profiles: RelatedProfile[];
  likes_sent: LikeRow[];
  likes_received: LikeRow[];
  passes_sent: PassRow[];
  passes_received: PassRow[];
  matches: MatchRow[];
  messages_sent: MessageRow[];
  match_messages: MessageRow[];
  stories: StoryRow[];
  encounters_started: EncounterRow[];
  encounters_received: EncounterRow[];
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not set";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function shortId(value: string | null | undefined) {
  if (!value) return "Not set";
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}

function displayName(profile: RelatedProfile | Profile | null | undefined, id: string) {
  return profile?.name || profile?.email || shortId(id);
}

function personSubtitle(profile: RelatedProfile | null | undefined) {
  const parts = [profile?.age, profile?.gender].filter(Boolean);
  return parts.length ? parts.join(" / ") : profile?.email || "Profile data missing";
}

function raw(value: unknown) {
  if (value == null) return "Not set";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: number | string;
  icon: typeof Heart;
}) {
  return (
    <Card className="border-border/50 bg-card">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="size-4 text-foreground" />
      </CardHeader>
      <CardContent className="text-3xl font-black tracking-tight">
        {value}
      </CardContent>
    </Card>
  );
}

function PersonRow({
  profile,
  fallbackId,
  meta,
}: {
  profile: RelatedProfile | null | undefined;
  fallbackId: string;
  meta: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border/40 py-3 last:border-0">
      {profile?.photos?.[0] ? (
        <img
          src={profile.photos[0]}
          alt={displayName(profile, fallbackId)}
          className="h-12 w-12 object-cover"
        />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center border border-border/50 bg-muted">
          <UserRound className="size-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {displayName(profile, fallbackId)}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {personSubtitle(profile)}
        </div>
      </div>
      <div className="shrink-0 text-right text-xs text-muted-foreground">
        {meta}
      </div>
    </div>
  );
}

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between border-b border-border/50 pb-2">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
          {title}
        </h2>
        {count != null && <Badge variant="secondary">{count}</Badge>}
      </div>
      {children}
    </section>
  );
}

export default function MemberProfilePage() {
  const params = useParams<{ userId: string }>();
  const userId = params.userId;
  const supabase = useMemo(() => createClient(), []);
  const [detail, setDetail] = useState<DetailPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMember = useCallback(async () => {
    setLoading(true);
    setError(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setError("Your session expired. Sign in again.");
      setLoading(false);
      return;
    }

    const response = await fetch(`/api/members/${encodeURIComponent(userId)}`, {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    });
    const result = (await response.json()) as DetailPayload & { error?: string };

    if (!response.ok) {
      setError(result.error ?? "Failed to load member profile.");
      setDetail(null);
    } else {
      setDetail(result);
    }

    setLoading(false);
  }, [supabase, userId]);

  useEffect(() => {
    void Promise.resolve().then(loadMember);
  }, [loadMember]);

  const relatedById = useMemo(
    () =>
      new Map(
        (detail?.related_profiles ?? []).map((profile) => [
          profile.user_id,
          profile,
        ]),
      ),
    [detail],
  );

  const profile = detail?.profile ?? null;
  const authUser = detail?.auth_user ?? null;
  const photos = profile?.photos?.filter(Boolean) ?? [];

  const matchMessagesByMatch = useMemo(() => {
    const grouped = new Map<string, MessageRow[]>();
    for (const message of detail?.match_messages ?? []) {
      grouped.set(message.match_id, [
        ...(grouped.get(message.match_id) ?? []),
        message,
      ]);
    }
    return grouped;
  }, [detail]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        Loading member profile...
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Button variant="outline" className="rounded-none" render={<Link href="/members" />}>
          <ArrowLeft className="mr-2 size-4" />
          Members
        </Button>
        <div className="text-destructive">{error}</div>
      </div>
    );
  }

  if (!detail || !profile) {
    return (
      <div className="space-y-6">
        <Button variant="outline" className="rounded-none" render={<Link href="/members" />}>
          <ArrowLeft className="mr-2 size-4" />
          Members
        </Button>
        <div className="text-muted-foreground">No profile row found.</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-4">
          {photos[0] ? (
            <img
              src={photos[0]}
              alt={profile.name || profile.email || "Profile photo"}
              className="h-24 w-24 object-cover"
            />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center border border-border/50 bg-muted">
              <UserRound className="size-8 text-muted-foreground" />
            </div>
          )}
          <div>
            <Button
              variant="ghost"
              className="mb-3 rounded-none px-0 text-xs uppercase tracking-[0.2em]"
              render={<Link href="/members" />}
            >
              <ArrowLeft className="mr-2 size-4" />
              Members
            </Button>
            <h1 className="text-4xl font-black uppercase tracking-tighter">
              {profile.name || "Unnamed User"}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>{profile.email || authUser?.email || "No email"}</span>
              <span>/</span>
              <span>{shortId(profile.user_id)}</span>
              <Badge variant={profile.is_online ? "default" : "secondary"}>
                {profile.is_online ? "Online" : "Offline"}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={loadMember}
          className="rounded-none border-border/50 text-xs uppercase tracking-[0.2em]"
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Matches" value={detail.matches.length} icon={Heart} />
        <StatCard
          title="Messages In Matches"
          value={detail.match_messages.length}
          icon={MessageSquare}
        />
        <StatCard
          title="Likes Sent / Received"
          value={`${detail.likes_sent.length} / ${detail.likes_received.length}`}
          icon={Heart}
        />
        <StatCard
          title="Passes Sent / Received"
          value={`${detail.passes_sent.length} / ${detail.passes_received.length}`}
          icon={X}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-8">
          <Section title="Photos" count={photos.length}>
            {photos.length === 0 ? (
              <div className="text-sm text-muted-foreground">No photos uploaded.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {photos.map((photo, index) => (
                  <a
                    key={photo}
                    href={photo}
                    target="_blank"
                    rel="noreferrer"
                    className="group block overflow-hidden border border-border/50 bg-card"
                  >
                    <img
                      src={photo}
                      alt={`${profile.name || "User"} photo ${index + 1}`}
                      className="aspect-[4/5] w-full object-cover transition-transform group-hover:scale-[1.02]"
                    />
                  </a>
                ))}
              </div>
            )}
          </Section>

          <Section title="Stories" count={detail.stories.length}>
            {detail.stories.length === 0 ? (
              <div className="text-sm text-muted-foreground">No stories found.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {detail.stories.map((story) => (
                  <a
                    key={story.id}
                    href={story.photo_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden border border-border/50 bg-card"
                  >
                    <img
                      src={story.photo_url}
                      alt={`Story ${story.id}`}
                      className="aspect-[9/16] w-full object-cover"
                    />
                    <div className="space-y-1 p-3 text-xs text-muted-foreground">
                      <div>Created {formatDateTime(story.created_at)}</div>
                      <div>Expires {formatDateTime(story.expires_at)}</div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </Section>

          <Section title="Matches" count={detail.matches.length}>
            {detail.matches.length === 0 ? (
              <div className="text-sm text-muted-foreground">No matches found.</div>
            ) : (
              <div className="space-y-4">
                {detail.matches.map((match) => {
                  const peerId =
                    match.user1_id === profile.user_id
                      ? match.user2_id
                      : match.user1_id;
                  const peer = relatedById.get(peerId);
                  const messages = matchMessagesByMatch.get(match.id) ?? [];

                  return (
                    <div key={match.id} className="border border-border/50 p-4">
                      <PersonRow
                        profile={peer}
                        fallbackId={peerId}
                        meta={`${messages.length} messages`}
                      />
                      <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                        <div>Matched {formatDateTime(match.created_at)}</div>
                        <div>Last message {formatDateTime(match.last_message_at)}</div>
                      </div>
                      {messages[0] && (
                        <div className="mt-3 border-t border-border/40 pt-3 text-sm">
                          <div className="mb-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">
                            Latest Message
                          </div>
                          <p className="line-clamp-3 text-muted-foreground">
                            {messages[0].content}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section title="Messages Sent" count={detail.messages_sent.length}>
            {detail.messages_sent.length === 0 ? (
              <div className="text-sm text-muted-foreground">No sent messages.</div>
            ) : (
              <div className="space-y-3">
                {detail.messages_sent.slice(0, 25).map((message) => (
                  <div key={message.id} className="border border-border/50 p-3">
                    <div className="mb-2 flex justify-between gap-3 text-xs text-muted-foreground">
                      <span>Match {shortId(message.match_id)}</span>
                      <span>{formatDateTime(message.created_at)}</span>
                    </div>
                    <p className="text-sm">{message.content}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <aside className="space-y-6">
          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle>Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Bio
                </div>
                <p className="mt-1 text-muted-foreground">
                  {profile.bio || "No bio set."}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Age
                  </div>
                  <div>{profile.age ?? "Not set"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Gender
                  </div>
                  <div className="capitalize">{profile.gender || "Not set"}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Interested In
                  </div>
                  <div className="capitalize">
                    {profile.interested_in || "everyone"}
                  </div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    Search Radius
                  </div>
                  <div>{profile.search_radius ?? 10} km</div>
                </div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Activity
                </div>
                <div>Joined {formatDateTime(profile.created_at)}</div>
                <div>Last active {formatDateTime(profile.last_active)}</div>
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Location
                </div>
                {profile.latitude != null && profile.longitude != null ? (
                  <div className="flex items-center gap-2">
                    <MapPin className="size-4" />
                    <span>
                      {profile.latitude.toFixed(5)}, {profile.longitude.toFixed(5)}
                    </span>
                  </div>
                ) : (
                  <div>Not set</div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle>Likes</CardTitle>
            </CardHeader>
            <CardContent>
              <Section title="Sent" count={detail.likes_sent.length}>
                {detail.likes_sent.slice(0, 8).map((like) => (
                  <PersonRow
                    key={like.id}
                    profile={relatedById.get(like.liked_id)}
                    fallbackId={like.liked_id}
                    meta={formatDateTime(like.created_at)}
                  />
                ))}
              </Section>
              <div className="mt-6">
                <Section title="Received" count={detail.likes_received.length}>
                  {detail.likes_received.slice(0, 8).map((like) => (
                    <PersonRow
                      key={like.id}
                      profile={relatedById.get(like.liker_id)}
                      fallbackId={like.liker_id}
                      meta={formatDateTime(like.created_at)}
                    />
                  ))}
                </Section>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle>Encounters</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <Section title="Started" count={detail.encounters_started.length}>
                {detail.encounters_started.slice(0, 8).map((encounter) => (
                  <PersonRow
                    key={encounter.id}
                    profile={relatedById.get(encounter.encountered_user_id || "")}
                    fallbackId={encounter.encountered_user_id || ""}
                    meta={formatDateTime(encounter.created_at)}
                  />
                ))}
              </Section>
              <Section title="Received" count={detail.encounters_received.length}>
                {detail.encounters_received.slice(0, 8).map((encounter) => (
                  <PersonRow
                    key={encounter.id}
                    profile={relatedById.get(encounter.user_id || "")}
                    fallbackId={encounter.user_id || ""}
                    meta={formatDateTime(encounter.created_at)}
                  />
                ))}
              </Section>
            </CardContent>
          </Card>

          <Card className="border-border/50 bg-card">
            <CardHeader>
              <CardTitle>Technical</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 font-mono text-xs text-muted-foreground">
              <div>User ID: {profile.user_id}</div>
              <div>Profile Row ID: {profile.id}</div>
              <div>Auth Created: {formatDateTime(authUser?.created_at)}</div>
              <div>Last Sign In: {formatDateTime(authUser?.last_sign_in_at)}</div>
              <details className="space-y-2">
                <summary className="cursor-pointer text-foreground">
                  Auth metadata
                </summary>
                <pre className="mt-2 whitespace-pre-wrap break-words">
                  {raw({
                    app_metadata: authUser?.app_metadata,
                    user_metadata: authUser?.user_metadata,
                  })}
                </pre>
              </details>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}
