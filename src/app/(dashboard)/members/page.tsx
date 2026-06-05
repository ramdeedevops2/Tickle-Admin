"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MoreHorizontal, Ban, Eye, UserMinus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function MembersPage() {
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetchMembers = async () => {
      // In a real app with proper admin RLS or a service role endpoint,
      // we would fetch from `auth.users` combined with `public.profiles`.
      // For now, we fetch from public.profiles
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (data) {
        setMembers(data);
      }
      setLoading(false);
    };

    fetchMembers();
  }, [supabase]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Members</h2>
          <p className="text-muted-foreground">
            Manage all registered users on the platform.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-border/50 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="w-20">Profile</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Age</TableHead>
              <TableHead>Gender</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading members...
                </TableCell>
              </TableRow>
            ) : members.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-24 text-center text-muted-foreground"
                >
                  No members found.
                </TableCell>
              </TableRow>
            ) : (
              members.map((member) => (
                <TableRow key={member.id} className="border-border/50">
                  <TableCell>
                    <Avatar className="h-10 w-10 border border-border">
                      <AvatarImage src={member.photos?.[0] || ""} />
                      <AvatarFallback className="bg-muted text-muted-foreground">
                        {member.name?.substring(0, 2).toUpperCase() || "US"}
                      </AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell className="font-medium">
                    {member.name || "Unknown"}
                  </TableCell>
                  <TableCell>{member.age || "—"}</TableCell>
                  <TableCell className="capitalize">
                    {member.gender || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={member.is_online ? "default" : "secondary"}
                      className={
                        member.is_online
                          ? "bg-primary text-primary-foreground hover:bg-primary/80"
                          : ""
                      }
                    >
                      {member.is_online ? "Online" : "Offline"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button variant="ghost" className="h-8 w-8 p-0">
                            <span className="sr-only">Open menu</span>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        }
                      />
                      <DropdownMenuContent
                        align="end"
                        className="bg-popover border-border"
                      >
                        <DropdownMenuLabel>Actions</DropdownMenuLabel>
                        <DropdownMenuItem className="cursor-pointer focus:bg-muted">
                          <Eye className="mr-2 h-4 w-4" />
                          View Profile
                        </DropdownMenuItem>
                        <DropdownMenuSeparator className="bg-border/50" />
                        <DropdownMenuItem className="cursor-pointer text-warning focus:bg-warning/10 focus:text-warning">
                          <Ban className="mr-2 h-4 w-4" />
                          Suspend User
                        </DropdownMenuItem>
                        <DropdownMenuItem className="cursor-pointer text-destructive focus:bg-destructive/10 focus:text-destructive">
                          <UserMinus className="mr-2 h-4 w-4" />
                          Delete Account
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
