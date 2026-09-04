import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
     * Turbopack's dev filesystem cache, off.
     *
     * Next 16.1 turned this on by default: Turbopack saves its module
     * graph into `.next` and restores it on the next `next dev`. That is
     * a real speed-up and it is also why deleting a route kept breaking
     * the dev server with "Module not found: Can't resolve './page.tsx'"
     * pointing at a file that no longer exists.
     *
     * The cache outlives the process, so restarting the server did not
     * clear it — the stale entry came back from disk every time, and the
     * only cure was deleting `.next` by hand after every route change.
     * This panel has been restructured heavily (27 routes down to 18),
     * so that was happening constantly.
     *
     * The cost is a slower cold start, paid once per dev session. The
     * alternative is a build error that looks like a code fault, appears
     * only for the person who deleted the route, and is fixed by an
     * incantation nobody can be expected to guess.
     *
     * Production builds are unaffected — the build-time cache is a
     * separate flag and is off by default.
     */
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
