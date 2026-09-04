import { AppSidebar } from "@/components/sidebar/AppSidebar";
import AuthGuard from "@/components/AuthGuard";
import { TopBar } from "@/components/sidebar/TopBar";

/*
 * Sidebar, then content — and only the content scrolls.
 *
 * There were two rails, and the layout existed largely to work around
 * them: a fixed element is positioned against the viewport, and the
 * viewport includes the strip the browser paints its scrollbar in, so
 * `right: 0` put the right rail *under* the page scrollbar and made it
 * read as narrower than the left.
 *
 * The fix outlived the problem and is worth keeping anyway. The document
 * is pinned to exactly the viewport height (see globals.css) and never
 * scrolls; this column scrolls inside itself, so its scrollbar sits
 * beside the content rather than at the window's edge, and a modal can
 * freeze the page by locking one element (see `useModalLock`).
 *
 * The sidebar hides below 1024px and its margin goes with it. On a
 * narrow window the search reaches every destination anyway, and the
 * threshold is lower than the old 1280 because one rail needs less room
 * than two.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      {/* Named for `useModalLock`, which makes this subtree inert while a
          modal is open. Modals portal to the body so they sit outside it. */}
      <div data-app-shell className="h-screen w-full overflow-hidden">
        <div className="hidden lg:block">
          <AppSidebar />
        </div>

        {/*
          h-full with overflow-y-auto is what makes this the scrolling
          element. min-w-0 stops one wide table setting the column's
          minimum width and pushing the layout sideways rather than
          scrolling inside its own container.
        */}
        <main
          data-scroll-root
          className="flex h-full min-w-0 flex-col overflow-y-auto lg:ml-[13rem]"
        >
          <TopBar />
          <div className="mx-auto w-full max-w-[100rem] flex-1 px-5 pb-6">
            {children}
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
