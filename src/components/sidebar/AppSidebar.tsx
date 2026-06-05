"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  Activity,
  Users,
  ShieldCheck,
  Heart,
  ShieldAlert,
  Megaphone,
  MapPin,
  KeyRound,
  Settings,
  MessageSquare,
  LogOut,
  ChevronsUpDown,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { name: "Pulse", url: "/", icon: Activity },
  { name: "Members", url: "/members", icon: Users },
  { name: "Connections", url: "/connections", icon: Heart },
  { name: "Messages", url: "/messages", icon: MessageSquare },
  { name: "Safety", url: "/safety", icon: ShieldAlert },
  { name: "Broadcast", url: "/broadcast", icon: Megaphone },
  { name: "Geo", url: "/geo", icon: MapPin },
  { name: "Access", url: "/access", icon: KeyRound },
  { name: "Config", url: "/config", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<{
    email: string;
    name: string;
    role: string;
  } | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from("admin_profiles")
          .select("display_name, role")
          .eq("id", user.id)
          .single();

        setUser({
          email: user.email || "",
          name: profile?.display_name || "Admin",
          role: profile?.role || "admin",
        });
      }
    };
    fetchUser();
  }, [supabase]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <Sidebar
      collapsible="icon"
      className="border-r border-sidebar-border bg-sidebar"
    >
      <SidebarHeader className="border-b border-sidebar-border/50 py-4">
        <div className="flex items-center justify-between gap-2 px-2">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" className="hover:bg-transparent">
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-bold tracking-tight text-lg text-sidebar-foreground">
                    TICKLE
                  </span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <SidebarTrigger className="text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground" />
        </div>
      </SidebarHeader>

      <SidebarContent className="py-4">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive =
              pathname === item.url ||
              (item.url !== "/" && pathname.startsWith(item.url));
            return (
              <SidebarMenuItem key={item.name}>
                <SidebarMenuButton
                  isActive={isActive}
                  tooltip={item.name}
                  className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                  render={<Link href={item.url} />}
                >
                  <item.icon className="size-4" />
                  <span>{item.name}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/50 p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <Button
              type="button"
              variant="ghost"
              onClick={handleSignOut}
              className="w-full justify-start gap-2 px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4" />
              <span>Logout</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
