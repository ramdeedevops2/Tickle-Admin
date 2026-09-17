import { NextRequest, NextResponse } from "next/server";
import { failed, requireAdmin } from "@/lib/supabase/admin";
import { normaliseDomain } from "@/lib/webReader/blocked";
import { readPage, ReadRefused } from "@/lib/webReader/read";

/**
 * Read one web page for the Read a website screen.
 *
 * Nothing is stored. The websites an admin blocks live in their own
 * browser and arrive with each request; the ones that matter most —
 * social, dating and people-search sites — are refused in code whatever
 * the request carries.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (auth.error) return auth.error;

    const body = (await request.json()) as { url?: unknown; blocked?: unknown };

    const url = typeof body.url === "string" ? body.url.trim() : "";
    if (!url) {
      return NextResponse.json({ error: "Type a website address first." }, { status: 400 });
    }

    const blocked = (Array.isArray(body.blocked) ? body.blocked : [])
      .slice(0, 500)
      .flatMap((rule: { domain?: unknown; reason?: unknown }) => {
        const domain = typeof rule?.domain === "string" ? normaliseDomain(rule.domain) : null;
        if (!domain) return [];
        return [{ domain, reason: typeof rule.reason === "string" ? rule.reason.slice(0, 200) : null }];
      });

    try {
      // Always in a browser, so pages built by JavaScript read in full.
      const page = await readPage(url, blocked, { browser: true });
      return NextResponse.json({ page });
    } catch (error) {
      if (error instanceof ReadRefused) {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      throw error;
    }
  } catch (error) {
    return failed(error, "Could not read that website.");
  }
}
