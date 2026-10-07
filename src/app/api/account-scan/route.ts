import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";

type TavilyResult = { url?: unknown; title?: unknown; content?: unknown };

const RESERVED_PATHS = new Set([
  "about",
  "accounts",
  "developer",
  "direct",
  "explore",
  "legal",
  "p",
  "privacy",
  "reel",
  "reels",
  "stories",
  "tv",
]);

// Tavily's public snippets sometimes include Instagram's account category or
// bio. Treat explicit creator/business language as a signal to omit the link.
// This is a heuristic: a missing signal does not prove an account is personal.
const CREATOR_OR_BUSINESS_SIGNAL =
  /\b(?:digital|content|video) creator\b|\bcreator\b|\binfluencer\b|\bblogger\b|\bpersonal blog\b|\bpublic figure\b|\bentrepreneur\b|\bbusiness owner\b|\bbusiness account\b|\bbrand ambassador\b|\bbrand account\b|\bofficial account\b|\bproduct\/service\b|\bshopping & retail\b|\blocal business\b|\bbusiness inquiries\b|\bbrand collaborations?\b|\bfor bookings\b|\bdm for (?:work|collabs?|bookings?)\b/i;

function appearsCreatorOrBusiness(result: TavilyResult): boolean {
  const text = [result.title, result.content]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
  return CREATOR_OR_BUSINESS_SIGNAL.test(text);
}

function instagramProfileUrl(input: unknown): string | null {
  if (typeof input !== "string") return null;

  try {
    const url = new URL(input);
    if (url.protocol !== "https:" || !["instagram.com", "www.instagram.com"].includes(url.hostname)) {
      return null;
    }

    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 1) return null;

    const username = segments[0];
    if (!/^[a-zA-Z0-9._]{1,30}$/.test(username) || RESERVED_PATHS.has(username.toLowerCase())) {
      return null;
    }

    return `https://www.instagram.com/${username}/`;
  } catch {
    return null;
  }
}

function searchDomain(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;

  try {
    const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
    if (
      !["instagram.com", "www.instagram.com"].includes(url.hostname) ||
      !["", "/"].includes(url.pathname) ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return "instagram.com";
  } catch {
    return null;
  }
}

/** Search for public Instagram profile URLs and return URLs only. */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as { name?: unknown; site?: unknown };
    const name = typeof body.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    const site = searchDomain(body.site);

    if (name.length < 2 || name.length > 80) {
      return NextResponse.json(
        { error: "Enter a name between 2 and 80 characters." },
        { status: 400 },
      );
    }
    if (!site) {
      return NextResponse.json(
        { error: "The search website must be instagram.com." },
        { status: 400 },
      );
    }

    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Account search needs TAVILY_API_KEY in the admin server environment." },
        { status: 503 },
      );
    }

    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `Instagram profile for ${name} India`,
        search_depth: "basic",
        topic: "general",
        max_results: 20,
        include_domains: [site],
        include_domains_mode: "restrict",
        country: "india",
        include_answer: false,
        include_raw_content: false,
        safe_search: true,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (response.status === 401 || response.status === 403) {
      return NextResponse.json(
        { error: "Tavily rejected the key. Check TAVILY_API_KEY in the admin server environment." },
        { status: 502 },
      );
    }
    if (response.status === 429 || response.status === 432 || response.status === 433) {
      return NextResponse.json(
        { error: "Tavily search limit reached. Check the plan on your Tavily account." },
        { status: 429 },
      );
    }
    if (!response.ok) {
      return NextResponse.json(
        { error: "Tavily could not complete the search. Try again shortly." },
        { status: 502 },
      );
    }

    const payload = (await response.json()) as { results?: TavilyResult[] };
    const seen = new Set<string>();
    const urls = (payload.results ?? [])
      .filter((result) => !appearsCreatorOrBusiness(result))
      .map((result) => instagramProfileUrl(result.url))
      .filter((url): url is string => {
        if (!url || seen.has(url)) return false;
        seen.add(url);
        return true;
      })
      .slice(0, 10);

    return NextResponse.json({ urls });
  } catch (error) {
    return failed(error, "Could not search Instagram links.");
  }
}
