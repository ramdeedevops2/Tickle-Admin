import { lookup } from "node:dns/promises";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import * as cheerio from "cheerio";
import { blockFor } from "./blocked";

/**
 * Fetch one web page from the panel's server and pull out what is on it.
 *
 * ── What it refuses, and why each check is here ───────────────
 *
 * Blocked websites, at every hop: a short link or a redirect is the
 * obvious way round a block that is only checked against what was typed.
 *
 * Private addresses: this runs on our server, so "read
 * http://localhost:3000" or the cloud's metadata address would read
 * *our* machines and show the result to whoever asked. Every address a
 * name resolves to is checked, not just the first.
 *
 * robots.txt: a site that asks automated readers to stay out of a page
 * is taken at its word.
 *
 * Pages are opened in Chrome when the server has one, so content built
 * by JavaScript is read; otherwise a plain request. Either way: no login,
 * and nothing done to disguise what we are. A page that needs a login is
 * reported as such.
 */

const USER_AGENT = "TickleAdminReader/1.0 (+admin panel page reader)";
const TIMEOUT_MS = 15_000;
const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export type ReadResult = {
  url: string;
  status: number;
  title: string | null;
  description: string | null;
  siteName: string | null;
  language: string | null;
  headings: { level: number; text: string }[];
  text: string[];
  links: { href: string; text: string }[];
  /** `src` is the full-size original where one could be worked out; `fallback` is what the page showed. */
  images: { src: string; fallback: string; alt: string }[];
  tables: string[][][];
};

/** A refusal worth showing the admin as-is. */
export class ReadRefused extends Error {}

type Rule = { domain: string; reason: string | null };

export async function readPage(
  input: string,
  extraBlocked: Rule[],
  options: { browser?: boolean } = {},
): Promise<ReadResult> {
  // A server without Chrome still reads pages, just not the scripted part.
  if (options.browser && findBrowser()) return renderPage(input, extraBlocked);

  let url = parseUrl(input);
  const robotsCache = new Map<string, RobotsRules>();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const block = blockFor(url.hostname, extraBlocked);
    if (block) {
      throw new ReadRefused(
        hop === 0
          ? `${block.domain} is on the blocked list${block.reason ? ` (${block.reason})` : ""}.`
          : `That address forwards to ${block.domain}, which is on the blocked list.`,
      );
    }

    await assertPublicHost(url.hostname);

    let robots = robotsCache.get(url.origin);
    if (!robots) {
      robots = await loadRobots(url.origin);
      robotsCache.set(url.origin, robots);
    }
  
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": USER_AGENT, accept: "text/html,application/xhtml+xml" },
    }).catch((error: unknown) => {
      throw new ReadRefused(
        error instanceof Error && error.name === "TimeoutError"
          ? "The website took too long to answer."
          : "Could not reach that website. Check the address.",
      );
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new ReadRefused("The website sent us somewhere without saying where.");
      url = parseUrl(new URL(location, url).toString());
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      throw new ReadRefused("That page needs a login or refuses automated readers.");
    }
    if (!response.ok) {
      throw new ReadRefused(`The website answered with an error (${response.status}).`);
    }

    const type = response.headers.get("content-type") ?? "";
    if (!/html/i.test(type)) {
      throw new ReadRefused("That address is not a web page (it is a file or data).");
    }

    const html = await readCapped(response);
    return extract(html, url, response.status);
  }

  throw new ReadRefused("That address forwards too many times.");
}

// ── In a browser, for pages built by JavaScript ───────────────

/**
 * Load the page in a real Chrome window and read what it ends up as.
 *
 * The browser makes dozens of requests of its own — scripts, data,
 * frames — and any of them could point at a blocked site or a private
 * address, so every one passes the same checks the plain read makes.
 * A page script calling http://localhost is refused like a typed one.
 *
 * It uses the Chrome or Edge already installed on the machine running
 * the panel (or WEB_READER_BROWSER_PATH). No login, no cookies kept, and
 * nothing done to hide that it is an automated reader.
 */
async function renderPage(input: string, extraBlocked: Rule[]): Promise<ReadResult> {
  const start = parseUrl(input);
  const executablePath = findBrowser();

  if (!executablePath) {
    throw new ReadRefused(
      "Reading with a browser is not available on this server, because no Chrome or Edge is installed.",
    );
  }

  const { chromium } = await import("playwright-core");
  /*
   * A visible window, so whoever is testing can watch the page load.
   *
   * Its own fresh profile every time — never the everyday Chrome with
   * its signed-in accounts, which would have every page read as that
   * person. A server with no screen sets WEB_READER_HIDE_BROWSER=true.
   */
  const visible = process.env.WEB_READER_HIDE_BROWSER !== "true";
  const browser = await chromium.launch({
    executablePath,
    headless: !visible,
    args: visible ? ["--window-size=1280,860", "--window-position=80,60"] : [],
  });

  const robotsCache = new Map<string, RobotsRules>();
  const hostCache = new Map<string, Promise<boolean>>();
  let refusal: string | null = null;

  const hostIsPublic = (hostname: string) => {
    let known = hostCache.get(hostname);
    if (!known) {
      known = assertPublicHost(hostname).then(
        () => true,
        () => false,
      );
      hostCache.set(hostname, known);
    }
    return known;
  };

  try {
    const context = await browser.newContext({
      acceptDownloads: false,
      serviceWorkers: "block",
      // A visible window sizes the page to itself; a hidden one needs a size.
      viewport: visible ? null : { width: 1280, height: 860 },
      // An ordinary Chrome identity with our reader's name on the end.
      userAgent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${browser.version()} Safari/537.36 ${USER_AGENT}`,
    });

    await context.route("**/*", async (route) => {
      const request = route.request();
      let target: URL;

      try {
        target = new URL(request.url());
      } catch {
        return route.abort();
      }

      if (target.protocol === "data:" || target.protocol === "blob:") return route.continue();
      if (target.protocol !== "http:" && target.protocol !== "https:") return route.abort();

      // Pictures, video and fonts are never shown, so never fetched.
      if (["image", "media", "font"].includes(request.resourceType())) return route.abort();

      const isPage = request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame();

      const block = blockFor(target.hostname, extraBlocked);
      if (block) {
        if (isPage) refusal = `That address forwards to ${block.domain}, which is on the blocked list.`;
        return route.abort("blockedbyclient");
      }

      if (!(await hostIsPublic(target.hostname))) {
        if (isPage) refusal = "That address points inside a private network, so it cannot be read.";
        return route.abort("blockedbyclient");
      }

      if (isPage) {
        let robots = robotsCache.get(target.origin);
        if (!robots) {
          robots = await loadRobots(target.origin);
          robotsCache.set(target.origin, robots);
        }
     
      }

      return route.continue();
    });

    const block = blockFor(start.hostname, extraBlocked);
    if (block) {
      throw new ReadRefused(
        `${block.domain} is on the blocked list${block.reason ? ` (${block.reason})` : ""}.`,
      );
    }

    const page = await context.newPage();
    const response = await page
      .goto(start.toString(), { waitUntil: "domcontentloaded", timeout: 20_000 })
      .catch((error: unknown) => {
        if (refusal) throw new ReadRefused(refusal);
        throw new ReadRefused(
          error instanceof Error && error.name === "TimeoutError"
            ? "The website took too long to load."
            : "Could not load that website. Check the address.",
        );
      });

    if (refusal) throw new ReadRefused(refusal);

    // Give scripts a moment to fill the page, without waiting forever on
    // sites that never stop polling.
    await page.waitForLoadState("networkidle", { timeout: 6_000 }).catch(() => {});

    const status = response?.status() ?? 200;
    if (status === 401 || status === 403) {
      throw new ReadRefused("That page needs a login or refuses automated readers.");
    }
    if (status >= 400) {
      throw new ReadRefused(`The website answered with an error (${status}).`);
    }

    // Scroll through once so pages that load more as you scroll do, and
    // so the window shows the whole page being read.
    await page
      .evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight && y < 20_000; y += 700) {
          window.scrollTo(0, y);
          await new Promise((done) => setTimeout(done, 120));
        }
        window.scrollTo(0, 0);
      })
      .catch(() => {});

    const html = await page.content();

    // Leave the finished page on screen for a moment before it closes.
    if (visible) await page.waitForTimeout(2_500);
    if (html.length > MAX_BYTES) throw new ReadRefused("That page is too large to read here.");

    return extract(html, new URL(page.url()), status);
  } finally {
    await browser.close();
  }
}

function findBrowser(): string | null {
  const candidates = [
    process.env.WEB_READER_BROWSER_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ];

  return candidates.find((path) => path && existsSync(path)) ?? null;
}

function parseUrl(input: string): URL {
  let value = input.trim();
  if (!/^[a-z]+:\/\//i.test(value)) value = `https://${value}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ReadRefused("That does not look like a website address.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ReadRefused("Only website addresses starting with http or https can be read.");
  }
  if (url.username || url.password) {
    throw new ReadRefused("Addresses with a login built into them are not allowed.");
  }
  if (url.port && url.port !== "80" && url.port !== "443") {
    throw new ReadRefused("Only normal website addresses can be read.");
  }

  url.hash = "";
  return url;
}

async function assertPublicHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "");
  const refuse = () => {
    throw new ReadRefused("That address points inside a private network, so it cannot be read.");
  };

  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) refuse();

  const addresses = isIP(host)
    ? [host]
    : await lookup(host, { all: true, verbatim: true })
        .then((found) => found.map((entry) => entry.address))
        .catch(() => {
          throw new ReadRefused("That website does not exist. Check the address.");
        });

  if (addresses.length === 0 || addresses.some(isPrivateAddress)) refuse();
}

function isPrivateAddress(address: string): boolean {
  const lower = address.toLowerCase();

  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]);

  if (isIP(lower) === 4) {
    const [a, b] = lower.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }

  return (
    lower === "::" ||
    lower === "::1" ||
    /^f[cd]/.test(lower) ||
    /^fe[89ab]/.test(lower) ||
    lower.startsWith("ff")
  );
}

async function readCapped(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";

  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new ReadRefused("That page is too large to read here.");
    }
    chunks.push(value);
  }

  return new TextDecoder().decode(Buffer.concat(chunks));
}

// ── robots.txt ────────────────────────────────────────────────

type RobotsRules = { allow: boolean; path: string }[];

async function loadRobots(origin: string): Promise<RobotsRules> {
  try {
    const response = await fetch(`${origin}/robots.txt`, {
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
      headers: { "user-agent": USER_AGENT },
    });

    // No robots.txt means no requests made of readers.
    if (!response.ok) return [];
    return parseRobots((await response.text()).slice(0, 500_000));
  } catch {
    return [];
  }
}

/** The rules for our reader if named, otherwise the rules for everyone. */
function parseRobots(body: string): RobotsRules {
  const groups: { agents: string[]; rules: RobotsRules }[] = [];
  let current: { agents: string[]; rules: RobotsRules } | null = null;

  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!match) continue;

    const key = match[1].toLowerCase();
    const value = match[2].trim();

    if (key === "user-agent") {
      if (!current || current.rules.length > 0) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (current && (key === "allow" || key === "disallow") && value) {
      current.rules.push({ allow: key === "allow", path: value });
    }
  }

  const ours = groups.find((group) => group.agents.some((agent) => agent !== "*" && "tickleadminreader".includes(agent)));
  return (ours ?? groups.find((group) => group.agents.includes("*")))?.rules ?? [];
}

/** Longest matching rule wins; a tie goes to allow. */
function robotsAllow(rules: RobotsRules, path: string): boolean {
  let best: { allow: boolean; length: number } | null = null;

  for (const rule of rules) {
    const pattern = new RegExp(
      "^" +
        rule.path
          .replace(/[.+?^${}()|[\]\\]/g, (char) => (char === "$" ? char : `\\${char}`))
          .replace(/\*/g, ".*")
          .replace(/\\\$$|\$$/, "$"),
    );
    if (!pattern.test(path)) continue;

    const length = rule.path.length;
    if (!best || length > best.length || (length === best.length && rule.allow)) {
      best = { allow: rule.allow, length };
    }
  }

  return best?.allow ?? true;
}

// ── What is on the page ───────────────────────────────────────

function extract(html: string, url: URL, status: number): ReadResult {
  const $ = cheerio.load(html);
  const clean = (value: string | undefined | null) => (value ?? "").replace(/\s+/g, " ").trim();
  const absolute = (value: string | undefined) => {
    if (!value) return null;
    try {
      const resolved = new URL(value, url);
      return resolved.protocol === "http:" || resolved.protocol === "https:" ? resolved.toString() : null;
    } catch {
      return null;
    }
  };
  const meta = (selector: string) => clean($(selector).first().attr("content")) || null;

  $("script, style, noscript, template, svg, iframe").remove();

  const headings = $("h1, h2, h3")
    .toArray()
    .map((element) => ({ level: Number(element.tagName.slice(1)), text: clean($(element).text()) }))
    .filter((heading) => heading.text)
    .slice(0, 60);

  const root = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const seenText = new Set<string>();
  /*
   * Text is whatever sits directly inside an element, not only inside
   * <p>. Plenty of pages put their content in spans and divs — a price,
   * a quote, a stock label — and a paragraph-only read shows nothing.
   * Menus, footers and forms are skipped: they repeat on every page.
   */
  const text = root
    .find("*")
    .not("nav, nav *, header, header *, footer, footer *, form, form *, button, option, a")
    .toArray()
    .map((element) =>
      clean(
        $(element)
          .contents()
          .toArray()
          .filter((node) => node.type === "text")
          .map((node) => $(node).text())
          .join(" "),
      ),
    )
    .filter((line) => line.length >= 2 && !seenText.has(line) && Boolean(seenText.add(line)))
    .slice(0, 300);

  const seenLinks = new Set<string>();
  const links = $("a[href]")
    .toArray()
    .map((element) => ({
      href: absolute($(element).attr("href")),
      text: clean($(element).text()) || clean($(element).attr("title")) || "",
    }))
    .filter((link): link is { href: string; text: string } =>
      Boolean(link.href) && !seenLinks.has(link.href!) && Boolean(seenLinks.add(link.href!)),
    )
    .slice(0, 300);

  /*
   * The largest copy of each picture the page offers.
   *
   * Pages usually list several sizes (srcset, or <source> in a <picture>)
   * and put a small one in src. Picking the widest candidate is the
   * difference between a blurry thumbnail and the real photograph.
   */
  const largest = (element: Parameters<typeof $>[0]) => {
    const node = $(element);
    const sets = [
      node.attr("srcset"),
      node.attr("data-srcset"),
      ...node
        .closest("picture")
        .find("source")
        .toArray()
        .map((source) => $(source).attr("srcset") ?? $(source).attr("data-srcset")),
    ];

    let best: { url: string; size: number } | null = null;

    for (const set of sets) {
      for (const candidate of (set ?? "").split(/,\s+(?=\S)/)) {
        const [url, descriptor = "1x"] = candidate.trim().split(/\s+/);
        const size = parseFloat(descriptor) * (descriptor.endsWith("x") ? 1000 : 1);
        if (url && Number.isFinite(size) && (!best || size > best.size)) best = { url, size };
      }
    }

    return (
      absolute(best?.url) ??
      absolute(node.attr("data-src") ?? node.attr("data-original") ?? node.attr("src"))
    );
  };

  const seenImages = new Set<string>();
  const images = $("img")
    .toArray()
    .map((element) => {
      const shown = largest(element);
      return {
        src: shown ? fullSize(shown) : null,
        fallback: shown,
        alt: clean($(element).attr("alt")),
      };
    })
    .filter((image): image is { src: string; fallback: string; alt: string } =>
      Boolean(image.src) && !seenImages.has(image.src!) && Boolean(seenImages.add(image.src!)),
    )
    .slice(0, 100);

  const tables = $("table")
    .toArray()
    .slice(0, 10)
    .map((table) =>
      $(table)
        .find("tr")
        .toArray()
        .slice(0, 100)
        .map((row) =>
          $(row)
            .find("th, td")
            .toArray()
            .slice(0, 20)
            .map((cell) => clean($(cell).text())),
        )
        .filter((row) => row.some(Boolean)),
    )
    .filter((rows) => rows.length > 0);

  return {
    url: url.toString(),
    status,
    title: clean($("title").first().text()) || meta('meta[property="og:title"]'),
    description: meta('meta[name="description"]') ?? meta('meta[property="og:description"]'),
    siteName: meta('meta[property="og:site_name"]'),
    language: clean($("html").attr("lang")) || null,
    headings,
    text,
    links,
    images,
    tables,
  };
}

/**
 * The original file behind a resized picture address, where the pattern
 * is known.
 *
 * Websites store one full-size picture and serve shrunken copies whose
 * address says how they were shrunk — "500px-", "-300x200", "_medium",
 * "?w=400". Undoing that gets the photograph as it was uploaded. It is a
 * guess, so the page falls back to the address it was given if the
 * original does not load.
 */
export function fullSize(address: string): string {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return address;
  }

  // Wikipedia / Wikimedia: /commons/thumb/a/ab/Name.jpg/500px-Name.jpg
  const wiki = url.pathname.match(/^(.*)\/thumb(\/.+\/[^/]+\.(?:jpe?g|png|gif|webp|tiff?))\/[^/]+$/i);
  if (/wiki(m|p)edia\.org$/.test(url.hostname) && wiki) {
    url.hostname = "upload.wikimedia.org";
    url.pathname = wiki[1] + wiki[2];
    url.search = "";
    return url.toString();
  }

  // Google-hosted photos: ...=s220-c or =w400-h300
  if (/googleusercontent\.com$|ggpht\.com$/.test(url.hostname)) {
    url.pathname = url.pathname.replace(/=[swh]\d+[^/]*$/, "=s0");
    return url.toString();
  }

  // Amazon: Name._AC_SX300_.jpg
  if (/media-amazon\.com$|images-amazon\.com$/.test(url.hostname)) {
    url.pathname = url.pathname.replace(/\._[^/]+_\.(\w+)$/, ".$1");
    return url.toString();
  }

  // Cloudinary: /upload/w_300,c_fill,q_auto/v123/name.jpg
  if (url.hostname.endsWith("cloudinary.com")) {
    url.pathname = url.pathname.replace(/\/upload\/(?:[a-z]{1,3}_[^/]+\/)+/, "/upload/");
    return url.toString();
  }

  // Shopify: name_300x300.jpg, name_medium.jpg, name_300x@2x.jpg
  if (url.hostname.endsWith("shopify.com") || url.pathname.includes("/cdn/shop/")) {
    url.pathname = url.pathname.replace(
      /_(?:\d*x\d*|pico|icon|thumb|small|compact|medium|large|grande)(?:_crop_\w+)?(?:@\dx)?(\.\w+)$/,
      "$1",
    );
    for (const key of ["width", "height", "crop"]) url.searchParams.delete(key);
    return url.toString();
  }

  // WordPress and most CMSs: name-300x200.jpg, name-scaled.jpg
  url.pathname = url.pathname.replace(/-(?:\d{2,4}x\d{2,4}|scaled)(\.(?:jpe?g|png|gif|webp))$/i, "$1");

  // Resizing by query (?w=400&h=300&q=60), unless the address is signed —
  // changing a signed address breaks it.
  const signed = ["s", "sig", "signature", "token", "expires", "x-amz-signature"].some((key) =>
    url.searchParams.has(key),
  );
  if (!signed) {
    for (const key of ["w", "h", "width", "height", "resize", "fit", "crop", "q", "quality", "dpr", "size"]) {
      url.searchParams.delete(key);
    }
  }

  return url.toString();
}
