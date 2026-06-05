import { AppSidebar } from "@/components/sidebar/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";
import AuthGuard from "@/components/AuthGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <SidebarProvider>
        <div className="flex min-h-screen w-full bg-background text-foreground">
          <AppSidebar />
          <main className="flex-1 flex flex-col min-w-0">
            <div className="flex-1 p-6 overflow-auto">{children}</div>
          </main>
        </div>
      </SidebarProvider>
    </AuthGuard>
  );
}
