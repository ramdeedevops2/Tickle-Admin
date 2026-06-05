"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { 
  Activity, 
  Users, 
  ShieldCheck, 
  Heart, 
  ShieldAlert, 
  BarChart3, 
  Megaphone, 
  MapPin, 
  KeyRound, 
  Settings,
  LogOut,
  ChevronsUpDown
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
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const navItems = [
  { name: "Pulse", url: "/", icon: Activity },
  { name: "Members", url: "/members", icon: Users },
  { name: "Review", url: "/review", icon: ShieldCheck },
  { name: "Connections", url: "/connections", icon: Heart },
  { name: "Safety", url: "/safety", icon: ShieldAlert },
  { name: "Insights", url: "/insights", icon: BarChart3 },
  { name: "Broadcast", url: "/broadcast", icon: Megaphone },
  { name: "Geo", url: "/geo", icon: MapPin },
  { name: "Access", url: "/access", icon: KeyRound },
  { name: "Config", url: "/config", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const [user, setUser] = useState<{ email: string, name: string, role: string } | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('admin_profiles')
          .select('display_name, role')
          .eq('id', user.id)
          .single();
          
        setUser({
          email: user.email || '',
          name: profile?.display_name || 'Admin',
          role: profile?.role || 'admin',
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
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarHeader className="border-b border-sidebar-border/50 py-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="hover:bg-transparent">
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <span className="font-bold">NV</span>
              </div>
              <div className="flex flex-col gap-0.5 leading-none">
                <span className="font-bold tracking-tight text-lg text-sidebar-foreground">NERVE</span>
                <span className="text-xs text-sidebar-foreground/50">Tickle Admin</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      
      <SidebarContent className="py-4">
        <SidebarMenu>
          {navItems.map((item) => {
            const isActive = pathname === item.url || (item.url !== "/" && pathname.startsWith(item.url));
            return (
              <SidebarMenuItem key={item.name}>
                <SidebarMenuButton 
                  asChild 
                  isActive={isActive}
                  tooltip={item.name}
                  className="hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                >
                  <Link href={item.url}>
                    <item.icon className="size-4" />
                    <span>{item.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarContent>
      
      <SidebarFooter className="border-t border-sidebar-border/50 p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  size="lg"
                  className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                >
                  <Avatar className="h-8 w-8 rounded-md bg-sidebar-accent border border-sidebar-border">
                    <AvatarFallback className="rounded-md bg-transparent text-sidebar-foreground">
                      {user?.name?.substring(0, 2).toUpperCase() || 'AD'}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user?.name || 'Loading...'}</span>
                    <span className="truncate text-xs text-sidebar-foreground/50 capitalize">{user?.role || ''}</span>
                  </div>
                  <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/50" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg bg-popover border-border"
                side="bottom"
                align="end"
                sideOffset={4}
              >
                <DropdownMenuLabel className="p-0 font-normal">
                  <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                    <Avatar className="h-8 w-8 rounded-md bg-muted">
                      <AvatarFallback className="rounded-md bg-transparent">
                        {user?.name?.substring(0, 2).toUpperCase() || 'AD'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="grid flex-1 text-left text-sm leading-tight">
                      <span className="truncate font-medium">{user?.name}</span>
                      <span className="truncate text-xs text-muted-foreground">{user?.email}</span>
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem className="text-muted-foreground focus:bg-muted focus:text-foreground">
                  <Settings className="mr-2 size-4" />
                  Account Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-border" />
                <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
