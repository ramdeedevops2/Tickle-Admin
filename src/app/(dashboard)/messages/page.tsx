"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MessageSquare, RefreshCw } from "lucide-react";

type MessageRow = {
  id: string;
  match_id: string;
  sender_id: string;
  content: string;
  read: boolean;
  created_at: string;
};

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
}

function shortId(value: string) {
  return value.length > 12 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export default function MessagesPage() {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const supabase = createClient();

  const loadMessages = async () => {
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from("messages")
      .select("id, match_id, sender_id, content, read, created_at")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      setError(error.message);
      setMessages([]);
    } else {
      setMessages((data ?? []) as MessageRow[]);
    }

    setLoading(false);
  };

  useEffect(() => {
    loadMessages();
  }, []);

  const stats = useMemo(() => {
    const unread = messages.filter((message) => !message.read).length;
    return {
      total: messages.length,
      unread,
      read: messages.length - unread,
    };
  }, [messages]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Messages</h2>
          <p className="text-muted-foreground">
            Review the app&apos;s message stream from the `public.messages`
            table.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={loadMessages}
          className="rounded-none border-border/50 text-xs tracking-[0.2em] uppercase"
        >
          <RefreshCw className="mr-2 size-4" />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Messages
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {stats.total}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Unread
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {stats.unread}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Read
            </CardTitle>
          </CardHeader>
          <CardContent className="text-3xl font-black tracking-tight">
            {stats.read}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border border-border/50 bg-card">
        <Table>
          <TableHeader>
            <TableRow className="border-border/50 hover:bg-transparent">
              <TableHead className="w-70">Message</TableHead>
              <TableHead>Match</TableHead>
              <TableHead>Sender</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Sent</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  Loading messages...
                </TableCell>
              </TableRow>
            ) : error ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-destructive"
                >
                  {error}
                </TableCell>
              </TableRow>
            ) : messages.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-24 text-center text-muted-foreground"
                >
                  No messages found.
                </TableCell>
              </TableRow>
            ) : (
              messages.map((message) => (
                <TableRow key={message.id} className="border-border/50">
                  <TableCell>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="size-4 text-muted-foreground" />
                        <span className="font-medium">
                          {shortId(message.id)}
                        </span>
                      </div>
                      <p className="max-w-md truncate text-sm text-muted-foreground">
                        {message.content}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {shortId(message.match_id)}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {shortId(message.sender_id)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={message.read ? "secondary" : "default"}
                      className={
                        message.read
                          ? "bg-muted text-muted-foreground hover:bg-muted"
                          : "bg-primary text-primary-foreground hover:bg-primary/80"
                      }
                    >
                      {message.read ? "Read" : "Unread"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {formatDateTime(message.created_at)}
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
